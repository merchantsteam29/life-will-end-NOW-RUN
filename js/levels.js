// The story's chapters, built from a short script each.
//
// A builder walks a cursor through the level, facing one of four directions (it starts facing -z):
// floor(len) lays a platform ahead, gap(len) leaves a hole, turn(±1) turns the route right or left,
// wallrun(len, side) puts a runnable wall beside a hole, climb(...) makes steps up, arena(...) a wide
// fighting floor with cover, lockArena(...) one that shuts behind you and sends waves until they're dead.
// hookGap(len) is a hole with a grapple ring over it, zip(len) a cable to ride. enemy(type, dx, dy, back)
// places someone relative to the cursor (dx to the right, back = metres behind it).
// Distances are in metres: a flat jump covers ~8 m, with the air jump ~13 m, plus a dash ~18 m,
// a wall-run ~16 m, a pad lifts ~9 m, a grapple crosses ~30 m.

export const KIND = { floor: 0, wall: 1, run: 2, deco: 3, pad: 4, bar: 5, glass: 6, gate: 7 };
// the four headings: forward (x, z) for each
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const yawOf = (F) => Math.atan2(-F[0], -F[1]);

export class Builder {
  constructor() {
    this.c = { x: 0, y: 0, z: 0 }; this.h = 0;
    this.boxes = []; this.enemies = []; this.checkpoints = []; this.says = []; this.movers = []; this.signs = [];
    this.hooks = []; this.zips = []; this.arenas = []; this.gates = []; this.runs = [];
    this.exit = null; this.spawn = { x: 0, y: 0.05, z: 0 };
    this.lastW = 6;
  }
  get F() { return DIRS[this.h]; }
  get R() { return DIRS[(this.h + 1) % 4]; }
  // a world point from cursor-relative offsets: u to the right, f ahead, y up
  at(u = 0, f = 0, y = 0) { const { c } = this, F = this.F, R = this.R; return [c.x + u * R[0] + f * F[0], c.y + y, c.z + u * R[1] + f * F[1]]; }
  adv(len) { this.c.x += this.F[0] * len; this.c.z += this.F[1] * len; return this; }
  box(x0, y0, z0, x1, y1, z1, kind = KIND.floor, extra = {}) {
    const b = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], kind, ...extra };
    if (kind === KIND.gate) this.gates.push(b); else this.boxes.push(b);
    return b;
  }
  // a box from two cursor-relative corners
  boxL(u0, y0, f0, u1, y1, f1, kind = KIND.floor, extra = {}) { const a = this.at(u0, f0, y0), b = this.at(u1, f1, y1); return this.box(a[0], a[1], a[2], b[0], b[1], b[2], kind, extra); }

  // a platform from the cursor forward
  floor(len, { w = 6, t = 1.2, x = 0, kind = KIND.floor } = {}) {
    this.lastW = w;
    this.boxL(x - w / 2, -t, 0, x + w / 2, 0, len, kind);
    this.adv(len); this.floorEnd = this.at(0, 0); this.floorH = this.h; return this;
  }
  glass(len, opts = {}) { return this.floor(len, { ...opts, kind: KIND.glass, t: 0.3 }); }
  gap(len, dy = 0) { this.adv(len); this.c.y += dy; return this; }
  shift(dx) { const R = this.R; this.c.x += R[0] * dx; this.c.z += R[1] * dx; return this; }
  up(dy) { this.c.y += dy; return this; }
  // turn right (+1) or left (-1) at the end of the last floor: the new way out leaves from its side
  turn(side, w = this.lastW) {
    this.adv(-w / 2); this.h = (this.h + side + 4) % 4;
    // a checkpoint just before the corner faces the new way out
    for (const cp of this.checkpoints) if (Math.hypot(cp.p[0] - this.c.x, cp.p[2] - this.c.z) < w / 2 + 5 && Math.abs(cp.p[1] - this.c.y) < 1) cp.yaw = yawOf(this.F);
    return this.adv(w / 2);
  }
  // a runnable wall beside a gap (side -1 left, +1 right); the floor ends and you run along the wall
  wallrun(len, side, { off = 2.9, h = 9, dy = 0 } = {}) {
    const u = side * off;
    this.boxL(u - 0.5, -4, -1, u + 0.5, h, len + 1, KIND.run);
    // (for the route tests: chains of walls from the floor you jump off)
    const fe = this.floorEnd, here = this.at(0, 0), last = this.runs.at(-1);
    const along = fe ? (here[0] - fe[0]) * this.F[0] + (here[2] - fe[2]) * this.F[1] : 0;
    if (fe && this.floorH === this.h && last && last.from === fe) last.walls.push({ side, s: along, e: along + len });
    else if (fe && this.floorH === this.h) this.runs.push({ from: fe, f: this.F.slice(), y0: this.c.y, walls: [{ side, s: along, e: along + len }] });
    this.adv(len); this.c.y += dy; return this;
  }
  // walls one after another on alternating sides: jump between them
  zigzag(n, len, first = -1, opts = {}) {
    let side = first;
    for (let i = 0; i < n; i++) { this.wallrun(len, side, opts); this.adv(1.5); side = -side; }
    return this;
  }
  // steps up: n steps of `rise` metres, `run` metres deep
  climb(n, rise, run = 4, w = 6) {
    for (let i = 0; i < n; i++) { this.c.y += rise; this.floor(run, { w }); if (i < n - 1) this.adv(1.8); }
    return this;
  }
  // a wide floor with cover blocks (kept clear of the points in `keep`, as [dx, back] from the far end)
  arena(len, w = 18, cover = 4, seed = 1, keep = []) {
    this.floor(len, { w });
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < cover; i++) {
      const cu = (rnd() - 0.5) * (w - 4), back = 3 + rnd() * (len - 6), cw = 1.4 + rnd() * 2.2, ch = 1.2 + rnd() * 1.6;
      if (keep.some(([u, b]) => Math.abs(u - cu) < cw / 2 + 1.4 && Math.abs(b - back) < 2.4)) continue;
      this.boxL(cu - cw / 2, 0, -back - 0.8, cu + cw / 2, ch, -back + 0.8, KIND.wall);
    }
    return this;
  }
  // an arena that locks: energy gates close both ends once you're in, waves come in one after another,
  // the gates open when the last one's dead. A checkpoint sits just inside. Waves list [type, dx, dy, back].
  lockArena(len, w, waves, { cover = 4, seed = 1, h = 10, name = '' } = {}) {
    const keep = waves.flat().filter((e) => !e[2]).map((e) => [e[1], Math.min(e[3], len - 11)]);
    this.arena(len, w, cover, seed, keep);
    const g1 = this.boxL(-w / 2, 0, -len - 0.2, w / 2, h, -len + 0.4, KIND.gate);
    const g2 = this.boxL(-w / 2, 0, -0.4, w / 2, h, 0.2, KIND.gate);
    this.checkpoints.push({ p: this.at(0, -len + 2, 0.05), yaw: yawOf(this.F), i: this.checkpoints.length });
    const a = this.at(-w / 2 + 0.3, -len + 4.5), b = this.at(w / 2 - 0.3, -0.5), y = this.c.y;
    this.arenas.push({
      name, zone: { min: [Math.min(a[0], b[0]), y - 2, Math.min(a[2], b[2])], max: [Math.max(a[0], b[0]), y + 9, Math.max(a[2], b[2])] },
      // (nobody appears within ~9 m of the way in, where you'll be standing)
      gates: [g1, g2], waves: waves.map((wv) => wv.map(([type, dx, dy, back]) => ({ type, p: this.at(dx, -Math.min(back, len - 11), dy) }))),
    });
    return this;
  }
  // a beam you have to slide under, `back` metres behind the cursor (on the last floor)
  slideBar(back = 3, w = this.lastW) {
    this.boxL(-w / 2 - 0.5, 1.15, -back - 0.6, w / 2 + 0.5, 3.2, -back + 0.6, KIND.bar);
    // side walls so you can't just go round it
    this.boxL(-w / 2 - 1.5, 0, -back - 0.6, -w / 2 - 0.5, 4, -back + 0.6, KIND.wall);
    this.boxL(w / 2 + 0.5, 0, -back - 0.6, w / 2 + 1.5, 4, -back + 0.6, KIND.wall);
    return this;
  }
  // a tall wall across the path you can only get over with the launch pad in front of it
  padWall(h = 7) {
    this.boxL(-1, 0, -4.5, 1, 0.25, -2.5, KIND.pad);
    this.boxL(-this.lastW / 2, 0, -1, this.lastW / 2, h, 0, KIND.wall);
    return this;
  }
  pad(back = 2, x = 0) { this.boxL(x - 1, 0, -back - 1, x + 1, 0.25, -back + 1, KIND.pad); return this; }
  // a platform sliding across a gap of `len`: axis 'x' side to side, 'y' up and down, 'f' to and fro along the route
  mover(len, { axis = 'x', amp = 4, period = 3.2, w = 4, d = 4 } = {}) {
    const f = len / 2;
    const b = this.boxL(-w / 2, -0.8, f - d / 2, w / 2, 0, f + d / 2, KIND.floor, {});
    const wax = axis === 'y' ? 'y' : (axis === 'x' ? this.R : this.F)[0] !== 0 ? 'x' : 'z';
    b.mover = { axis: wax, amp, period, ph: this.movers.length * 1.3 };
    b.base = [b.min.slice(), b.max.slice()];
    this.movers.push(b);
    return this.adv(len);
  }
  // a grapple ring: look at it and hook on (dx right, dy up, back metres behind the cursor)
  hook(dx = 0, dy = 5, back = 0) { this.hooks.push({ p: this.at(dx, -back, dy) }); return this; }
  // a hole with a ring hanging over its middle
  hookGap(len, { h = 5, dy = 0, dx = 0 } = {}) {
    this.hook(dx, h + Math.max(0, dy) * 0.5, -len * 0.45);
    Object.assign(this.hooks.at(-1), { f: this.F.slice(), gap: len, y0: this.c.y, dy, edge: this.at(0, 0) }); // (for the route tests)
    return this.gap(len, dy);
  }
  // a cable from here to `len` ahead (it drops by -dy): jump up and grab it, ride it to the end
  zip(len, { dy = -3, h = 3.6, dx = 0 } = {}) {
    const a = this.at(dx, -3, h), b = this.at(dx, len + 1, h + dy);
    this.zips.push({ a, b, f: this.F.slice(), y0: this.c.y, dy, run: len, edge: this.at(0, 0) });
    this.adv(len); this.c.y += dy; return this;
  }
  pillar(dx, back, h = 3, w = 1.6) { this.boxL(dx - w / 2, 0, -back - w / 2, dx + w / 2, h, -back + w / 2, KIND.wall); return this; }
  enemy(type, dx = 0, dy = 0, back = 0, opts = {}) {
    // wardens placed up high get a ledge to stand on
    if (dy > 0.5 && !['drone', 'seeker'].includes(type)) this.boxL(dx - 1.3, dy - 0.5, -back - 1.3, dx + 1.3, dy, -back + 1.3, KIND.floor);
    this.enemies.push({ type, p: this.at(dx, -back, dy), ...opts }); return this;
  }
  checkpoint(back = 1) { this.checkpoints.push({ p: this.at(0, -back, 0.05), yaw: yawOf(this.F), i: this.checkpoints.length }); return this; }
  say(lines, back = 0) { this.says.push({ p: this.at(0, -back), f: this.F.slice(), lines }); return this; }
  sign(text, dx, dy, back, color = '#ff2f6d', size = 3) {
    const R = this.R, F = this.F, s = dx < 0 ? 1 : dx > 0 ? -1 : 0;
    const n = s ? [R[0] * s, R[1] * s] : [-F[0], -F[1]];
    this.signs.push({ text, p: this.at(dx, -back, dy), color, size, yaw: Math.atan2(n[0], n[1]) }); return this;
  }
  end() { this.exit = { p: this.at(0, -3) }; return this; }
  start(y = 0) { this.c = { x: 0, y, z: 0 }; this.h = 0; this.spawn = { x: 0, y: y + 0.05, z: -2 }; return this; }
}

// ------------------------------------------------------------------ the chapters
// Wren (your handler) talks you through it; HALCYON (the city's flood AI) answers back.
const W = (t) => ({ who: 'WREN', t }), H = (t) => ({ who: 'HALCYON', t }), Y = (t) => ({ who: 'YOU', t });

export const CHAPTERS = [
  {
    id: 1, name: 'LAST DELIVERY', sub: 'Rooftops of the Lower Ring', sky: 0x0b0716, fog: [0x140a24, 0.012], neon: 0xff2f6d, accent: 0x2fe8ff, rain: 1, par: 200,
    build(B) {
      B.start(0).floor(16, { w: 7 });
      B.say([W('Courier. You hear me? The flood sirens went off ten minutes ago.'), W('HALCYON is opening the sea gates. The whole Lower Ring goes under at dawn.'), W('Get to the Spire. Run. Jump the gaps, I\'ll talk you through the rest.')], 12);
      B.sign('LIFE WILL END', -4.5, 5, 6, '#ff2f6d', 2.6);
      B.gap(4).floor(10).gap(5).floor(12);
      B.turn(1).floor(10).gap(6).floor(12).checkpoint(6);
      B.say([W('Walls. Jump at one and keep moving: you\'ll run along it.'), W('Jump again to kick off.')], 6);
      B.gap(1).wallrun(14, -1).floor(10).checkpoint(8);
      B.gap(2).wallrun(14, 1).gap(1).floor(10);
      B.say([W('Low pipe ahead. Slide under it: {slide} while you\'re running.')], 6);
      B.slideBar(3).floor(10).checkpoint(6);
      B.turn(-1).floor(8);
      B.say([W('Tide wardens. They shoot slow, glowing rounds. Dodge them.'), W('One hit and you\'re done, but so are they. {shoot} to shoot, {blade} to cut.')], 4);
      B.arena(26, 16, 4, 3).enemy('gunner', -4, 0, 10).enemy('gunner', 5, 0, 18);
      B.checkpoint(4).gap(4).floor(6);
      B.say([W('Your blade can knock their shots back if you swing as they arrive. Practice on that one.')], 4);
      B.gap(6).floor(14).enemy('gunner', 0, 0, 9);
      B.checkpoint(4).gap(3).climb(3, 2.2, 4);
      B.say([W('Long one coming. Jump, then jump again at the top: {jump} twice.')], 2);
      B.floor(6).gap(10).floor(10).checkpoint(6);
      B.gap(5, -3).floor(12).enemy('gunner', -2, 0, 3).gap(6).floor(10).enemy('gunner', 2, 0, 4);
      B.turn(1).floor(8).checkpoint(4);
      B.gap(2).zigzag(2, 12, -1).floor(14).checkpoint(7);
      B.say([W('Launch pad. Step on it and it throws you over the wall.')], 6);
      B.floor(4).padWall(7).up(7).floor(10).enemy('gunner', -2, 0, 3).enemy('gunner', 3, 0, 6).checkpoint(9);
      B.gap(4).floor(6).turn(-1).floor(10);
      B.say([W('They\'ve sealed the roof ahead. You\'ll have to clear it to get out.'), H('COURIER. STAY. THE WATER WILL BE GENTLE.')], 6);
      B.lockArena(32, 18, [
        [['gunner', -5, 0, 12], ['gunner', 5, 0, 16]],
        [['gunner', -6, 0, 8], ['gunner', 0, 0, 22], ['gunner', 6, 0, 10]],
      ], { cover: 5, seed: 4 });
      B.floor(6).checkpoint(4);
      B.gap(4).wallrun(16, 1, { dy: 1 }).gap(1).floor(10).slideBar(4).floor(8).enemy('gunner', 0, 0, 2);
      B.checkpoint(14).gap(6).floor(8).gap(7, -2).floor(12);
      B.say([W('The lift to Cable Street is at the end. Go.')], 8);
      B.end();
    },
  },
  {
    id: 2, name: 'CABLE STREET', sub: 'Between the towers', sky: 0x060a18, fog: [0x0a1428, 0.011], neon: 0x2fe8ff, accent: 0xff2f6d, rain: 1, par: 240,
    build(B) {
      B.start(40).floor(12, { w: 6 });
      B.say([W('Cable Street. Nothing touches the water here, so nothing stops.'), H('COURIER. YOU ARE CARRYING NOTHING. THERE IS NOTHING LEFT TO DELIVER.'), W('Ignore it. Drones ahead: they hover and fire in pairs.')], 8);
      B.gap(2).zigzag(3, 11, -1).floor(14).checkpoint(7);
      B.enemy('drone', 0, 4, 2);
      B.say([W('Dash: {dash}. Straight where you\'re going, even in the air.')], 6);
      B.gap(10).floor(8).checkpoint(6);
      B.say([W('See the ring hanging over that gap? Look at it and press {hook}.'), W('The line pulls you in and lets go. Keep your speed and fly.')], 6);
      B.floor(4).hookGap(22, { h: 5 }).floor(14).checkpoint(8);
      B.hookGap(26, { h: 6, dy: 2 }).floor(14).turn(1).floor(10);
      B.arena(22, 12, 3, 7).enemy('drone', -3, 5, 8).enemy('gunner', 3, 0, 14).enemy('drone', 4, 6, 18);
      B.checkpoint(3).gap(2).wallrun(16, -1, { dy: 2 }).gap(1).floor(8);
      B.say([W('The old cable cars ran on these lines. Jump up and grab one. {jump} lets go.')], 6);
      B.floor(4).zip(34, { dy: -4 }).floor(12).checkpoint(8);
      B.say([W('Launch pads still work. Step on one.')], 6);
      B.floor(4).padWall(7).up(7).floor(10).checkpoint(8);
      B.gap(2).zigzag(4, 10, 1, { dy: 0 }).floor(14).enemy('gunner', -2, 0, 4).enemy('gunner', 2, 0, 7);
      B.turn(-1).floor(8).checkpoint(5);
      B.zip(30, { dy: -3 }).floor(10).hookGap(22, { h: 5 }).floor(14).enemy('drone', 0, 5, 4).checkpoint(7);
      B.floor(6);
      B.say([W('Junction tower. They\'ll lock it down when you\'re in. Drones, a whole swarm.'), W('Use the ring in the middle: get above them.')], 4);
      B.lockArena(32, 18, [
        [['drone', -5, 5, 12], ['drone', 5, 5, 18], ['gunner', 0, 0, 22]],
        [['drone', -6, 6, 8], ['drone', 6, 6, 8], ['drone', 0, 7, 20], ['gunner', -5, 0, 24]],
        [['gunner', -6, 0, 6], ['gunner', 6, 0, 6], ['drone', 0, 8, 14], ['drone', -4, 6, 24]],
      ], { cover: 4, seed: 12 });
      B.hook(0, 9, 16);
      B.floor(6).checkpoint(4);
      B.gap(7).floor(6).gap(8).floor(12).enemy('drone', 0, 5, 6);
      B.turn(1).floor(8).zip(28, { dy: -3 }).floor(10).checkpoint(5);
      B.hookGap(24, { h: 5 }).floor(14).hookGap(24, { h: 5 }).floor(14).enemy('gunner', 0, 0, 6).enemy('drone', -3, 5, 10);
      B.checkpoint(12);
      B.say([W('Lift\'s ahead. You\'re doing better than the last three couriers.'), Y('What happened to the last three?'), W('Run.')], 6);
      B.end();
    },
  },
  {
    id: 3, name: 'THE FLOODWORKS', sub: 'Pump halls under the Ring', sky: 0x04100e, fog: [0x061a16, 0.016], neon: 0x45ff9a, accent: 0xffb02f, rain: 0, par: 270,
    build(B) {
      B.start(-6).floor(12, { w: 8 });
      B.say([W('The Floodworks. HALCYON\'s pumps. The platforms here move: time your jumps.'), H('THE WATER IS NOT CRUEL. IT IS ONLY LEVEL.')], 8);
      B.gap(1).mover(10, { axis: 'x', amp: 4 }).floor(8).checkpoint(6);
      B.mover(10, { axis: 'y', amp: 3, period: 3.6 }).mover(10, { axis: 'x', amp: 5, period: 2.8 }).floor(10).checkpoint(8);
      B.say([W('Shield wardens. Bullets bounce off the front. Get round them, or get close and cut.')], 4);
      B.arena(28, 16, 5, 11).enemy('shield', 0, 0, 10).enemy('gunner', -5, 0, 20).enemy('gunner', 5, 0, 20);
      B.checkpoint(4).slideBar(2).floor(6).gap(3).wallrun(14, 1).wallrun(12, -1, { off: 3.4 }).floor(10).checkpoint(6);
      B.turn(1).floor(8);
      B.mover(12, { axis: 'f', amp: 3, period: 3 }).floor(4).mover(12, { axis: 'y', amp: 4, period: 3 }).floor(10).checkpoint(8);
      B.say([W('Big one. Heavy warden: armour soaks three shots, and it fires a spread.'), W('The blade goes straight through the armour.')], 4);
      B.arena(24, 14, 4, 5).enemy('heavy', 0, 0, 14).enemy('shield', -4, 0, 8).enemy('drone', 3, 5, 18);
      B.checkpoint(3).gap(3).climb(4, 2.4, 4, 6).gap(6).floor(10);
      B.say([W('Focus: hold {focus}. Everything slows down for you. Kills fill it back up.')], 6);
      B.turn(-1).floor(8).checkpoint(4);
      B.hookGap(24, { h: 5 }).floor(14).mover(12, { axis: 'x', amp: 5, period: 2.6 }).floor(10).checkpoint(7);
      B.gap(2).zigzag(3, 11, 1).floor(14).slideBar(3).floor(10).enemy('shield', 0, 0, 4).enemy('gunner', -2, 0, 9);
      B.checkpoint(12).gap(4, -3).floor(10);
      B.say([W('Main pump hall. They\'re waiting in there. Lots of them.'), H('YOU ARE FAST. THE TIDE IS PATIENT.')], 6);
      B.lockArena(34, 20, [
        [['shield', -4, 0, 14], ['shield', 4, 0, 14], ['gunner', 0, 0, 26]],
        [['heavy', 0, 0, 22], ['drone', -6, 6, 12], ['drone', 6, 6, 12]],
        [['heavy', -6, 0, 10], ['shield', 6, 0, 18], ['gunner', -7, 0, 26], ['gunner', 7, 0, 26]],
      ], { cover: 6, seed: 21 });
      B.floor(6).checkpoint(4);
      B.mover(12, { axis: 'y', amp: 3, period: 2.8 }).floor(4).mover(12, { axis: 'f', amp: 3, period: 2.6 }).floor(10).checkpoint(6);
      B.turn(1).floor(8).zip(30, { dy: -4 }).floor(10).checkpoint(6);
      B.floor(4).padWall(8).up(8).floor(12).enemy('heavy', 0, 0, 4);
      B.checkpoint(10).gap(5).floor(12);
      B.say([W('Outflow\'s ahead. That\'s your way out.')], 6);
      B.end();
    },
  },
  {
    id: 4, name: 'NEON MARKET', sub: 'The stilts of Saint Ilse', sky: 0x12061a, fog: [0x1c0a26, 0.012], neon: 0xffd23a, accent: 0xff2f6d, rain: 1, par: 290,
    build(B) {
      B.start(10).floor(12, { w: 8 });
      B.say([W('Saint Ilse market. Snipers on the signs: when you see the red line, move.'), H('THE MARKET IS CLOSED. THE MARKET HAS ALWAYS BEEN CLOSED.')], 8);
      B.sign('OPEN 24H', 6, 6, 4, '#ffd23a', 2.2);
      B.arena(30, 18, 6, 21).enemy('sniper', 0, 6, 26).enemy('gunner', -6, 0, 12).enemy('gunner', 6, 0, 16).pillar(0, 26, 5, 2.4);
      B.checkpoint(3).gap(2).zigzag(2, 12, -1).floor(14).checkpoint(6);
      B.arena(20, 12, 3, 9).enemy('charger', 0, 0, 10).enemy('charger', -3, 0, 14);
      B.say([W('Chargers. They don\'t shoot. They don\'t stop. Cut them before they reach you.')], 18);
      B.checkpoint(3).gap(4).floor(6).padWall(8).up(8).floor(8).checkpoint(6);
      B.turn(1).floor(8);
      B.gap(2).wallrun(18, 1, { dy: 2 }).floor(6).gap(8).floor(16).enemy('sniper', 4, 7, 4).enemy('drone', -3, 5, 10).enemy('gunner', 0, 0, 6);
      B.checkpoint(14).gap(3).slideBar(0).floor(4).floor(10).enemy('turret', 0, 0, 2);
      B.say([W('Turret. It never stops firing. Use the cover, then get close.')], 8);
      B.checkpoint(9).gap(4).climb(3, 2.6, 5, 7).floor(8);
      B.sign('NOW RUN', -5, 4, 4, '#ff2f6d', 2.4);
      B.turn(-1).floor(8).checkpoint(4);
      B.say([W('Mortars on the roofs. Watch the ground: a red ring is where the shell lands.')], 2);
      B.arena(26, 14, 4, 31).enemy('mortar', 0, 0, 22).enemy('gunner', -4, 0, 12).enemy('charger', 3, 0, 16);
      B.checkpoint(3).hookGap(24, { h: 5 }).floor(14).zip(30, { dy: -3 }).floor(10).checkpoint(6);
      B.gap(2).zigzag(3, 11, -1).floor(14).enemy('sniper', 0, 8, -14);
      B.turn(1).floor(8).checkpoint(4);
      B.say([W('The square. Everything they have in the market is in there.'), H('BUY NOTHING. SELL NOTHING. SINK.')], 2);
      B.lockArena(36, 20, [
        [['charger', -5, 0, 20], ['charger', 5, 0, 20], ['gunner', 0, 0, 28]],
        [['mortar', 0, 0, 30], ['gunner', -7, 0, 14], ['gunner', 7, 0, 14], ['drone', 0, 6, 20]],
        [['turret', 0, 0, 26], ['charger', -6, 0, 10], ['charger', 6, 0, 10], ['sniper', -7, 0, 30]],
      ], { cover: 7, seed: 41 });
      B.floor(6).checkpoint(4);
      B.gap(5).floor(8).mover(12, { axis: 'x', amp: 4, period: 2.8 }).floor(10).checkpoint(6);
      B.floor(4).padWall(8).up(8).floor(12).enemy('mortar', 0, 0, 2).enemy('gunner', -3, 0, 6);
      B.checkpoint(10).gap(4).wallrun(16, -1, { dy: 1 }).gap(1).floor(12);
      B.say([W('Rail yard\'s ahead. The old line runs right to the Spire.')], 6);
      B.end();
    },
  },
  {
    id: 5, name: 'THE DROWNED LINE', sub: 'The old metro, half under water', sky: 0x040c14, fog: [0x071722, 0.015], neon: 0x3fb8ff, accent: 0xffd23a, rain: 1, par: 290,
    build(B) {
      B.start(14).floor(14, { w: 6 });
      B.say([W('The elevated line. It used to carry a million people a day.'), H('THE TRAINS STILL RUN. ON TIME. FOR NO ONE.'), W('Seekers on this stretch: little drones that dive at you and burst. Shoot them early or cut them.')], 10);
      B.gap(4).floor(10).gap(6).floor(12).enemy('seeker', 0, 4, 2).checkpoint(8);
      B.say([W('Carriages on the track. Ride them across.')], 2);
      B.mover(14, { axis: 'f', amp: 4, period: 3.2, w: 4, d: 6 }).floor(6).mover(14, { axis: 'f', amp: 4, period: 2.8, w: 4, d: 6 }).floor(10).checkpoint(6);
      B.zip(34, { dy: -4 }).floor(10).enemy('gunner', 0, 0, 3).enemy('seeker', -3, 5, 6);
      B.turn(-1).floor(8).checkpoint(4);
      B.gap(2).wallrun(16, 1).gap(1).wallrun(14, -1, { off: 3.2 }).floor(10).checkpoint(6);
      B.arena(24, 12, 3, 51).enemy('seeker', -3, 5, 16).enemy('seeker', 3, 5, 18).enemy('gunner', 0, 0, 20).enemy('shield', 0, 0, 10);
      B.checkpoint(3).hookGap(24, { h: 5 }).floor(14).hookGap(26, { h: 6, dy: 2 }).floor(14).checkpoint(6);
      B.say([W('Station ahead. Platform 9. They\'ll shut the doors when you\'re in.')], 4);
      B.floor(6);
      B.lockArena(34, 18, [
        [['seeker', -5, 4, 18], ['seeker', 5, 4, 18], ['gunner', 0, 0, 26]],
        [['heavy', 0, 0, 24], ['seeker', -6, 5, 10], ['seeker', 6, 5, 10], ['drone', 0, 6, 16]],
        [['shield', -4, 0, 12], ['shield', 4, 0, 12], ['mortar', 0, 0, 28], ['seeker', 0, 6, 20]],
      ], { cover: 5, seed: 53 });
      B.floor(6).checkpoint(4);
      B.turn(1).floor(8).slideBar(3).floor(8);
      B.zip(32, { dy: -3 }).floor(10).zip(28, { dy: -3 }).floor(10).checkpoint(7).enemy('sniper', 0, 8, -18);
      B.mover(14, { axis: 'x', amp: 4, period: 2.6, d: 5 }).floor(4).mover(14, { axis: 'f', amp: 4, period: 2.4, d: 6 }).floor(12).checkpoint(8);
      B.say([W('The line goes under here. Down the stairs, along the flooded tunnel.')], 4);
      B.gap(3, -3).floor(6).gap(3, -3).floor(16, { w: 8 }).enemy('gunner', -2, 0, 4).enemy('charger', 2, 0, 8);
      B.checkpoint(14).floor(6).slideBar(3).floor(10).turn(-1).floor(10).enemy('turret', 0, 0, 2);
      B.checkpoint(9).gap(3).climb(3, 2.4, 4).floor(4).padWall(8).up(8).floor(10).checkpoint(8);
      B.gap(2).zigzag(3, 11, 1).floor(14).enemy('seeker', -2, 5, 2).enemy('seeker', 2, 5, 4);
      B.checkpoint(8).hookGap(24, { h: 5 }).floor(14);
      B.say([W('End of the line. The Glasshouse is up there.')], 8);
      B.end();
    },
  },
  {
    id: 6, name: 'GLASSHOUSE', sub: 'The hanging gardens of the rich', sky: 0x061210, fog: [0x0c1e18, 0.011], neon: 0x8dff6a, accent: 0xff6ad5, rain: 0, par: 300,
    build(B) {
      B.start(60).floor(12, { w: 8 });
      B.say([W('The Glasshouse. The people who built HALCYON lived up here.'), W('They left the gardens running. And the guards.'), H('THEY ASKED ME TO KEEP THE WATER OUT. ONLY UP HERE.')], 8);
      B.sign('GLASSHOUSE', 5, 5, 6, '#8dff6a', 2.4);
      B.glass(10, { w: 6 }).gap(5).glass(10, { w: 6 }).checkpoint(5);
      B.hookGap(24, { h: 5 }).floor(14).hookGap(24, { h: 4, dy: -2 }).glass(12).checkpoint(8);
      B.arena(26, 14, 4, 61).enemy('gunner', -4, 0, 10).enemy('gunner', 4, 0, 12).enemy('mortar', 0, 0, 22);
      B.checkpoint(3).turn(1).floor(8);
      B.mover(12, { axis: 'y', amp: 3, period: 3 }).mover(12, { axis: 'x', amp: 4, period: 2.6 }).glass(10).checkpoint(6);
      B.gap(2).wallrun(16, -1, { dy: 2 }).gap(1).floor(6).slideBar(2).floor(8);
      B.say([W('The orchard. Lots of them, and lots of glass. Keep moving.')], 4);
      B.lockArena(34, 20, [
        [['gunner', -6, 0, 14], ['gunner', 6, 0, 14], ['seeker', 0, 5, 24]],
        [['sniper', 0, 0, 30], ['charger', -5, 0, 14], ['charger', 5, 0, 14], ['drone', 0, 6, 20]],
        [['heavy', -5, 0, 20], ['heavy', 5, 0, 20], ['seeker', -7, 5, 10], ['seeker', 7, 5, 10]],
      ], { cover: 7, seed: 66 });
      B.hook(-6, 8, 17).hook(6, 8, 17);
      B.floor(6).checkpoint(4);
      B.turn(-1).floor(8).zip(30, { dy: -2 }).glass(12).hookGap(26, { h: 6, dy: 2 }).floor(14).checkpoint(6);
      B.gap(2).zigzag(4, 10, -1).floor(14).enemy('sniper', 0, 6, -12).checkpoint(8);
      B.floor(6).padWall(8).up(8).glass(12).enemy('gunner', -2, 0, 4).enemy('gunner', 2, 0, 8).checkpoint(10);
      B.mover(12, { axis: 'f', amp: 3, period: 2.6 }).floor(4).mover(12, { axis: 'x', amp: 5, period: 2.4 }).floor(10).checkpoint(6);
      B.turn(1).floor(8);
      B.arena(24, 14, 5, 68).enemy('turret', 0, 0, 20).enemy('shield', -3, 0, 10).enemy('seeker', 3, 5, 14);
      B.checkpoint(3).gap(4).climb(3, 2.4, 4).hookGap(24, { h: 6, dy: 2 }).floor(14);
      B.say([W('That\'s the base of the Spire. Get out on the outside.')], 8);
      B.end();
    },
  },
  {
    id: 7, name: 'SPIRE ASCENT', sub: 'The outside of the tower', sky: 0x0a0a14, fog: [0x10101e, 0.009], neon: 0x9b6bff, accent: 0x2fe8ff, rain: 1, par: 300,
    build(B) {
      B.start(80).floor(10, { w: 6 });
      B.say([W('The Spire. Straight up the outside. Don\'t look down.'), H('THERE IS NOTHING AT THE TOP BUT ME.'), Y('That\'s who I\'m coming for.')], 6);
      B.gap(2).wallrun(14, -1, { dy: 2 }).floor(6).checkpoint(4);
      B.climb(3, 2.6, 4, 5).gap(2).wallrun(14, 1, { dy: 2 }).floor(8).checkpoint(6).enemy('drone', 0, 5, 2);
      B.floor(4).padWall(9).up(9).floor(10).checkpoint(8);
      B.arena(22, 14, 3, 13).enemy('charger', -3, 0, 8).enemy('shield', 3, 0, 14).enemy('sniper', 0, 6, 20);
      B.checkpoint(3).turn(1).floor(8);
      B.hookGap(22, { h: 7, dy: 4 }).floor(14).hookGap(22, { h: 7, dy: 4 }).floor(14).checkpoint(5);
      B.gap(2).zigzag(4, 10, -1).floor(14).checkpoint(6).climb(2, 2.4, 4, 6);
      B.mover(12, { axis: 'y', amp: 4, period: 2.6 }).floor(6).mover(12, { axis: 'x', amp: 5, period: 2.4 }).floor(10).checkpoint(8);
      B.arena(26, 16, 5, 17).enemy('turret', 0, 0, 22).enemy('gunner', -5, 0, 10).enemy('gunner', 5, 0, 12).enemy('drone', 0, 6, 16).enemy('charger', 0, 0, 6);
      B.checkpoint(3).turn(-1).floor(8);
      B.say([W('Maintenance ledge. They\'re dropping in from the top.')], 4);
      B.lockArena(30, 16, [
        [['seeker', -4, 5, 12], ['seeker', 4, 5, 12], ['gunner', 0, 0, 22]],
        [['heavy', 0, 0, 20], ['mortar', 0, 0, 26], ['drone', -5, 6, 10], ['drone', 5, 6, 10]],
      ], { cover: 4, seed: 71 });
      B.floor(6).checkpoint(4);
      B.floor(4).padWall(9).up(9).floor(8).hookGap(22, { h: 7, dy: 4 }).floor(14).checkpoint(6);
      B.gap(2).wallrun(16, 1, { dy: 2 }).gap(1).wallrun(14, -1, { dy: 1, off: 3.2 }).floor(10).enemy('sniper', 0, 8, -16).checkpoint(8);
      B.turn(1).floor(8).zip(30, { dy: -2 }).floor(10).climb(3, 2.4, 4).floor(6).checkpoint(5);
      B.say([W('The core is through that door. HALCYON\'s heart. One more hall to cross.')], 4);
      B.gap(3).wallrun(18, 1, { dy: 2 }).floor(14).end();
    },
  },
  {
    id: 8, name: 'THE CHOIR', sub: 'Inside the Spire', sky: 0x08040c, fog: [0x140814, 0.014], neon: 0xff4a3a, accent: 0x2fe8ff, rain: 0, par: 300,
    build(B) {
      B.start(120).floor(12, { w: 8 });
      B.say([W('You\'re inside. These are HALCYON\'s server halls. It hears everything in here.'), H('LISTEN. THIS IS WHAT A CITY SOUNDS LIKE WHEN IT IS ASLEEP.'), H('I SING IT TO SLEEP EVERY NIGHT. TONIGHT IT WILL NOT WAKE.')], 8);
      B.gap(4).floor(10).slideBar(3).floor(8).checkpoint(4);
      B.lockArena(30, 16, [
        [['gunner', -5, 0, 14], ['gunner', 5, 0, 14], ['shield', 0, 0, 22]],
        [['charger', -4, 0, 12], ['charger', 4, 0, 12], ['drone', 0, 6, 18], ['sniper', 0, 0, 26]],
      ], { cover: 5, seed: 81, name: 'FIRST HALL' });
      B.floor(6).checkpoint(4);
      B.turn(1).floor(8).hookGap(24, { h: 5 }).floor(14).mover(12, { axis: 'f', amp: 3, period: 2.4 }).floor(10).checkpoint(6);
      B.gap(2).zigzag(3, 11, -1).floor(14).enemy('heavy', 0, 0, 4).checkpoint(8);
      B.say([W('Second hall. It\'s throwing everything at you now.')], 4);
      B.lockArena(34, 20, [
        [['seeker', -6, 5, 16], ['seeker', 6, 5, 16], ['seeker', 0, 6, 24], ['gunner', 0, 0, 28]],
        [['mortar', -7, 0, 28], ['mortar', 7, 0, 28], ['shield', 0, 0, 16]],
        [['heavy', -5, 0, 14], ['heavy', 5, 0, 14], ['drone', -7, 6, 24], ['drone', 7, 6, 24]],
      ], { cover: 6, seed: 82, name: 'SECOND HALL' });
      B.hook(0, 9, 17);
      B.floor(6).checkpoint(4);
      B.turn(-1).floor(8).zip(30, { dy: -3 }).floor(10).padWall(8).up(8).floor(10).checkpoint(8);
      B.gap(2).wallrun(16, 1, { dy: 2 }).gap(1).floor(6).mover(12, { axis: 'y', amp: 4, period: 2.6 }).floor(10).checkpoint(6);
      B.hookGap(24, { h: 6, dy: 2 }).floor(14).enemy('turret', 0, 0, 2).checkpoint(6);
      B.turn(1).floor(8);
      B.say([W('Last hall before the crown. I won\'t lie, Courier: this is the big one.'), Y('You\'ve never lied to me.'), W('...Run.')], 4);
      B.lockArena(38, 22, [
        [['gunner', -7, 0, 18], ['gunner', 7, 0, 18], ['charger', -3, 0, 24], ['charger', 3, 0, 24]],
        [['sniper', -8, 0, 32], ['sniper', 8, 0, 32], ['seeker', -5, 6, 12], ['seeker', 5, 6, 12], ['shield', 0, 0, 20]],
        [['turret', 0, 0, 30], ['heavy', -6, 0, 16], ['heavy', 6, 0, 16], ['drone', 0, 7, 22]],
        [['mortar', -8, 0, 30], ['mortar', 8, 0, 30], ['seeker', 0, 6, 14], ['charger', -5, 0, 10], ['charger', 5, 0, 10]],
      ], { cover: 7, seed: 83, name: 'THE GREAT HALL' });
      B.hook(-7, 9, 19).hook(7, 9, 19);
      B.floor(6).checkpoint(4);
      B.climb(4, 2.4, 4).gap(3).floor(14);
      B.say([W('That\'s the lift to the crown. Everything up there feeds the core.')], 8);
      B.end();
    },
  },
  {
    id: 9, name: 'HALCYON', sub: 'The top of the Spire', sky: 0x02020a, fog: [0x08061a, 0.01], neon: 0xff2f6d, accent: 0x2fe8ff, rain: 0, par: 240, boss: true,
    build(B) {
      B.start(140).floor(10, { w: 8 });
      B.say([H('COURIER. YOU HAVE COME A LONG WAY TO DROWN WITH THEM.'), W('The crown\'s a climb from here. Then the core.')], 6);
      B.gap(4).floor(8).hookGap(24, { h: 6, dy: 2 }).floor(14).checkpoint(5);
      B.gap(2).zigzag(3, 11, 1).floor(14).enemy('seeker', -2, 5, 2).enemy('seeker', 2, 5, 4).checkpoint(8);
      B.floor(4).padWall(9).up(9).floor(10).checkpoint(8);
      B.say([W('Four pylons feed the core. Break them, then the core opens. Then cut it.'), W('It\'ll shoot back. Keep moving. I\'m right here.')], 6);
      B.checkpoint(4).gap(2).floor(4, { w: 8 });
      // the crown: a square floor around the core, a pylon on a block in each corner
      const C = 24, y = B.c.y, center = B.at(0, C);
      B.boxL(-26, -1.2, C - 26, 26, 0, C + 26); // the floor of the crown
      const corners = [[-15, -15], [15, -15], [-15, 15], [15, 15]];
      for (const [pu, pf] of corners) {
        const f = C + pf;
        B.boxL(pu - 3, 0, f - 3, pu + 3, 4, f + 3, KIND.wall);
        B.boxL(pu - 3.5, 4, f - 3.5, pu + 3.5, 4.3, f + 3.5);
        B.boxL(pu - 1, 0, f - 6, pu + 1, 0.25, f - 4, KIND.pad);
      }
      // three walls (runnable): the way in stays open
      B.boxL(-26, 0, C + 25.5, 26, 10, C + 26.5, KIND.run);
      B.boxL(-26.5, 0, C - 26, -25.5, 10, C + 26, KIND.run);
      B.boxL(25.5, 0, C - 26, 26.5, 10, C + 26, KIND.run);
      B.boxL(-4, 0, C - 4, 4, 2, C + 4, KIND.wall); // the core's plinth
      // rings to swing between the pylons
      for (const [hu, hf] of [[0, -15], [-15, 0], [15, 0], [0, 15]]) B.hooks.push({ p: B.at(hu, C + hf, 9) });
      B.enemies.push({ type: 'core', p: [center[0], y + 6, center[2]] });
      for (const [pu, pf] of corners) B.enemies.push({ type: 'pylon', p: B.at(pu, C + pf, 4.3) });
      B.adv(C + 30);
      B.exit = null; // the chapter ends when the core dies
      B.bossArena = { x: center[0], y, z: center[2], r: 26 };
    },
  },
];

export function buildChapter(ch) {
  const B = new Builder();
  ch.build(B);
  // the lowest point: the water sits well below it
  let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const b of B.boxes) { minY = Math.min(minY, b.min[1]); minX = Math.min(minX, b.min[0]); maxX = Math.max(maxX, b.max[0]); minZ = Math.min(minZ, b.min[2]); maxZ = Math.max(maxZ, b.max[2]); }
  return { ...B, water: minY - 14, killY: minY - 10, bounds: { minX, maxX, minZ, maxZ } };
}
