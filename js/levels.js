// The story's chapters, built from a short script each. The path runs toward -z.
//
// A builder walks a cursor through the level: floor(len) lays a platform ahead, gap(len) leaves a hole,
// wallrun(len, side) puts a runnable wall beside a hole, climb(...) makes steps up, arena(...) a wide
// fighting floor with cover. enemy(type, dx, dy, dz) places someone relative to the cursor. Distances are
// in metres: a flat jump covers ~6 m, with the air jump ~12 m, a wall-run ~17 m.

export const KIND = { floor: 0, wall: 1, run: 2, deco: 3, pad: 4, bar: 5, glass: 6 };

export class Builder {
  constructor() {
    this.c = { x: 0, y: 0, z: 0 };
    this.boxes = []; this.enemies = []; this.checkpoints = []; this.says = []; this.movers = []; this.signs = [];
    this.exit = null; this.spawn = { x: 0, y: 0.05, z: 0 };
    this.lastW = 6;
  }
  box(x0, y0, z0, x1, y1, z1, kind = KIND.floor, extra = {}) {
    const b = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], kind, ...extra };
    this.boxes.push(b); return b;
  }
  // a platform from the cursor forward
  floor(len, { w = 6, t = 1.2, x = 0 } = {}) {
    const { c } = this; this.lastW = w;
    this.box(c.x + x - w / 2, c.y - t, c.z, c.x + x + w / 2, c.y, c.z - len);
    c.z -= len; return this;
  }
  gap(len, dy = 0) { this.c.z -= len; this.c.y += dy; return this; }
  shift(dx) { this.c.x += dx; return this; }
  up(dy) { this.c.y += dy; return this; }
  // a runnable wall beside a gap (side -1 left, +1 right); the floor ends and you run along the wall
  wallrun(len, side, { off = 2.9, h = 9, dy = 0 } = {}) {
    const { c } = this, x = c.x + side * off;
    this.box(x - 0.5, c.y - 4, c.z + 1, x + 0.5, c.y + h, c.z - len - 1, KIND.run);
    c.z -= len; c.y += dy; return this;
  }
  // two walls one after another on alternating sides: jump between them
  zigzag(n, len, first = -1, opts = {}) {
    let side = first;
    for (let i = 0; i < n; i++) { this.wallrun(len, side, opts); this.c.z -= 1.5; side = -side; }
    return this;
  }
  // steps up: n steps of `rise` metres, `run` metres deep
  climb(n, rise, run = 4, w = 6) {
    for (let i = 0; i < n; i++) { this.c.y += rise; this.floor(run, { w }); if (i < n - 1) this.c.z -= 1.8; }
    return this;
  }
  // a wide floor with cover blocks; returns this (place enemies after with enemy())
  arena(len, w = 18, cover = 4, seed = 1) {
    const { c } = this, z0 = c.z;
    this.floor(len, { w });
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < cover; i++) {
      const cx = c.x + (rnd() - 0.5) * (w - 4), cz = z0 - 3 - rnd() * (len - 6), cw = 1.4 + rnd() * 2.2, ch = 1.2 + rnd() * 1.6;
      this.box(cx - cw / 2, c.y, cz - 0.8, cx + cw / 2, c.y + ch, cz + 0.8, KIND.wall);
    }
    return this;
  }
  // a beam you have to slide under, `back` metres behind the cursor (on the last floor)
  slideBar(back = 3, w = this.lastW) {
    const { c } = this;
    this.box(c.x - w / 2 - 0.5, c.y + 1.15, c.z + back - 0.6, c.x + w / 2 + 0.5, c.y + 3.2, c.z + back + 0.6, KIND.bar);
    // side walls so you can't just go round it
    this.box(c.x - w / 2 - 1.5, c.y, c.z + back - 0.6, c.x - w / 2 - 0.5, c.y + 4, c.z + back + 0.6, KIND.wall);
    this.box(c.x + w / 2 + 0.5, c.y, c.z + back - 0.6, c.x + w / 2 + 1.5, c.y + 4, c.z + back + 0.6, KIND.wall);
    return this;
  }
  // a tall wall across the path you can only get over with the launch pad in front of it
  padWall(h = 7) {
    const { c } = this;
    this.box(c.x - 1, c.y, c.z + 4.5, c.x + 1, c.y + 0.25, c.z + 2.5, KIND.pad);
    this.box(c.x - this.lastW / 2, c.y, c.z + 1, c.x + this.lastW / 2, c.y + h, c.z, KIND.wall);
    return this;
  }
  pad(back = 2, x = 0) { const { c } = this; this.box(c.x + x - 1, c.y, c.z + back + 1, c.x + x + 1, c.y + 0.25, c.z + back - 1, KIND.pad); return this; }
  // a platform sliding side to side (axis 'x') or up and down ('y') across a gap of `len`
  mover(len, { axis = 'x', amp = 4, period = 3.2, w = 4, d = 4 } = {}) {
    const { c } = this, z = c.z - len / 2;
    const b = this.box(c.x - w / 2, c.y - 0.8, z + d / 2, c.x + w / 2, c.y, z - d / 2, KIND.floor, { mover: { axis, amp, period, ph: this.movers.length * 1.3 } });
    b.base = [b.min.slice(), b.max.slice()];
    this.movers.push(b);
    c.z -= len; return this;
  }
  pillar(dx, dzBack, h = 3, w = 1.6) { const { c } = this; this.box(c.x + dx - w / 2, c.y, c.z + dzBack - w / 2, c.x + dx + w / 2, c.y + h, c.z + dzBack + w / 2, KIND.wall); return this; }
  enemy(type, dx = 0, dy = 0, dzBack = 0, opts = {}) { const { c } = this; this.enemies.push({ type, p: [c.x + dx, c.y + dy, c.z + dzBack], ...opts }); return this; }
  checkpoint(back = 1) { const { c } = this; this.checkpoints.push({ p: [c.x, c.y + 0.05, c.z + back], i: this.checkpoints.length }); return this; }
  say(lines, back = 0) { this.says.push({ z: this.c.z + back, lines }); return this; }
  sign(text, dx, dy, dzBack, color = '#ff2f6d', size = 3) { const { c } = this; this.signs.push({ text, p: [c.x + dx, c.y + dy, c.z + dzBack], color, size }); return this; }
  end() { const { c } = this; this.exit = { p: [c.x, c.y, c.z + 3] }; return this; }
  start(y = 0) { this.c = { x: 0, y, z: 0 }; this.spawn = { x: 0, y: y + 0.05, z: -2 }; return this; }
}

// ------------------------------------------------------------------ the chapters
// Wren (your handler) talks you through it; HALCYON (the city's flood AI) answers back.
const W = (t) => ({ who: 'WREN', t }), H = (t) => ({ who: 'HALCYON', t }), Y = (t) => ({ who: 'YOU', t });

export const CHAPTERS = [
  {
    id: 1, name: 'LAST DELIVERY', sub: 'Rooftops of the Lower Ring', sky: 0x0b0716, fog: [0x140a24, 0.012], neon: 0xff2f6d, accent: 0x2fe8ff, rain: 1, par: 75,
    build(B) {
      B.start(0).floor(16, { w: 7 });
      B.say([W('Courier. You hear me? The flood sirens went off ten minutes ago.'), W('HALCYON is opening the sea gates. The whole Lower Ring goes under at dawn.'), W('Get to the Spire. Run. Jump the gaps, I\'ll talk you through the rest.')], 12);
      B.sign('LIFE WILL END', -4.5, 5, 6, '#ff2f6d', 2.6);
      B.gap(4).floor(10).gap(5).floor(10);
      B.say([W('Walls. Jump at one and keep moving: you\'ll run along it.'), W('Jump again to kick off.')], 6);
      B.checkpoint(8).gap(1).wallrun(14, -1).floor(10).checkpoint(8);
      B.gap(2).wallrun(14, 1).gap(1).floor(8);
      B.say([W('Low pipe ahead. Slide under it: {slide} while you\'re running.')], 4);
      B.slideBar(3).floor(8).checkpoint(6);
      B.say([W('Tide wardens. They shoot slow, glowing rounds. Dodge them.'), W('One hit and you\'re done, but so are they. {shoot} to shoot, {blade} to cut.')], 4);
      B.arena(26, 16, 4, 3).enemy('gunner', -4, 0, 10).enemy('gunner', 5, 0, 18);
      B.checkpoint(4).gap(4).floor(6);
      B.say([W('Your blade can knock their shots back if you swing as they arrive. Practice on that one.')], 4);
      B.gap(6, 0).floor(14).enemy('gunner', 0, 0, 9);
      B.checkpoint(4).gap(3).climb(3, 2.2, 4);
      B.say([W('The lift to Cable Street is at the end. Go.')], 2);
      B.gap(5).floor(10).end();
    },
  },
  {
    id: 2, name: 'CABLE STREET', sub: 'Between the towers', sky: 0x060a18, fog: [0x0a1428, 0.011], neon: 0x2fe8ff, accent: 0xff2f6d, rain: 1, par: 90,
    build(B) {
      B.start(40).floor(12, { w: 6 });
      B.say([W('Cable Street. Nothing touches the water here, so nothing stops.'), H('COURIER. YOU ARE CARRYING NOTHING. THERE IS NOTHING LEFT TO DELIVER.'), W('Ignore it. Drones ahead: they hover and fire in pairs.')], 8);
      B.gap(2).zigzag(3, 11, -1).floor(10).checkpoint(7);
      B.enemy('drone', 0, 4, 2);
      B.say([W('Dash: {dash}. Straight where you\'re going, even in the air.')], 6);
      B.gap(10).floor(8).checkpoint(6);
      B.arena(22, 12, 3, 7).enemy('drone', -3, 5, 8).enemy('gunner', 3, 0, 14).enemy('drone', 4, 6, 18);
      B.checkpoint(3).gap(2).wallrun(16, -1, { dy: 2 }).gap(1).floor(6);
      B.say([W('Launch pads still work. Step on one.')], 3);
      B.floor(8).padWall(7).up(7).floor(10).checkpoint(8);
      B.gap(2).zigzag(4, 10, 1, { dy: 0 }).floor(10).enemy('gunner', -2, 0, 4).enemy('gunner', 2, 0, 7);
      B.checkpoint(8).gap(7).floor(6).gap(8).floor(12).enemy('drone', 0, 5, 6);
      B.say([W('Lift\'s ahead. You\'re doing better than the last three couriers.'), Y('What happened to the last three?'), W('Run.')], 5);
      B.end();
    },
  },
  {
    id: 3, name: 'THE FLOODWORKS', sub: 'Pump halls under the Ring', sky: 0x04100e, fog: [0x061a16, 0.016], neon: 0x45ff9a, accent: 0xffb02f, rain: 0, par: 110,
    build(B) {
      B.start(-6).floor(12, { w: 8 });
      B.say([W('The Floodworks. HALCYON\'s pumps. The platforms here move: time your jumps.'), H('THE WATER IS NOT CRUEL. IT IS ONLY LEVEL.')], 8);
      B.gap(1).mover(10, { axis: 'x', amp: 4 }).floor(8).checkpoint(6);
      B.mover(10, { axis: 'y', amp: 3, period: 3.6 }).mover(10, { axis: 'x', amp: 5, period: 2.8 }).floor(10).checkpoint(8);
      B.say([W('Shield wardens. Bullets bounce off the front. Get round them, or get close and cut.')], 4);
      B.arena(28, 16, 5, 11).enemy('shield', 0, 0, 10).enemy('gunner', -5, 0, 20).enemy('gunner', 5, 0, 20);
      B.checkpoint(4).slideBar(2).floor(6).gap(3).wallrun(14, 1).wallrun(12, -1, { off: 3.4 }).floor(8).checkpoint(6);
      B.mover(12, { axis: 'x', amp: 5, period: 3 }).floor(4).mover(12, { axis: 'y', amp: 4, period: 3 }).floor(10).checkpoint(8);
      B.arena(24, 14, 4, 5).enemy('shield', -3, 0, 8).enemy('shield', 3, 0, 14).enemy('drone', 0, 5, 18);
      B.say([W('Focus: hold {focus}. Everything slows down for you. Kills fill it back up.')], 0);
      B.checkpoint(3).gap(3).climb(4, 2.4, 4, 6).gap(6).floor(10);
      B.say([H('YOU ARE FAST. THE TIDE IS PATIENT.')], 4);
      B.end();
    },
  },
  {
    id: 4, name: 'NEON MARKET', sub: 'The stilts of Saint Ilse', sky: 0x12061a, fog: [0x1c0a26, 0.012], neon: 0xffd23a, accent: 0xff2f6d, rain: 1, par: 120,
    build(B) {
      B.start(10).floor(12, { w: 8 });
      B.say([W('Saint Ilse market. Snipers on the signs: when you see the red line, move.'), H('THE MARKET IS CLOSED. THE MARKET HAS ALWAYS BEEN CLOSED.')], 8);
      B.sign('OPEN 24H', 6, 6, 4, '#ffd23a', 2.2);
      B.arena(30, 18, 6, 21).enemy('sniper', 0, 6, 26).enemy('gunner', -6, 0, 12).enemy('gunner', 6, 0, 16).pillar(0, 26, 5, 2.4);
      B.checkpoint(3).gap(2).zigzag(2, 12, -1).floor(8).checkpoint(6);
      B.arena(20, 12, 3, 9).enemy('charger', 0, 0, 10).enemy('charger', -3, 0, 14);
      B.say([W('Chargers. They don\'t shoot. They don\'t stop. Cut them before they reach you.')], 18);
      B.checkpoint(3).gap(4).floor(6).padWall(8).up(8).floor(8).checkpoint(6);
      B.gap(2).wallrun(18, 1, { dy: 2 }).floor(6).gap(8).floor(16).enemy('sniper', 4, 7, 4).enemy('drone', -3, 5, 10).enemy('gunner', 0, 0, 6);
      B.checkpoint(14).gap(3).slideBar(0).floor(4).floor(10).enemy('turret', 0, 0, 2);
      B.say([W('Turret. It never stops firing. Use the cover, then get close.')], 8);
      B.checkpoint(9).gap(4).climb(3, 2.6, 5, 7).floor(8);
      B.sign('NOW RUN', -5, 4, 4, '#ff2f6d', 2.4);
      B.end();
    },
  },
  {
    id: 5, name: 'SPIRE ASCENT', sub: 'The outside of the tower', sky: 0x0a0a14, fog: [0x10101e, 0.009], neon: 0x9b6bff, accent: 0x2fe8ff, rain: 1, par: 140,
    build(B) {
      B.start(80).floor(10, { w: 6 });
      B.say([W('The Spire. Straight up the outside. Don\'t look down.'), H('THERE IS NOTHING AT THE TOP BUT ME.'), Y('That\'s who I\'m coming for.')], 6);
      B.gap(2).wallrun(14, -1, { dy: 2 }).floor(6).checkpoint(4);
      B.climb(3, 2.6, 4, 5).gap(2).wallrun(14, 1, { dy: 2 }).floor(8).checkpoint(6).enemy('drone', 0, 5, 2);
      B.floor(4).padWall(9).up(9).floor(10).checkpoint(8);
      B.arena(22, 14, 3, 13).enemy('charger', -3, 0, 8).enemy('shield', 3, 0, 14).enemy('sniper', 0, 6, 20);
      B.checkpoint(3).gap(2).zigzag(4, 10, -1).floor(8).checkpoint(6).climb(2, 2.4, 4, 6);
      B.mover(12, { axis: 'y', amp: 4, period: 2.6 }).floor(6).mover(12, { axis: 'x', amp: 5, period: 2.4 }).floor(10).checkpoint(8);
      B.arena(26, 16, 5, 17).enemy('turret', 0, 0, 22).enemy('gunner', -5, 0, 10).enemy('gunner', 5, 0, 12).enemy('drone', 0, 6, 16).enemy('charger', 0, 0, 6);
      B.say([W('The core is through that door. HALCYON\'s heart. Last stretch.')], 4);
      B.checkpoint(3).gap(3).wallrun(18, 1, { dy: 2 }).floor(10).end();
    },
  },
  {
    id: 6, name: 'HALCYON', sub: 'The top of the Spire', sky: 0x02020a, fog: [0x08061a, 0.01], neon: 0xff2f6d, accent: 0x2fe8ff, rain: 0, par: 120, boss: true,
    build(B) {
      B.start(140).floor(10, { w: 8 });
      B.say([H('COURIER. YOU HAVE COME A LONG WAY TO DROWN WITH THEM.'), W('Four pylons feed the core. Break them, then the core opens. Then cut it.'), W('It\'ll shoot back. Keep moving. I\'m right here.')], 6);
      B.checkpoint(4).gap(2).floor(4, { w: 8 });
      // the arena: a ring of platforms around the core
      const { c } = B, cx = c.x, cz = c.z - 24, y = c.y;
      B.box(cx - 26, y - 1.2, cz - 26, cx + 26, y, cz + 26); // the floor of the crown
      for (const [px, pz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) {
        B.box(cx + px - 3, y, cz + pz - 3, cx + px + 3, y + 4, cz + pz + 3, KIND.wall);
        B.box(cx + px - 3.5, y + 4, cz + pz - 3.5, cx + px + 3.5, y + 4.3, cz + pz + 3.5);
        B.box(cx + px - 1, y, cz + pz + 4, cx + px + 1, y + 0.25, cz + pz + 6, KIND.pad);
      }
      for (const [wx, wz, w, d] of [[0, -26, 52, 1], [-26, 0, 1, 52], [26, 0, 1, 52]]) // three walls: the way in stays open B.box(cx + wx - w / 2, y, cz + wz - d / 2, cx + wx + w / 2, y + 10, cz + wz + d / 2, KIND.run);
      B.box(cx - 4, y, cz - 4, cx + 4, y + 2, cz + 4, KIND.wall); // the core's plinth
      B.enemies.push({ type: 'core', p: [cx, y + 6, cz] });
      for (const [px, pz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) B.enemies.push({ type: 'pylon', p: [cx + px, y + 4.3, cz + pz] });
      B.c.z = cz - 30;
      B.exit = null; // the chapter ends when the core dies
      B.bossArena = { x: cx, y, z: cz, r: 26 };
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
