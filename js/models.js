// Every model in the game: HALCYON's tide wardens, its machines, and your gun, blade and hands.
// All built from primitives. Each enemy is a handful of animated parts; the pieces of a part are
// merged per material and cached per type, so a checkpoint respawn costs nothing to rebuild.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// shared materials (the glow is per enemy so hits and tells can flash it)
const MAT = {
  body: new THREE.MeshStandardMaterial({ color: 0x2c3140, roughness: 0.6, metalness: 0.25 }),
  plate: new THREE.MeshStandardMaterial({ color: 0x6a7590, roughness: 0.38, metalness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x161820, roughness: 0.8, metalness: 0.15, side: THREE.DoubleSide }),
  trim: new THREE.MeshStandardMaterial({ color: 0xc8d0e4, roughness: 0.3, metalness: 0.4, emissive: 0x202430 }),
};

// ---------- the kit: parts made of transformed primitives ----------
const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, s = 12, open = false, t0 = 0, tl = PI * 2) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open, t0, tl),
  sph: (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
  cap: (r, l, s = 8) => new THREE.CapsuleGeometry(r, l, 3, s),
  tor: (r, t, rs = 6, ts = 24, arc = PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  cone: (r, h, s = 6) => new THREE.ConeGeometry(r, h, s),
  oct: (r) => new THREE.OctahedronGeometry(r, 0),
};
function kit(scale = [1, 1, 1]) {
  const parts = {}, order = []; let cur = null;
  const S = new THREE.Matrix4().makeScale(...scale);
  const api = {
    // a new animated part with its pivot (in model space) and an optional parent part
    part(name, x = 0, y = 0, z = 0, parent = null) { cur = parts[name] = { name, pivot: [x * scale[0], y * scale[1], z * scale[2]], parent, items: {} }; order.push(name); return api; },
    // a primitive, positioned relative to the current part's pivot
    add(geo, mk, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
      _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
      const g = geo.index ? geo.toNonIndexed() : geo; geo !== g && geo.dispose();
      g.applyMatrix4(_m).applyMatrix4(S); (cur.items[mk] ||= []).push(g); return api;
    },
    // mirrored copies on both sides
    pair(mk, x, fn) { fn(x, 1); fn(-x, -1); return api; },
    done() {
      return order.map((n) => {
        const p = parts[n];
        return { name: n, pivot: p.pivot, parent: p.parent, meshes: Object.entries(p.items).map(([mk, list]) => ({ mk, geo: mergeGeometries(list) })) };
      });
    },
  };
  return api;
}
// a limb from a to b (cylinder, oriented along the segment)
function limb(K, mk, a, b, r1, r2 = r1, seg = 8) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), e = new THREE.Euler().setFromQuaternion(q);
  K.add(G.cyl(r2, r1, len, seg), mk, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, e.x, e.y, e.z);
}

// ---------- the wardens: one humanoid frame, dressed per role ----------
function humanoid(o) {
  const { bulk = 1, tall = 1, gun = 'rifle', role } = o;
  const K = kit([bulk, tall, bulk]);
  // legs
  for (const [n, sx] of [['legL', -1], ['legR', 1]]) {
    K.part(n, sx * 0.14, 0.95, 0);
    K.add(G.cap(0.085, 0.28), 'body', 0, -0.22, 0)
      .add(G.box(0.16, 0.26, 0.07), 'plate', 0, -0.2, -0.075, 0.08)
      .add(G.box(0.13, 0.11, 0.12), 'plate', 0, -0.47, -0.04, -0.3)
      .add(G.cyl(0.075, 0.058, 0.38, 8), 'body', 0, -0.67, 0.01)
      .add(G.box(0.12, 0.3, 0.06), 'plate', 0, -0.67, -0.065, 0.05)
      .add(G.box(0.022, 0.22, 0.012), 'glow', 0, -0.66, -0.1, 0.05)
      .add(G.box(0.15, 0.1, 0.28), 'dark', 0, -0.9, -0.045)
      .add(G.box(0.15, 0.04, 0.1), 'plate', 0, -0.86, -0.15);
  }
  // body, head, arms and weapon move together
  K.part('upper', 0, 1.0, 0);
  K.add(G.box(0.4, 0.17, 0.24), 'dark', 0, -0.04, 0)
    .add(G.box(0.42, 0.03, 0.25), 'glow', 0, 0.035, 0)
    .add(G.cyl(0.15, 0.18, 0.25, 10), 'body', 0, 0.16, 0)
    .add(G.box(0.5, 0.34, 0.3), 'plate', 0, 0.42, -0.01)
    .add(G.box(0.38, 0.2, 0.05), 'plate', 0, 0.45, -0.17, -0.18)
    .add(G.cyl(0.055, 0.055, 0.02, 6), 'glow', 0, 0.44, -0.2, PI / 2)
    .add(G.box(0.12, 0.04, 0.04), 'trim', 0, 0.58, -0.16)
    .add(G.box(0.34, 0.36, 0.16), 'dark', 0, 0.42, 0.22)
    .add(G.cyl(0.18, 0.21, 0.08, 10), 'dark', 0, 0.62, 0)
    .add(G.cyl(0.06, 0.07, 0.1, 8), 'body', 0, 0.69, 0);
  K.pair('glow', 0.1, (x) => K.add(G.cyl(0.04, 0.04, 0.28, 8), 'glow', x, 0.42, 0.31));
  // head
  if (role === 'sniper') {
    K.add(G.sph(0.17), 'body', 0, 0.8, 0, 0, 0, 0, 1, 1.05, 1)
      .add(G.sph(0.21, 14, 10), 'dark', 0, 0.83, 0.03, 0, 0, 0, 1, 1.1, 1.15)
      .add(G.box(0.24, 0.16, 0.08), 'dark', 0, 0.77, -0.13)
      .add(G.cyl(0.055, 0.06, 0.06, 12), 'plate', 0.04, 0.8, -0.18, PI / 2)
      .add(G.cyl(0.042, 0.042, 0.02, 12), 'glow', 0.04, 0.8, -0.215, PI / 2);
  } else if (role === 'charger') {
    K.add(G.sph(0.16), 'plate', 0, 0.78, -0.04, 0, 0, 0, 1, 0.9, 1.15)
      .add(G.box(0.3, 0.05, 0.03), 'glow', 0, 0.78, -0.21)
      .add(G.cone(0.05, 0.22, 4), 'trim', 0, 0.75, -0.3, -PI / 2);
    K.pair('glow', 0.08, (x, s) => K.add(G.box(0.05, 0.03, 0.03), 'glow', x, 0.73, -0.2, 0, 0, s * 0.3));
  } else {
    K.add(G.sph(0.17), 'plate', 0, 0.8, 0, 0, 0, 0, 1, 1.05, 1)
      .add(G.box(0.26, 0.14, 0.08), 'dark', 0, 0.77, -0.13)
      .add(G.box(0.28, 0.045, 0.03), 'glow', 0, 0.8, -0.175)
      .add(G.box(0.04, 0.07, 0.3), 'plate', 0, 0.96, 0.01)
      .add(G.cyl(0.008, 0.008, 0.22, 4), 'dark', 0.12, 0.98, 0.06)
      .add(G.sph(0.022, 6, 4), 'glow', 0.12, 1.09, 0.06);
  }
  // shoulders
  const pb = role === 'shield' ? 1.35 : 1;
  K.pair('plate', 0.31, (x, s) => K.add(G.sph(0.14 * pb, 12, 8), 'plate', x, 0.56, 0, 0, 0, -s * 0.25, 1, 0.75, 1.05)
    .add(G.box(0.2 * pb, 0.025, 0.12), 'glow', x * 1.05, 0.5, -0.06, 0, 0, -s * 0.25));
  // arms and the weapon
  if (role === 'charger') {
    // arms forward, each ending in a long hot blade
    K.pair('body', 0.3, (x, s) => {
      limb(K, 'body', [x, 0.5, 0], [x * 1.1, 0.32, -0.25], 0.065);
      K.add(G.box(0.11, 0.11, 0.3), 'plate', x * 1.05, 0.3, -0.38).add(G.box(0.08, 0.08, 0.08), 'dark', x, 0.3, -0.56)
        .add(G.cone(0.04, 0.75, 4), 'glow', x * 0.95, 0.3, -0.95, -PI / 2, 0, PI / 4, 1, 1, 0.4)
        .add(G.box(0.012, 0.04, 0.6), 'trim', x * 0.95, 0.34, -0.85);
    });
    for (let i = 0; i < 5; i++) K.add(G.cone(0.05, 0.36, 5), 'glow', (i - 2) * 0.09, 0.62 - Math.abs(i - 2) * 0.04, 0.32, -0.9);
  } else {
    // both hands on the weapon
    limb(K, 'body', [0.32, 0.5, 0], [0.27, 0.3, -0.14], 0.065); limb(K, 'body', [-0.32, 0.5, 0], [-0.2, 0.3, -0.2], 0.065);
    limb(K, 'plate', [0.27, 0.3, -0.14], [0.17, 0.28, -0.32], 0.06, 0.05); limb(K, 'plate', [-0.2, 0.3, -0.2], [0.1, 0.3, -0.52], 0.06, 0.05);
    K.add(G.box(0.08, 0.08, 0.09), 'dark', 0.16, 0.26, -0.34).add(G.box(0.08, 0.08, 0.09), 'dark', 0.11, 0.29, -0.56);
    const len = gun === 'long' ? 1.25 : gun === 'smg' ? 0.42 : 0.62, gx = 0.15, gy = 0.32;
    K.add(G.box(0.08, 0.12, len), 'dark', gx, gy, -0.1 - len / 2)
      .add(G.box(0.085, 0.04, len * 0.7), 'plate', gx, gy + 0.075, -0.1 - len * 0.45)
      .add(G.cyl(0.024, 0.024, 0.3, 8), 'body', gx, gy + 0.02, -0.1 - len - 0.13, PI / 2)
      .add(G.box(0.06, 0.16, 0.08), 'body', gx, gy - 0.13, -0.1 - len * 0.35, 0.25)
      .add(G.box(0.07, 0.1, 0.2), 'dark', gx, gy - 0.02, 0.0)
      .add(G.box(0.01, 0.022, len * 0.7), 'glow', gx + 0.045, gy + 0.01, -0.1 - len * 0.5);
    if (gun === 'long') K.add(G.cyl(0.035, 0.035, 0.32, 10), 'body', gx, gy + 0.14, -0.45, PI / 2).add(G.cyl(0.03, 0.03, 0.01, 10), 'glow', gx, gy + 0.14, -0.615, PI / 2).add(G.box(0.02, 0.2, 0.02), 'body', gx - 0.04, gy - 0.12, -1.0, 0.35).add(G.box(0.02, 0.2, 0.02), 'body', gx + 0.04, gy - 0.12, -1.0, 0.35);
    else K.add(G.box(0.03, 0.03, 0.08), 'glow', gx, gy + 0.12, -0.3);
  }
  if (role === 'sniper') {
    // a long coat, open at the front
    K.add(G.cyl(0.25, 0.42, 0.95, 12, true, PI * 0.15, PI * 1.7), 'dark', 0, 0.0, 0.02, 0, PI, 0);
  }
  return K;
}

function shieldPlate(K) {
  K.part('shield', 0, 0, -0.62, 'upper');
  K.add(G.box(1.3, 0.08, 0.1), 'plate', 0, 0.82, 0).add(G.box(1.3, 0.08, 0.1), 'plate', 0, -0.82, 0)
    .add(G.box(0.08, 1.72, 0.1), 'plate', 0.63, 0, 0).add(G.box(0.08, 1.72, 0.1), 'plate', -0.63, 0, 0)
    .add(G.box(0.5, 0.05, 0.06), 'glow', 0, 0.45, -0.03).add(G.box(1.2, 1.62, 0.03), 'energy', 0, 0, 0)
    .add(G.box(0.08, 0.3, 0.08), 'dark', 0, 0, 0.12);
}

const BUILD = {
  gunner: () => humanoid({ role: 'gunner' }).done(),
  sniper: () => humanoid({ role: 'sniper', tall: 1.1, bulk: 0.95, gun: 'long' }).done(),
  shield: () => { const K = humanoid({ role: 'shield', bulk: 1.16, gun: 'smg' }); shieldPlate(K); return K.done(); },
  charger: () => humanoid({ role: 'charger', tall: 0.88, bulk: 1.05 }).done(),
  drone() {
    const K = kit();
    K.part('body', 0, 0, 0);
    K.add(G.sph(0.42, 18, 12), 'plate', 0, 0, 0, 0, 0, 0, 1, 0.72, 1.1)
      .add(G.sph(0.34, 14, 8), 'dark', 0, -0.1, 0.02, 0, 0, 0, 1, 0.6, 1)
      .add(G.cyl(0.16, 0.18, 0.1, 16), 'dark', 0, 0, -0.42, PI / 2)
      .add(G.cyl(0.11, 0.11, 0.02, 16), 'glow', 0, 0, -0.48, PI / 2)
      .add(G.box(0.05, 0.05, 0.4), 'body', 0, -0.25, -0.15)
      .add(G.box(0.03, 0.18, 0.25), 'plate', 0, 0.32, 0.12, -0.3);
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + i * PI / 2, x = Math.cos(a) * 0.62, z = Math.sin(a) * 0.55;
      limb(K, 'body', [0, 0, 0], [x, 0.05, z], 0.04);
      K.add(G.tor(0.16, 0.025, 6, 16), 'plate', x, 0.05, z, PI / 2).add(G.tor(0.15, 0.012, 4, 16), 'glow', x, 0.08, z, PI / 2)
        .add(G.box(0.3, 0.008, 0.04), 'dark', x, 0.06, z, 0, a, 0);
    }
    K.part('ring', 0, 0, 0, 'body');
    K.add(G.tor(0.86, 0.03, 6, 36), 'glow', 0, 0, 0, PI / 2);
    for (let i = 0; i < 3; i++) K.add(G.box(0.12, 0.06, 0.06), 'plate', Math.cos(i * 2.09) * 0.86, 0, Math.sin(i * 2.09) * 0.86, 0, -i * 2.09, 0);
    return K.done();
  },
  turret() {
    const K = kit();
    K.part('base', 0, 0, 0);
    K.add(G.cyl(0.95, 1.08, 0.45, 8), 'dark', 0, 0.22, 0).add(G.tor(0.9, 0.03, 4, 32), 'glow', 0, 0.46, 0, PI / 2)
      .add(G.cyl(0.5, 0.62, 0.5, 8), 'plate', 0, 0.7, 0);
    for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; K.add(G.box(0.25, 0.4, 0.5), 'body', Math.cos(a) * 0.85, 0.2, Math.sin(a) * 0.85, 0, -a, 0); }
    K.part('head', 0, 1.1, 0, 'base');
    K.add(G.box(0.95, 0.55, 0.9), 'plate', 0, 0, 0).add(G.box(0.8, 0.12, 0.8), 'body', 0, 0.32, 0.05)
      .add(G.box(0.6, 0.09, 0.03), 'glow', 0, 0.05, -0.46);
    K.pair('dark', 0.54, (x) => K.add(G.box(0.12, 0.66, 0.82), 'dark', x, 0, 0.02).add(G.box(0.02, 0.4, 0.04), 'glow', x * 1.12, 0, -0.2));
    K.pair('body', 0.18, (x) => K.add(G.cyl(0.07, 0.07, 1.0, 10), 'body', x, -0.08, -0.9, PI / 2).add(G.box(0.16, 0.16, 0.14), 'dark', x, -0.08, -1.38).add(G.cyl(0.05, 0.05, 0.02, 10), 'glow', x, -0.08, -1.46, PI / 2));
    for (let i = 0; i < 3; i++) K.add(G.box(0.6, 0.04, 0.03), 'glow', 0, -0.15 + i * 0.12, 0.46);
    return K.done();
  },
  pylon() {
    const K = kit();
    K.part('base', 0, 0, 0);
    K.add(G.cyl(0.65, 1.05, 0.5, 6), 'dark', 0, 0.25, 0).add(G.cyl(0.36, 0.52, 0.9, 6), 'plate', 0, 0.95, 0)
      .add(G.tor(0.45, 0.03, 4, 6), 'glow', 0, 1.35, 0, PI / 2);
    for (let i = 0; i < 6; i++) { const a = i * PI / 3; K.add(G.box(0.12, 0.8, 0.3), 'body', Math.cos(a) * 0.72, 0.4, Math.sin(a) * 0.72, 0, -a, 0).add(G.box(0.03, 0.5, 0.03), 'glow', Math.cos(a) * 0.8, 0.45, Math.sin(a) * 0.8); }
    for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3; limb(K, 'trim', [Math.cos(a) * 0.4, 1.3, Math.sin(a) * 0.4], [Math.cos(a) * 0.75, 1.75, Math.sin(a) * 0.75], 0.05, 0.02); }
    K.part('crystal', 0, 2.25, 0, 'base');
    K.add(G.oct(0.75), 'glow', 0, 0, 0, 0, 0, 0, 1, 1.6, 1).add(G.oct(0.95), 'energy', 0, 0, 0, 0, PI / 4, 0, 1, 1.5, 1);
    K.part('rings', 0, 2.25, 0, 'base');
    K.add(G.tor(1.15, 0.03, 4, 40), 'glow', 0, 0, 0, PI / 2 + 0.3).add(G.tor(1.3, 0.02, 4, 40), 'plate', 0, 0, 0, PI / 2 - 0.4, 0.5);
    return K.done();
  },
  core() {
    const K = kit();
    K.part('eye', 0, 2.4, 0);
    K.add(G.sph(2.0, 40, 28), 'glow', 0, 0, 0).add(G.sph(0.95, 24, 16), 'dark', 0, 0, -1.78, 0, 0, 0, 1, 1, 0.3)
      .add(G.tor(1.3, 0.09, 8, 48), 'trim', 0, 0, -1.55).add(G.tor(1.65, 0.05, 6, 48), 'plate', 0, 0, -1.08)
      .add(G.box(0.2, 1.4, 0.08), 'glow', 0, 0, -2.08);
    for (let i = 0; i < 8; i++) { const a = i * PI / 4; K.add(G.box(0.12, 0.5, 0.06), 'plate', Math.cos(a) * 1.45, Math.sin(a) * 1.45, -1.42, 0, 0, a + PI / 2); }
    K.part('orbit', 0, 2.4, 0);
    K.add(G.tor(3.3, 0.05, 6, 64), 'glow', 0, 0, 0, PI / 2).add(G.tor(3.5, 0.08, 6, 64), 'plate', 0, 0, 0, PI / 2 + 0.25, 0.3);
    return K.done();
  },
};
const CACHE = {};
function template(type) { return CACHE[type] ||= BUILD[type](); }

// one plate of the core's shell (the boss code moves these in and out)
let shellTpl = null;
function shellPlate() {
  if (!shellTpl) {
    const K = kit(); K.part('p');
    K.add(G.box(1.6, 3.2, 0.3), 'plate', 0, 0, 0).add(G.box(1.3, 2.8, 0.06), 'body', 0, 0, 0.17)
      .add(G.box(1.4, 0.06, 0.04), 'glow', 0, 1.0, 0.2).add(G.box(1.4, 0.06, 0.04), 'glow', 0, -1.0, 0.2)
      .add(G.box(0.08, 2.4, 0.05), 'glow', 0, 0, 0.21).add(G.box(1.7, 0.2, 0.4), 'dark', 0, 1.62, 0).add(G.box(1.7, 0.2, 0.4), 'dark', 0, -1.62, 0);
    shellTpl = K.done()[0];
  }
  return shellTpl;
}

export function makeModel(type, neon) {
  const glow = new THREE.MeshStandardMaterial({ color: 0x220008, emissive: neon, emissiveIntensity: 2.4, roughness: 0.5, metalness: 0.4 });
  const energy = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: type === 'shield' ? 0x2fe8ff : neon, emissiveIntensity: 0.6, transparent: true, opacity: type === 'shield' ? 0.4 : 0.25, depthWrite: false, side: THREE.DoubleSide });
  const mats = { ...MAT, glow, energy };
  const g = new THREE.Group(), parts = {};
  const inst = (tpl, parent) => {
    const grp = new THREE.Group(); grp.position.set(...tpl.pivot);
    for (const m of tpl.meshes) grp.add(new THREE.Mesh(m.geo, mats[m.mk]));
    parent.add(grp); return grp;
  };
  for (const tpl of template(type)) parts[tpl.name] = inst(tpl, tpl.parent ? parts[tpl.parent] : g);
  let extra = null;
  if (type === 'core') {
    extra = new THREE.Group(); extra.position.y = 2.4; g.add(extra);
    for (let i = 0; i < 6; i++) { const p = inst(shellPlate(), extra); const a = i / 6 * PI * 2; p.position.set(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5); p.rotation.y = -a + PI / 2; }
  }
  return { g, glow, extra, parts, eye: null, anim: ANIM[type] || ANIM.warden };
}

// ---------- how they move ----------
const ANIM = {
  warden(e, dt) {
    const P = e.m.parts, t = e.t, kick = e.kick = Math.max(0, (e.kick || 0) - dt * 6);
    const lean = e.type === 'charger' ? 0.5 : 0;
    P.upper.rotation.x = lean + THREE.MathUtils.clamp(-(e.pitch || 0), -0.6, 0.6) * (e.aware ? 1 : 0) * (e.type === 'charger' ? 0.3 : 0.8) - kick * 0.18;
    P.upper.position.z = kick * 0.06;
    P.upper.position.y = 1.0 * (e.type === 'sniper' ? 1.1 : e.type === 'charger' ? 0.88 : 1) + Math.sin(t * 2.2) * 0.012 - (e.tele > 0 ? 0.03 : 0);
    if (e.moving) { const s = Math.sin(t * 14) * 0.75; P.legL.rotation.x = s; P.legR.rotation.x = -s; }
    else { P.legL.rotation.x = e.type === 'charger' ? -0.35 : 0.05; P.legR.rotation.x = e.type === 'charger' ? 0.25 : -0.12; }
    if (e.type === 'sniper' && e.tele > 0) P.upper.rotation.x -= 0.04;
  },
  drone(e, dt) { const P = e.m.parts; P.ring.rotation.y += dt * (e.tele > 0 ? 12 : 4); P.body.rotation.x = THREE.MathUtils.clamp(-(e.pitch || 0), -0.5, 0.5) + Math.sin(e.t * 1.3) * 0.06; P.body.rotation.z = Math.sin(e.t * 0.7) * 0.15; },
  turret(e, dt) { const P = e.m.parts; e.kick = Math.max(0, (e.kick || 0) - dt * 10); P.head.rotation.x = THREE.MathUtils.clamp(-(e.pitch || 0), -0.5, 0.6); P.head.position.z = e.kick * 0.05; },
  pylon(e, dt) { const P = e.m.parts; P.crystal.rotation.y += dt * 1.5; P.crystal.position.y = 2.25 + Math.sin(e.t * 2) * 0.12; P.rings.rotation.y -= dt * 0.9; P.rings.rotation.z = Math.sin(e.t * 0.8) * 0.3; },
  core(e, dt) {
    const P = e.m.parts; P.orbit.rotation.y += dt * 0.7; P.orbit.rotation.x = Math.sin(e.t * 0.5) * 0.4;
    let dy = (e.lookYaw || 0) - P.eye.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.eye.rotation.y += dy * Math.min(1, dt * 2.5);
    P.eye.rotation.x = THREE.MathUtils.clamp(-(e.pitch || 0), -0.6, 0.6);
  },
};

// ---------- your gun, your blade and the hands holding them ----------
export function makeViewmodel() {
  const g = new THREE.Group();
  const M = {
    dark: new THREE.MeshStandardMaterial({ color: 0x4a5068, metalness: 0.3, roughness: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb8c0d4, metalness: 0.4, roughness: 0.25 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x33363f, metalness: 0.1, roughness: 0.9 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x454a58, metalness: 0.1, roughness: 0.7 }),
    knuckle: new THREE.MeshStandardMaterial({ color: 0x7a849c, metalness: 0.35, roughness: 0.35 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x34446a, metalness: 0.05, roughness: 0.85 }),
    neonC: new THREE.MeshBasicMaterial({ color: 0x2fe8ff }), neonP: new THREE.MeshBasicMaterial({ color: 0xff2f6d }),
  };
  const put = (p, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  const arm = (p, a, b, r1, r2, m) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(); const o = new THREE.Mesh(G.cyl(r2, r1, len, 12), m); o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); p.add(o); return o; };
  // a gloved hand wrapped around a grip that runs along `axis` ('y' for the gun, 'z' for the blade)
  const hand = (p, x, y, z, axis, side) => {
    const h = new THREE.Group(); h.position.set(x, y, z); p.add(h);
    if (axis === 'y') {
      put(h, G.box(0.085, 0.1, 0.09), M.glove, side * 0.012, 0, 0.012);
      for (let i = 0; i < 4; i++) put(h, G.box(0.075, 0.024, 0.03), M.glove, 0.0, 0.035 - i * 0.026, -0.05, 0, 0, 0);
      put(h, G.box(0.08, 0.06, 0.012), M.knuckle, 0, 0, -0.068);
      put(h, G.box(0.025, 0.025, 0.07), M.glove, -side * 0.045, 0.04, -0.01, 0.4, 0, 0);
      put(h, G.box(0.01, 0.05, 0.005), M.neonC, side * 0.05, 0, 0.02);
    } else {
      put(h, G.box(0.09, 0.085, 0.1), M.glove, 0, 0.012, 0);
      for (let i = 0; i < 4; i++) put(h, G.box(0.03, 0.024, 0.075), M.glove, 0, -0.035, -0.035 + i * 0.024, 0, 0, 0);
      put(h, G.box(0.012, 0.06, 0.09), M.knuckle, side * 0.05, -0.005, 0);
      put(h, G.box(0.025, 0.07, 0.025), M.glove, -side * 0.035, 0.035, -0.045, 0, 0, side * 0.4);
    }
    return h;
  };

  // the gun: a compact carbine, two cyan cells along the slide
  const gun = new THREE.Group(); g.add(gun);
  put(gun, G.box(0.066, 0.075, 0.3), M.dark, 0, 0, -0.05);
  put(gun, G.box(0.072, 0.055, 0.36), M.metal, 0, 0.058, -0.07);
  for (let i = 0; i < 5; i++) put(gun, G.box(0.074, 0.04, 0.006), M.dark, 0, 0.06, 0.07 + i * 0.012);
  for (const s of [1, -1]) put(gun, G.box(0.008, 0.016, 0.24), M.neonC, s * 0.037, 0.06, -0.08);
  put(gun, G.cyl(0.024, 0.024, 0.09, 12), M.dark, 0, 0.035, -0.28, PI / 2);
  put(gun, G.cyl(0.016, 0.016, 0.01, 12), M.neonC, 0, 0.035, -0.326, PI / 2);
  put(gun, G.box(0.03, 0.022, 0.02), M.dark, 0, 0.095, 0.09); put(gun, G.box(0.012, 0.02, 0.012), M.neonC, 0, 0.095, -0.23);
  put(gun, G.tor(0.032, 0.006, 6, 12, PI), M.dark, 0, -0.04, 0.0, 0, PI / 2, PI);
  put(gun, G.box(0.056, 0.15, 0.07), M.grip, 0, -0.1, 0.07, 0.28);
  put(gun, G.box(0.05, 0.03, 0.12), M.dark, 0, -0.045, -0.16);
  const gh = hand(gun, 0.006, -0.1, 0.075, 'y', 1); gh.rotation.x = 0.28;
  arm(gun, [0.01, -0.15, 0.12], [0.08, -0.36, 0.5], 0.042, 0.055, M.glove);
  arm(gun, [0.03, -0.21, 0.24], [0.1, -0.42, 0.62], 0.062, 0.07, M.sleeve);
  put(gun, G.tor(0.062, 0.008, 6, 18), M.neonC, 0.032, -0.215, 0.245, 1.08, 0.15, 0);
  const muzzle = new THREE.PointLight(0x2fe8ff, 0, 3); muzzle.position.set(0, 0.03, -0.36); gun.add(muzzle);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); flash.position.set(0, 0.035, -0.36); gun.add(flash);

  // the blade: a long straight edge, wrapped grip, a round guard
  const blade = new THREE.Group(); g.add(blade);
  put(blade, G.cyl(0.021, 0.023, 0.2, 10), M.grip, 0, 0, 0.06, PI / 2);
  for (let i = 0; i < 5; i++) put(blade, G.box(0.05, 0.012, 0.012), M.knuckle, 0, 0, -0.02 + i * 0.035, 0, 0, PI / 4);
  put(blade, G.sph(0.03, 10, 8), M.metal, 0, 0, 0.17);
  put(blade, G.cyl(0.062, 0.062, 0.014, 10), M.metal, 0, 0, -0.045, PI / 2);
  put(blade, G.cyl(0.03, 0.03, 0.03, 8), M.dark, 0, 0, -0.065, PI / 2);
  put(blade, G.box(0.009, 0.042, 0.74), M.metal, 0, 0.006, -0.44);
  const edge = put(blade, G.box(0.005, 0.016, 0.74), M.neonP, 0, -0.022, -0.44);
  put(blade, G.cone(0.025, 0.11, 4), M.neonP, 0, -0.004, -0.86, -PI / 2, 0, PI / 4).scale.set(0.35, 1, 1);
  const egGeo = new THREE.PlaneGeometry(0.05, 0.84).rotateX(-PI / 2).rotateZ(PI / 2);
  const edgeGlow = new THREE.Mesh(egGeo, new THREE.MeshBasicMaterial({ color: 0xff2f6d, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  edgeGlow.position.set(0, -0.022, -0.46); blade.add(edgeGlow);
  hand(blade, 0, -0.004, 0.06, 'z', -1);
  arm(blade, [-0.01, -0.03, 0.11], [-0.05, -0.12, 0.5], 0.042, 0.055, M.glove);
  arm(blade, [-0.025, -0.07, 0.25], [-0.07, -0.16, 0.66], 0.062, 0.07, M.sleeve);
  put(blade, G.tor(0.062, 0.008, 6, 18), M.neonP, -0.027, -0.068, 0.255, 1.35, -0.1, 0);
  return { g, gun, blade, edge, edgeGlow, muzzle, flash, kick: 0, swing: 0 };
}
