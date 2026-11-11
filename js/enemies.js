// HALCYON's tide wardens, their bullets, and your gun and blade.
// One hit kills on both sides. Their shots are slow, glowing and can be cut back at them.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ray against an axis-aligned box: distance or Infinity
export function rayBox(o, d, b, max = Infinity) {
  let t0 = 0, t1 = max;
  for (let a = 0; a < 3; a++) {
    const oa = a === 0 ? o.x : a === 1 ? o.y : o.z, da = a === 0 ? d.x : a === 1 ? d.y : d.z;
    if (Math.abs(da) < 1e-9) { if (oa < b.min[a] || oa > b.max[a]) return Infinity; continue; }
    let ta = (b.min[a] - oa) / da, tb = (b.max[a] - oa) / da; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return Infinity;
  }
  return t0;
}
export function rayWorld(o, d, boxes, max) { let best = max; for (const b of boxes) { const t = rayBox(o, d, b, best); if (t < best) best = t; } return best; }

const TYPES = {
  gunner: { hp: 1, r: 0.55, h: 1.9, cd: [1.4, 2.0], tele: 0.5, speed: 24, range: 55, score: 100 },
  drone: { hp: 1, r: 0.6, h: 0.9, cd: [2.0, 2.6], tele: 0.45, speed: 22, range: 50, fly: true, score: 120 },
  sniper: { hp: 1, r: 0.55, h: 2.0, cd: [3.0, 3.6], tele: 1.1, speed: 75, range: 120, score: 150 },
  shield: { hp: 1, r: 0.7, h: 2.0, cd: [1.8, 2.3], tele: 0.55, speed: 20, range: 30, shield: true, score: 150 },
  charger: { hp: 1, r: 0.6, h: 1.6, cd: [0, 0], tele: 0, speed: 0, range: 35, melee: true, score: 120 },
  turret: { hp: 3, r: 0.8, h: 1.6, cd: [0.32, 0.32], tele: 0, speed: 26, range: 45, score: 200 },
  pylon: { hp: 6, r: 1.0, h: 3.2, cd: [1.6, 2.2], tele: 0.4, speed: 18, range: 70, score: 250 },
  core: { hp: 3, r: 2.4, h: 4.8, cd: [2.4, 2.4], tele: 0.6, speed: 15, range: 90, boss: true, score: 2000 },
};

function mat(color, emissive, ei = 1.6) { return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.5, metalness: 0.4 }); }
function buildModel(type, neon) {
  const g = new THREE.Group(), body = mat(0x1a1c24, 0x000000, 0), glow = mat(0x220008, neon, 2.4);
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  let eye = null, extra = null;
  if (type === 'drone') {
    add(new THREE.SphereGeometry(0.45, 16, 12), body);
    const ring = add(new THREE.TorusGeometry(0.7, 0.06, 6, 24), glow); ring.rotation.x = Math.PI / 2; extra = ring;
    eye = add(new THREE.SphereGeometry(0.14, 10, 8), glow, 0, 0, -0.4);
  } else if (type === 'turret') {
    add(new THREE.CylinderGeometry(0.8, 1.0, 0.8, 12), body, 0, 0.4);
    const head = new THREE.Group(); head.position.y = 1.1; g.add(head);
    head.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 1.0), body)));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8), body); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.9; head.add(barrel);
    eye = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.05), glow); eye.position.z = -0.52; head.add(eye); extra = head;
  } else if (type === 'pylon') {
    add(new THREE.CylinderGeometry(0.5, 0.9, 1.2, 6), body, 0, 0.6);
    eye = add(new THREE.OctahedronGeometry(0.9, 0), glow, 0, 2.2); eye.scale.y = 1.6; extra = eye;
  } else if (type === 'core') {
    eye = add(new THREE.SphereGeometry(2.0, 32, 24), mat(0x200010, neon, 3)); eye.position.y = 2.4;
    const shell = new THREE.Group(); shell.position.y = 2.4; g.add(shell);
    for (let i = 0; i < 6; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 0.3), body); const a = i / 6 * Math.PI * 2; pl.position.set(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5); pl.rotation.y = -a + Math.PI / 2; shell.add(pl); }
    extra = shell;
  } else {
    const big = type === 'shield' ? 1.15 : 1, tall = type === 'sniper' ? 1.1 : 1;
    const torso = add(new THREE.CapsuleGeometry(0.33 * big, 0.7 * tall, 4, 10), body, 0, 1.05 * tall);
    if (type === 'charger') { torso.rotation.x = 0.6; torso.position.z = -0.15; for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.08, 0.4, 5), glow, (i - 2) * 0.12, 1.5, 0.15).rotation.x = -0.6; }
    add(new THREE.CapsuleGeometry(0.12, 0.6, 4, 8), body, -0.16, 0.4); add(new THREE.CapsuleGeometry(0.12, 0.6, 4, 8), body, 0.16, 0.4);
    const head = add(new THREE.BoxGeometry(0.34, 0.34, 0.36), body, 0, 1.75 * tall - (type === 'charger' ? 0.25 : 0), type === 'charger' ? -0.35 : 0);
    eye = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.05), glow); eye.position.set(0, 0.03, -0.19); head.add(eye);
    if (type !== 'charger') { const gun = add(new THREE.BoxGeometry(0.1, 0.12, type === 'sniper' ? 1.4 : 0.7), body, 0.28, 1.15 * tall, -0.4); }
    if (type === 'shield') { extra = add(new THREE.BoxGeometry(1.3, 1.7, 0.12), mat(0x1a2a3a, 0x2fe8ff, 0.5), 0, 1.0, -0.6); extra.material.transparent = true; extra.material.opacity = 0.75; }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { g, eye, extra, glow };
}

export class Enemies {
  constructor(scene, neon) {
    this.scene = scene; this.neon = new THREE.Color(neon); this.list = []; this.bullets = [];
    this.group = new THREE.Group(); scene.add(this.group);
    this.bulletGeo = new THREE.SphereGeometry(0.16, 10, 8);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xff3050 }); this.bulletMat2 = new THREE.MeshBasicMaterial({ color: 0x5ff8ff });
    this.glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    this.laserMat = new THREE.LineBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.8 });
    this.sparks = [];
  }
  clear() { for (const e of this.list) this.group.remove(e.m.g); for (const b of this.bullets) this.group.remove(b.mesh); for (const s of this.sparks) this.group.remove(s.m); this.list = []; this.bullets = []; this.sparks = []; }
  spawn(def, idx) {
    const T = TYPES[def.type], m = buildModel(def.type, this.neon);
    m.g.position.set(...def.p); this.group.add(m.g);
    const e = { idx, type: def.type, T, m, pos: m.g.position, home: new THREE.Vector3(...def.p), hp: T.hp, dead: false, aware: false, cd: 1 + Math.random(), tele: 0, yaw: 0, burst: 0, t: Math.random() * 10, vel: new THREE.Vector3(), laser: null, shielded: def.type === 'core' };
    this.list.push(e); return e;
  }
  get live() { return this.list.filter((e) => !e.dead); }
  center(e) { return _v.set(e.pos.x, e.pos.y + (e.T.fly ? 0 : e.type === 'core' ? 2.4 : e.T.h * 0.55), e.pos.z).clone(); }

  // ---------- your attacks ----------
  // hitscan: the first wall or enemy along the ray
  shoot(o, d, boxes) {
    const wall = rayWorld(o, d, boxes, 200);
    let best = null, bt = wall;
    for (const e of this.list) {
      if (e.dead) continue;
      const c = this.center(e), r = e.T.r * (e.type === 'core' ? 1 : 1.1);
      _w.subVectors(c, o); const b = _w.dot(d); if (b < 0) continue;
      const cc = _w.lengthSq() - b * b; if (cc > r * r) continue;
      const t = b - Math.sqrt(r * r - cc); if (t < bt) { bt = t; best = e; }
    }
    const point = o.clone().addScaledVector(d, bt);
    if (!best) return { point, wall: bt < 200 };
    // shields stop shots from the front; the core is armoured while its pylons stand
    if (best.T.shield && Math.cos(best.yaw) * -d.z + Math.sin(best.yaw) * -d.x < -0.35) { this.spark(point, 0x5ff8ff); return { point, blocked: true }; }
    if (best.shielded) { this.spark(point, 0xff2f6d); return { point, blocked: true }; }
    const killed = this.damage(best, 1, 'gun');
    return { point, enemy: best, killed };
  }
  // the blade: everything close in front of you
  slash(o, fw, reach, boxes) {
    const hits = [];
    for (const e of this.list) {
      if (e.dead) continue;
      const c = this.center(e); _w.subVectors(c, o); const d = _w.length();
      if (d > reach + e.T.r) continue;
      const flat = new THREE.Vector3(_w.x, 0, _w.z).normalize(), f2 = new THREE.Vector3(fw.x, 0, fw.z).normalize();
      if (d > 1.2 && flat.dot(f2) < 0.45) continue;
      if (Math.abs(_w.y) > 3.2 && e.type !== 'core') continue;
      if (rayWorld(o, _w.clone().normalize(), boxes, d) < d - e.T.r - 0.3) continue;
      if (e.shielded) { this.spark(c, 0xff2f6d); continue; }
      hits.push(e);
    }
    for (const e of hits) this.damage(e, e.type === 'pylon' ? 6 : e.type === 'turret' ? 3 : 1, 'blade');
    return hits;
  }
  damage(e, n, how) {
    if (e.dead) return false;
    e.hp -= n; e.flash = 0.12; e.lastHow = how;
    if (e.hp > 0) { this.spark(this.center(e), 0xffffff, e.type === 'core' ? 40 : 10); if (e.type === 'core') { e.reshield = 5; this.onCoreHit?.(e); } return false; }
    this.kill(e, how); return true;
  }
  kill(e, how) {
    e.dead = true; e.dieT = 0; this.spark(this.center(e), this.neon.getHex(), 26); if (e.laser) { this.group.remove(e.laser); e.laser = null; }
    this.onKill?.(e, how);
  }
  spark(p, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      m.position.copy(p); m.scale.setScalar(0.25 + Math.random() * 0.3); this.group.add(m);
      this.sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8), life: 0.4 + Math.random() * 0.3 });
    }
  }

  // ---------- their turn ----------
  fire(e, from, target, speed, spread = 0) {
    const d = target.clone().sub(from).normalize();
    if (spread) d.add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.4, (Math.random() - 0.5) * spread)).normalize();
    const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff2040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.scale.setScalar(1.1); mesh.add(halo);
    mesh.position.copy(from); this.group.add(mesh);
    this.bullets.push({ mesh, halo, pos: mesh.position, vel: d.multiplyScalar(speed), life: 6, from: e, deflected: false, prev: from.clone() });
    this.onFire?.(e);
  }
  update(dt, P, boxes, focusK) {
    const eye = P.eye, pp = P.pos;
    for (const e of this.list) {
      e.t += dt;
      if (e.dead) {
        e.dieT += dt; e.m.g.rotation.x = Math.min(1.5, e.dieT * 5); e.m.g.position.y -= dt * (e.T.fly ? 6 : 1.5); e.m.g.scale.setScalar(Math.max(0.01, 1 - e.dieT * 1.2));
        if (e.dieT > 0.9) e.m.g.visible = false;
        continue;
      }
      if (e.flash > 0) e.flash -= dt;
      e.m.glow.emissiveIntensity = e.flash > 0 ? 6 : 2.4 + (e.tele > 0 ? 4 * (1 - e.tele / e.T.tele) : 0);
      const c = this.center(e), to = eye.clone().sub(c), dist = to.length(), dir = to.clone().divideScalar(dist || 1);
      // can it see you? (5 times a second)
      e.look = (e.look || 0) - dt;
      if (e.look <= 0) { e.look = 0.2; e.sees = P.alive && dist < e.T.range && rayWorld(c, dir, boxes, dist) >= dist - 0.6; if (e.sees) e.aware = true; }
      if (!e.aware) { if (e.T.fly) e.pos.y = e.home.y + Math.sin(e.t * 1.6) * 0.3; continue; }
      // face you
      const want = Math.atan2(-dir.x, -dir.z); let dy = want - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.yaw += dy * Math.min(1, dt * (e.type === 'turret' ? 3 : 8));
      if (e.type !== 'core' && e.type !== 'pylon') e.m.g.rotation.y = e.yaw;
      if (e.type === 'turret' && e.m.extra) { e.m.extra.rotation.y = 0; }
      // movement
      if (e.T.fly) {
        const side = Math.sin(e.t * 0.7) * 3;
        e.pos.x = e.home.x + Math.cos(e.yaw) * side; e.pos.z = e.home.z - Math.sin(e.yaw) * side; e.pos.y = e.home.y + Math.sin(e.t * 1.6) * 0.5;
        if (e.m.extra) e.m.extra.rotation.z += dt * 4;
      } else if (e.T.melee) {
        // charge straight at you along the ground; it stops at the edge of its platform
        const flat = new THREE.Vector3(pp.x - e.pos.x, 0, pp.z - e.pos.z), fd = flat.length();
        if (fd > 0.5 && e.sees !== false) {
          flat.divideScalar(fd);
          const nx = e.pos.x + flat.x * 9 * dt, nz = e.pos.z + flat.z * 9 * dt;
          if (boxes.some((b) => nx > b.min[0] && nx < b.max[0] && nz > b.min[2] && nz < b.max[2] && Math.abs(b.max[1] - e.pos.y) < 0.4)) { e.pos.x = nx; e.pos.z = nz; }
          e.m.g.position.y = e.home.y + Math.abs(Math.sin(e.t * 14)) * 0.12;
        }
        if (P.alive && fd < 1.15 && Math.abs(pp.y - e.pos.y) < 1.6) this.onTouch?.(e);
        continue;
      }
      if (e.type === 'pylon' && e.m.extra) e.m.extra.rotation.y += dt * 1.5;
      if (e.type === 'core') this.coreUpdate(e, dt, P, c);
      // shooting: a tell, then the shot
      if (!e.sees && e.tele <= 0) continue;
      e.cd -= dt;
      if (e.tele > 0) {
        e.tele -= dt;
        if (e.type === 'sniper') this.laser(e, c, eye);
        if (e.tele <= 0) {
          if (e.laser) { this.group.remove(e.laser); e.laser = null; }
          const lead = e.T.speed < 40 ? P.vel.clone().multiplyScalar(dist / e.T.speed * 0.5) : new THREE.Vector3();
          const tgt = eye.clone().add(lead); tgt.y -= 0.25;
          if (e.type === 'shield') for (let i = 0; i < 3; i++) this.fire(e, c, tgt, e.T.speed, 0.14);
          else if (e.type === 'drone') { this.fire(e, c, tgt, e.T.speed); setTimeout(() => !e.dead && P.alive && this.fire(e, this.center(e), P.eye, e.T.speed), 160); }
          else if (e.type === 'pylon') this.fire(e, c, tgt, e.T.speed);
          else if (e.type !== 'core') this.fire(e, c, tgt, e.T.speed, e.type === 'turret' ? 0.05 : 0);
          e.cd = e.T.cd[0] + Math.random() * (e.T.cd[1] - e.T.cd[0]);
        }
      } else if (e.cd <= 0 && e.sees) e.tele = e.T.tele || 0.001;
    }
    // bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.prev.copy(b.pos); b.pos.addScaledVector(b.vel, dt); b.life -= dt;
      const spd = b.vel.length(), d = b.vel.clone().divideScalar(spd);
      let gone = b.life <= 0 || rayWorld(b.prev, d, boxes, spd * dt) < spd * dt;
      if (b.deflected) {
        for (const e of this.list) if (!e.dead && this.center(e).distanceTo(b.pos) < e.T.r + 0.5) { if (!e.shielded) this.damage(e, e.type === 'pylon' ? 6 : 3, 'deflect'); gone = true; break; }
      } else if (P.alive && segPointDist(b.prev, b.pos, P.pos, P.h) < 0.42) { this.onHit?.(b); gone = true; }
      if (gone) { this.group.remove(b.mesh); this.bullets.splice(i, 1); if (b.life > 0) this.spark(b.pos, b.deflected ? 0x5ff8ff : 0xff2040, 5); }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) { const s = this.sparks[i]; s.life -= dt; s.v.y -= 14 * dt; s.m.position.addScaledVector(s.v, dt); s.m.material.opacity = Math.max(0, s.life * 2); if (s.life <= 0) { this.group.remove(s.m); s.m.material.dispose(); this.sparks.splice(i, 1); } }
  }
  laser(e, from, to) {
    if (!e.laser) { e.laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), this.laserMat); this.group.add(e.laser); }
    else e.laser.geometry.setFromPoints([from, to]);
  }
  // blade timed right: shots arriving in front of you go back where they came from
  deflect(eye, fw, reach = 3.4) {
    let n = 0;
    for (const b of this.bullets) {
      if (b.deflected) continue;
      _w.subVectors(b.pos, eye); const d = _w.length();
      if (d > reach || _w.normalize().dot(fw) < 0.2) continue;
      const tgt = b.from && !b.from.dead ? this.center(b.from) : b.pos.clone().addScaledVector(fw, 30);
      b.vel = tgt.sub(b.pos).normalize().multiplyScalar(Math.max(40, b.vel.length() * 1.4));
      b.deflected = true; b.mesh.material = this.bulletMat2; b.halo.material.color.setHex(0x5ff8ff); b.life = 3; n++;
    }
    return n;
  }
  // THE CORE: while its pylons stand it is shielded and fires rings; with them down it sinks to the
  // plinth and opens. Each cut re-arms it for a moment.
  coreUpdate(e, dt, P, c) {
    const pylons = this.list.filter((o) => o.type === 'pylon' && !o.dead).length;
    e.shielded = pylons > 0 || (e.reshield || 0) > 0;
    e.reshield = Math.max(0, (e.reshield || 0) - dt);
    const targetY = e.shielded ? e.home.y : e.home.y - 3.4;
    e.pos.y += (targetY - e.pos.y) * Math.min(1, dt * 1.5);
    if (e.m.extra) { e.m.extra.rotation.y += dt * (e.shielded ? 0.6 : 2.5); e.m.extra.children.forEach((p, i) => { const a = i / 6 * Math.PI * 2; const r = e.shielded ? 2.5 : 3.6; p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); }); }
    e.ring = (e.ring || 2) - dt;
    if (e.ring <= 0) {
      const hpK = (4 - e.hp) / 3; e.ring = 2.8 - hpK * 0.9;
      const n = 10 + Math.round(hpK * 8), off = Math.random() * 6.28, y = c.y - 0.5 + Math.random() * 1.5;
      for (let i = 0; i < n; i++) { const a = off + i / n * Math.PI * 2; this.fire(e, new THREE.Vector3(c.x + Math.cos(a) * 2.6, y, c.z + Math.sin(a) * 2.6), new THREE.Vector3(c.x + Math.cos(a) * 40, y - 1.2, c.z + Math.sin(a) * 40), 13 + hpK * 4); }
    }
    e.aim = (e.aim || 1.4) - dt;
    if (e.aim <= 0 && P.alive) { e.aim = e.shielded ? 1.7 : 1.1; this.fire(e, c, P.eye, 22); }
  }
}

// closest distance from a moving bullet's path to your body (a vertical segment)
function segPointDist(a, b, feet, h) {
  let best = Infinity;
  for (let i = 0; i <= 4; i++) {
    const p = new THREE.Vector3().lerpVectors(a, b, i / 4);
    const y = THREE.MathUtils.clamp(p.y, feet.y + 0.3, feet.y + h - 0.2);
    best = Math.min(best, Math.hypot(p.x - feet.x, p.y - y, p.z - feet.z));
  }
  return best;
}
