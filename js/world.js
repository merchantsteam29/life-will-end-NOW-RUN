// The drowned city: level geometry (merged by material), the skyline, the water, rain and signs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIND } from './levels.js';

const canvasTex = (w, h, draw, repeat = true) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
};
let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = {
    concrete: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#25232c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) { const v = 30 + Math.random() * 22 | 0; g.fillStyle = `rgba(${v},${v - 2},${v + 6},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    }),
    wall: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#1d1c24'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(0, y, w, 2); }
      for (let i = 0; i < 600; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1); }
    }),
    run: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#16202a'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(47,232,255,0.07)'; g.fillRect(x, 0, 30, h); }
      g.fillStyle = 'rgba(47,232,255,0.9)'; g.fillRect(0, h * 0.46, w, 6); // the runnable stripe
    }),
    hazard: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e8b21a'; g.fillRect(0, 0, w, h); g.fillStyle = '#16141a'; for (let i = -h; i < w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + h, h); g.lineTo(i + h, h); g.fill(); } }),
    windows: canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#05050a'; g.fillRect(0, 0, w, h);
      const cols = ['#ff2f6d', '#2fe8ff', '#ffd23a', '#9b6bff', '#e8f0ff'];
      for (let y = 6; y < h; y += 10) for (let x = 4; x < w; x += 9) if (Math.random() < 0.28) { g.fillStyle = cols[Math.random() * cols.length | 0]; g.globalAlpha = 0.25 + Math.random() * 0.7; g.fillRect(x, y, 5, 5); }
      g.globalAlpha = 1;
    }),
  };
  return TEX;
}

// box geometry with UVs scaled to world size, so textures don't stretch
function boxGeo(b) {
  const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [u, v] = ax > 0.5 ? [sz, sy] : ay > 0.5 ? [sx, sz] : [sx, sy];
    uv.setXY(i, uv.getX(i) * u / 4, uv.getY(i) * v / 4);
  }
  g.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  return g;
}

export function buildWorld(scene, L, ch) {
  const T = textures();
  const root = new THREE.Group(); scene.add(root);
  const neon = new THREE.Color(ch.neon), accent = new THREE.Color(ch.accent);
  const mats = {
    [KIND.floor]: new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.85, metalness: 0.1 }),
    [KIND.wall]: new THREE.MeshStandardMaterial({ map: T.wall, roughness: 0.9, metalness: 0.15 }),
    [KIND.run]: new THREE.MeshStandardMaterial({ map: T.run, emissiveMap: T.run, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0.3 }),
    [KIND.bar]: new THREE.MeshStandardMaterial({ map: T.hazard, roughness: 0.6 }),
    [KIND.pad]: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: accent, emissiveIntensity: 2.2 }),
    [KIND.deco]: new THREE.MeshStandardMaterial({ color: 0x15141a, roughness: 0.9 }),
    [KIND.glass]: new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: accent.clone().multiplyScalar(0.12), transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.6, depthWrite: false, forceSinglePass: true }),
  };
  const edgeMat = new THREE.MeshBasicMaterial({ color: neon });
  const byKind = new Map(), edges = [];
  for (const b of L.boxes) {
    if (b.mover) continue;
    const k = b.kind in mats ? b.kind : KIND.floor;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(boxGeo(b));
    // a neon strip along the long edges of every walkable top
    if (k === KIND.floor || k === KIND.glass) {
      const sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2], y = b.max[1] + 0.02;
      if (sz >= sx) for (const x of [b.min[0] + 0.06, b.max[0] - 0.06]) edges.push(boxGeo({ min: [x - 0.05, y - 0.04, b.min[2]], max: [x + 0.05, y + 0.02, b.max[2]] }));
      else for (const z of [b.min[2] + 0.06, b.max[2] - 0.06]) edges.push(boxGeo({ min: [b.min[0], y - 0.04, z - 0.05], max: [b.max[0], y + 0.02, z + 0.05] }));
    }
  }
  const solid = [];
  for (const [k, list] of byKind) { const m = new THREE.Mesh(mergeGeometries(list), mats[k]); m.userData.kind = k; root.add(m); solid.push(m); }
  if (edges.length) root.add(new THREE.Mesh(mergeGeometries(edges), edgeMat));
  // moving platforms: their own meshes
  const movers = L.movers.map((b) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]), mats[KIND.floor]);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(b.max[0] - b.min[0] + 0.1, 0.08, b.max[2] - b.min[2] + 0.1), new THREE.MeshBasicMaterial({ color: accent }));
    strip.position.y = (b.max[1] - b.min[1]) / 2 - 0.06; m.add(strip);
    root.add(m); solid.push(m); b.mesh = m; return b;
  });

  // the skyline: towers all around the route, windows lit
  const bd = L.bounds, cx = (bd.minX + bd.maxX) / 2, cz = (bd.minZ + bd.maxZ) / 2, span = Math.max(bd.maxX - bd.minX, bd.maxZ - bd.minZ) / 2 + 60;
  const towerGeo = new THREE.BoxGeometry(1, 1, 1); towerGeo.translate(0, 0.5, 0);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x07070c, emissiveMap: T.windows, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9 });
  const N = 220, towers = new THREE.InstancedMesh(towerGeo, towerMat, N), M = new THREE.Matrix4(), q = new THREE.Quaternion();
  let s = ch.id * 977;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < N; i++) {
    let x, z, tries = 0;
    do { const a = rnd() * Math.PI * 2, r = span * (0.35 + rnd() * 1.4); x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r; tries++; }
    while (tries < 20 && x > bd.minX - 18 && x < bd.maxX + 18 && z > bd.minZ - 18 && z < bd.maxZ + 18);
    const w = 8 + rnd() * 22, h = 40 + rnd() * 180;
    M.compose(new THREE.Vector3(x, L.water, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 0.3), new THREE.Vector3(w, h, w));
    towers.setMatrixAt(i, M);
  }
  root.add(towers);
  // the water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x02040a, roughness: 0.08, metalness: 0.9, emissive: new THREE.Color(ch.neon).multiplyScalar(0.03) }));
  water.rotation.x = -Math.PI / 2; water.position.set(cx, L.water, cz); root.add(water);
  // signs: big neon words hung in the air
  for (const sg of L.signs) {
    const tex = canvasTex(512, 128, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, w, h); g.font = '900 78px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = sg.color; g.shadowBlur = 24; g.fillStyle = sg.color; g.fillText(sg.text, w / 2, h / 2); g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.fillText(sg.text, w / 2, h / 2); }, false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sg.size * 4, sg.size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
    m.position.set(...sg.p); m.rotation.y = sg.yaw ?? (sg.p[0] < 0 ? Math.PI / 2 : -Math.PI / 2); root.add(m);
  }
  // exit beacon
  let exit = null;
  if (L.exit) {
    exit = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: accent }));
    ring.position.y = 1.8; exit.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true }));
    beam.position.y = 30; exit.add(beam);
    exit.position.set(...L.exit.p); root.add(exit); exit.userData.ring = ring;
  }
  // lock-in gates: walls of light, shown only while an arena is shut
  const gateMat = new THREE.MeshBasicMaterial({ color: neon, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.AdditiveBlending });
  const gateEdge = new THREE.MeshBasicMaterial({ color: neon });
  for (const b of L.gates || []) {
    const g = new THREE.Group(), sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
    g.add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), gateMat));
    for (const y of [0.1, sy - 0.1, sy * 0.5]) g.add(new THREE.Mesh(new THREE.BoxGeometry(sx + 0.05, 0.08, sz + 0.05), gateEdge)).position.y = y - sy / 2;
    g.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2); g.visible = false; root.add(g); b.mesh = g;
  }
  // grapple rings: a glowing hoop on a cable from the sky, always turned to face you
  const hookMat = new THREE.MeshBasicMaterial({ color: accent }), hookCore = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const hookGeo = new THREE.TorusGeometry(0.62, 0.07, 8, 28), coreGeo = new THREE.OctahedronGeometry(0.22), cableGeo = new THREE.CylinderGeometry(0.025, 0.025, 40, 5);
  const cableMat = new THREE.MeshBasicMaterial({ color: 0x3a4058 });
  const hooks = (L.hooks || []).map((h) => {
    const g = new THREE.Group(); g.position.set(...h.p);
    const ring = new THREE.Mesh(hookGeo, hookMat); g.add(ring); const core = new THREE.Mesh(coreGeo, hookCore); g.add(core);
    const cab = new THREE.Mesh(cableGeo, cableMat); cab.position.y = 20.6; g.add(cab);
    root.add(g); h.mesh = g; g.userData = { ring, core }; return g;
  });
  // ziplines: a lit cable with a clamp at each end
  const zipMat = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.55) }), clampMat = new THREE.MeshStandardMaterial({ color: 0x2a2e3a, roughness: 0.5, metalness: 0.6 });
  for (const z of L.zips || []) {
    const a = new THREE.Vector3(...z.a), b = new THREE.Vector3(...z.b), len = a.distanceTo(b);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), zipMat);
    c.position.copy(a).add(b).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); root.add(c);
    for (const p of [a, b]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), clampMat); k.position.copy(p); root.add(k); const up = new THREE.Mesh(cableGeo, cableMat); up.position.set(p.x, p.y + 20, p.z); root.add(up); }
  }
  // checkpoints: small floor lights
  const cps = L.checkpoints.map((c) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 32), new THREE.MeshBasicMaterial({ color: 0x555566, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(c.p[0], c.p[1] + 0.03, c.p[2]); root.add(m); return m;
  });
  // rain: a box of streaks that follows the camera
  let rain = null;
  if (ch.rain) {
    const n = 2400, pos = new Float32Array(n * 6);
    const top = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 42 - 1.3, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6); top[i * 2] = top[i * 2 + 1] = y; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aTop', new THREE.BufferAttribute(top, 1));
    const rm = new THREE.LineBasicMaterial({ color: 0x8aa0c8, transparent: true, opacity: 0.35 }), uFall = { value: 0 };
    // both ends of a streak wrap together (they share the streak's top height)
    rm.onBeforeCompile = (sh) => { sh.uniforms.uFall = uFall; sh.vertexShader = 'attribute float aTop;\nuniform float uFall;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += (mod(aTop - uFall + 1.3, 42.0) - 1.3) - aTop;'); };
    rain = new THREE.LineSegments(g, rm); rain.userData.fall = uFall;
    rain.frustumCulled = false; root.add(rain);
  }
  // lights: moonlight, a sky fill, the city's glow from below
  const hemi = new THREE.HemisphereLight(0x5a6aa0, 0x2a0a20, 1.1); root.add(hemi);
  const moon = new THREE.DirectionalLight(0xb8c4ff, 1.2); moon.position.set(40, 80, 30); root.add(moon);
  const glow = new THREE.DirectionalLight(neon, 0.6); glow.position.set(-30, -40, -20); root.add(glow);

  scene.background = new THREE.Color(ch.sky);
  scene.fog = new THREE.FogExp2(ch.fog[0], ch.fog[1]);

  return {
    root, solid, movers, exit, cps, rain, hooks,
    // show the gates that are shut
    setGates(list) { for (const b of L.gates || []) b.mesh.visible = list.includes(b); },
    // the ring you'd hook right now glows brighter
    setHook(h) { for (const x of L.hooks || []) { const on = x === h; x.mesh.userData.ring.scale.setScalar(on ? 1.25 : 1); x.mesh.userData.core.scale.setScalar(on ? 1.5 : 1); } },
    update(t, dt, camPos) {
      for (const g of hooks) { g.userData.ring.lookAt(camPos); g.userData.core.rotation.y = t * 2; }
      gateMat.opacity = 0.18 + Math.sin(t * 6) * 0.06;
      for (const b of movers) {
        const mv = b.mover, o = Math.sin((t + mv.ph) * Math.PI * 2 / mv.period) * mv.amp, ax = mv.axis === 'x' ? 0 : mv.axis === 'y' ? 1 : 2;
        const before = b.min[ax];
        b.min[ax] = b.base[0][ax] + o; b.max[ax] = b.base[1][ax] + o;
        b.delta = [0, 0, 0]; b.delta[ax] = b.min[ax] - before;
        b.mesh.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      }
      if (exit) { exit.userData.ring.rotation.y += dt * 1.5; exit.userData.ring.position.y = 1.8 + Math.sin(t * 2) * 0.15; }
      if (rain) {
        rain.position.set(Math.round(camPos.x / 4) * 4, camPos.y - 20, Math.round(camPos.z / 4) * 4);
        const u = rain.userData.fall; u.value = (u.value + dt * 34) % 4200;
      }
    },
    dispose() { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
