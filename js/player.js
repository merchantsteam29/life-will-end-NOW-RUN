// You: running, jumping (plus one air jump), wall-running, sliding, dashing, launch pads, and the camera.
// Collision is box against box (the level is all boxes), one axis at a time, with small steps climbed.
import * as THREE from 'three';
import { KIND } from './levels.js';
import { rayWorld } from './enemies.js';

const R = 0.34, H_STAND = 1.8, H_SLIDE = 0.95;
const RUN = 10.5, ACC_G = 70, ACC_A = 22, FRICTION = 12, GRAV = 28, JUMP = 11, PAD = 22, TERMINAL = 40;
const DASH = 26, DASH_T = 0.16, WALL_T = 1.9;
// the grapple: how far it reaches, how wide the aim cone is, how hard it pulls, what you leave with
const HOOK_RANGE = 34, HOOK_CONE = 0.3, HOOK_CONE_PAD = 0.45, PULL = 30, PULL_ACC = 45, HOOK_OUT_H = 17, HOOK_OUT_Y = 6.5;
// ziplines: how fast you ride, how close your hands must pass
const ZIP_MIN = 16, ZIP_MAX = 24, ZIP_REACH = 1.0, HANG = 2.3;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Player {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.reset(new THREE.Vector3(), 0);
  }
  reset(p, yaw = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.h = H_STAND; this.grounded = false; this.ground = null; this.coyote = 0; this.jumpBuf = 0; this.airJumps = 1;
    this.dashT = 0; this.dashDir = new THREE.Vector3(); this.dashReady = true; this.dashCd = 0;
    this.wall = null; this.wallCd = 0; this.lastWall = null; this.slideT = 0; this.sliding = false;
    this.landDip = 0; this.bob = 0; this.fovKick = 0; this.alive = true; this.padT = 0;
    this.grap = null; this.hookTarget = null; this.hookCd = 0; this.zip = null; this.zipCd = 0; this.lastZip = null; this.lastGroundY = p.y;
    this.events = [];
  }
  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.h - 0.12, this.pos.z); }
  get forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  // ---------- collision ----------
  overlap(b, h = this.h) {
    const p = this.pos;
    return p.x + R > b.min[0] && p.x - R < b.max[0] && p.y + h > b.min[1] && p.y < b.max[1] && p.z + R > b.min[2] && p.z - R < b.max[2];
  }
  move(boxes, ax, d) {
    if (!d) return null;
    const p = this.pos, key = ax === 0 ? 'x' : ax === 1 ? 'y' : 'z';
    p[key] += d;
    let hit = null;
    for (const b of boxes) {
      if (!this.overlap(b)) continue;
      // walk up small ledges instead of stopping dead
      if (ax !== 1 && this.grounded && b.max[1] - p.y > 0 && b.max[1] - p.y < 0.5) {
        const y0 = p.y; p.y = b.max[1] + 0.001;
        if (!boxes.some((o) => o !== b && this.overlap(o))) continue;
        p.y = y0;
      }
      if (ax === 1) p.y = d > 0 ? b.min[1] - this.h - 0.001 : b.max[1] + 0.001;
      else p[key] = d > 0 ? b.min[ax] - R - 0.001 : b.max[ax] + R + 0.001;
      hit = b;
    }
    return hit;
  }

  // ---------- a frame ----------
  update(dt, I, L, boxes, settings) {
    const ev = this.events;
    if (!this.alive) return;
    // look
    const sens = 0.0022 * settings.sens;
    this.yaw -= I.dx * sens; this.pitch = THREE.MathUtils.clamp(this.pitch - I.dy * sens * (settings.invert ? -1 : 1), -1.52, 1.52);
    // carried by the platform you stand on
    if (this.grounded && this.ground && this.ground.delta) { this.pos.x += this.ground.delta[0]; this.pos.y += Math.max(0, this.ground.delta[1]); this.pos.z += this.ground.delta[2]; }

    // input: wish direction on the ground plane
    const P = I.pad;
    let mx = (I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0), mz = (I.down('KeyW') ? 1 : 0) - (I.down('KeyS') ? 1 : 0);
    if (P) { mx += P.mx; mz += P.mz; }
    const fw = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), rt = new THREE.Vector3(-fw.z, 0, fw.x);
    const wish = fw.clone().multiplyScalar(mz).addScaledVector(rt, mx); if (wish.lengthSq() > 1) wish.normalize();
    const jumpHit = I.hit('Space') || (P && P.jump), slideHeld = I.down('KeyC', 'ControlLeft', 'ShiftRight') || (P && P.slide), dashHit = I.hit('ShiftLeft') || (P && P.dash);
    const hookHit = I.hit('KeyE', 'KeyF') || I.mmbHit || (P && P.hook);
    if (jumpHit) this.jumpBuf = 0.13;
    this.jumpBuf -= dt; this.coyote -= dt; this.wallCd -= dt; this.dashCd -= dt; this.padT -= dt; this.hookCd -= dt; this.zipCd -= dt;

    // riding a zipline: nothing else moves you until you let go
    if (this.zip) { this.rideZip(dt, slideHeld); this.camera(dt, I, settings); return; }

    // the grapple: the ring you're looking at, and hooking on to it
    this.hookTarget = this.grap ? null : this.findHook(L.hooks, boxes, I.padMode || I.touchMode);
    if (hookHit && this.hookTarget && this.hookCd <= 0) {
      const h = this.hookTarget;
      this.grap = { p: h.v || (h.v = new THREE.Vector3(...h.p)), t: 0, sp: Math.max(16, this.vel.length()) };
      this.wall = null; this.dashT = 0; this.sliding = false; this.grounded = false; this.hookCd = 0.3; this.fovKick = 0.6; this.jumpBuf = 0; ev.push('hook');
    }
    if (this.grap) { this.pull(dt, boxes, jumpHit); this.camera(dt, I, settings); return; }

    // dash: a straight burst where you're looking (along the ground plane), once in the air
    if (dashHit && this.dashT <= 0 && this.dashCd <= 0 && (this.grounded || this.dashReady)) {
      const d = wish.lengthSq() > 0.05 ? wish.clone().normalize() : fw.clone();
      this.dashDir.copy(d); this.dashT = DASH_T; this.dashCd = 0.45; if (!this.grounded) this.dashReady = false;
      this.wall = null; this.fovKick = 1; ev.push('dash');
    }

    // slide: crouch while running fast
    const speedH = Math.hypot(this.vel.x, this.vel.z);
    if (slideHeld && this.grounded && !this.sliding && speedH > 6) { this.sliding = true; this.slideT = 0.9; const k = Math.min(16, speedH + 3) / speedH; this.vel.x *= k; this.vel.z *= k; ev.push('slide'); }
    if (this.sliding) { this.slideT -= dt; if ((!slideHeld && this.canStand(boxes)) || (!this.grounded && this.slideT < 0.6)) this.sliding = false; }
    const wantH = this.sliding || (slideHeld && this.grounded) ? H_SLIDE : H_STAND;
    if (wantH > this.h) { if (this.canStand(boxes)) this.h = H_STAND; } else this.h = wantH;

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.set(this.dashDir.x * DASH, 0, this.dashDir.z * DASH);
      if (this.dashT <= 0) { this.vel.x = this.dashDir.x * 12; this.vel.z = this.dashDir.z * 12; }
    } else if (this.wall) {
      this.wallRun(dt, wish, fw);
    } else if (this.grounded) {
      const fr = this.sliding ? 1.2 : FRICTION;
      const target = wish.clone().multiplyScalar(this.sliding ? 0 : RUN);
      if (this.sliding) { const f = Math.exp(-fr * dt); this.vel.x *= f; this.vel.z *= f; if (Math.hypot(this.vel.x, this.vel.z) < 5) this.sliding = false; }
      else { const k = 1 - Math.exp(-(wish.lengthSq() ? ACC_G / RUN : fr) * dt); this.vel.x += (target.x - this.vel.x) * k; this.vel.z += (target.z - this.vel.z) * k; }
    } else {
      // air: steer, but keep speed you already have above running pace
      const vh = new THREE.Vector3(this.vel.x, 0, this.vel.z), sp = vh.length();
      vh.addScaledVector(wish, ACC_A * dt);
      const cap = Math.max(RUN, sp); if (vh.length() > cap) vh.setLength(cap);
      this.vel.x = vh.x; this.vel.z = vh.z;
    }

    // jumping: from the ground (or just after leaving it), off a wall, or once in mid-air
    if (this.jumpBuf > 0) {
      if (this.wall) {
        const n = this.wall.n, t = this.wall.t, along = this.vel.x * t.x + this.vel.z * t.z;
        this.vel.set(n.x * 8.5 + t.x * along, JUMP * 0.95, n.z * 8.5 + t.z * along);
        this.lastWall = this.wall.b; this.wallCd = 0.35; this.wall = null; this.jumpBuf = 0; ev.push('walljump');
      } else if (this.grounded || this.coyote > 0) {
        this.vel.y = JUMP; this.grounded = false; this.coyote = 0; this.jumpBuf = 0; ev.push('jump');
        if (this.sliding) { this.sliding = false; const k = 1.08; this.vel.x *= k; this.vel.z *= k; }
      } else if (this.airJumps > 0) {
        this.airJumps--; this.vel.y = JUMP * 0.92; this.jumpBuf = 0; ev.push('airjump');
        if (wish.lengthSq() > 0.1) { const sp = Math.max(RUN, Math.hypot(this.vel.x, this.vel.z)); this.vel.x = wish.x * sp; this.vel.z = wish.z * sp; }
      }
    }

    // gravity
    if (this.dashT <= 0 && !this.wall) this.vel.y = Math.max(-TERMINAL, this.vel.y - GRAV * dt);

    // move and collide, one axis at a time
    const wasGrounded = this.grounded, fallV = this.vel.y;
    const hx = this.move(boxes, 0, this.vel.x * dt), hz = this.move(boxes, 2, this.vel.z * dt);
    if (hx && !this.wall) this.vel.x = 0;
    if (hz && !this.wall) this.vel.z = 0;
    this.grounded = false;
    const hy = this.move(boxes, 1, this.vel.y * dt);
    if (hy) {
      if (this.vel.y < 0) { this.grounded = true; this.ground = hy; } else this.ground = null;
      this.vel.y = 0;
    } else {
      // stick to the floor when walking off tiny drops
      if (wasGrounded && this.vel.y <= 0) { this.pos.y -= 0.05; const h2 = boxes.find((b) => this.overlap(b)); if (h2) { this.pos.y = h2.max[1] + 0.001; this.grounded = true; this.ground = h2; } else this.pos.y += 0.05; }
    }
    if (this.grounded) {
      this.coyote = 0.12; this.airJumps = 1; this.dashReady = true; this.wall = null; this.lastWall = null;
      if (!wasGrounded) { this.landDip = Math.min(1, -fallV / 25); if (fallV < -6) ev.push('land'); }
      if (this.ground && this.ground.kind === KIND.pad && this.padT <= 0) { this.vel.y = PAD; this.grounded = false; this.padT = 0.4; this.airJumps = 1; this.dashReady = true; ev.push('pad'); }
    }

    // wall-run: in the air, moving, beside a runnable wall
    if (!this.grounded && !this.wall && this.dashT <= 0) this.tryWall(boxes, wish, fw);
    // a zipline within reach of your hands: grab it
    if (!this.grounded && L.zips && L.zips.length) this.tryZip(L.zips);

    if (this.grounded) this.lastGroundY = this.pos.y;
    if (this.pos.y < L.killY || this.overVoid(boxes)) { this.alive = false; ev.push('fell'); }
    this.camera(dt, I, settings);
  }

  // falling well below where you last stood, with nothing at all underneath: that's the water
  overVoid(boxes) {
    const p = this.pos;
    if (this.grounded || this.vel.y >= 0 || p.y > this.lastGroundY - 14) return false;
    return !boxes.some((b) => p.x > b.min[0] - R && p.x < b.max[0] + R && p.z > b.min[2] - R && p.z < b.max[2] + R && b.max[1] <= p.y + 0.3);
  }

  // ---------- the grapple ----------
  findHook(hooks, boxes, wide) {
    if (!hooks || !hooks.length) return null;
    const eye = this.eye, fw = this.forward; let best = null, bs = wide ? HOOK_CONE_PAD : HOOK_CONE;
    for (const h of hooks) {
      const v = h.v || (h.v = new THREE.Vector3(...h.p));
      _a.subVectors(v, eye); const d = _a.length();
      if (d > HOOK_RANGE || d < 3) continue;
      _a.divideScalar(d);
      const ang = Math.acos(Math.min(1, _a.dot(fw)));
      if (ang > bs) continue;
      if (rayWorld(eye, _a, boxes, d) < d - 0.6) continue;
      best = h; bs = ang;
    }
    return best;
  }
  pull(dt, boxes, jumpHit) {
    const g = this.grap, ev = this.events; g.t += dt;
    // aim your hands (a metre over your head) at the ring
    _a.copy(g.p); _a.y -= 1.0; _a.sub(this.pos); const d = _a.length();
    g.sp = Math.min(PULL, g.sp + PULL_ACC * dt);
    this.vel.copy(_a).divideScalar(d || 1).multiplyScalar(g.sp);
    const hx = this.move(boxes, 0, this.vel.x * dt), hz = this.move(boxes, 2, this.vel.z * dt), hy = this.move(boxes, 1, this.vel.y * dt);
    // let go: at the ring, after a while, on a (fresh) jump, or when something's in the way
    jumpHit = jumpHit && g.t > 0.1; // the jump you pressed as you hooked doesn't count
    if (d < 2.4 || g.t > 1.4 || jumpHit || hx || hz || hy) {
      const hv = Math.hypot(this.vel.x, this.vel.z), k = hv > HOOK_OUT_H ? HOOK_OUT_H / hv : 1;
      this.vel.x *= k; this.vel.z *= k; this.vel.y = Math.max(0, this.vel.y) * 0.35 + HOOK_OUT_Y + (jumpHit ? 3 : 0);
      if (hy && this.vel.y < 0) this.vel.y = 0;
      this.grap = null; this.jumpBuf = 0; this.airJumps = 1; this.dashReady = true; this.hookCd = 0.25; ev.push('hookoff');
    }
  }

  // ---------- ziplines ----------
  tryZip(zips) {
    if (this.zipCd > 0) return;
    const hand = _b.set(this.pos.x, this.pos.y + HANG, this.pos.z);
    for (const z of zips) {
      if (!z.A) { z.A = new THREE.Vector3(...z.a); z.B = new THREE.Vector3(...z.b); z.len = z.A.distanceTo(z.B); z.D = z.B.clone().sub(z.A).divideScalar(z.len); }
      const s = THREE.MathUtils.clamp(_a.subVectors(hand, z.A).dot(z.D) / z.len, 0, 1);
      if (s > 0.94) continue;
      _a.copy(z.A).addScaledVector(z.D, s * z.len);
      if (_a.distanceTo(hand) > ZIP_REACH) continue;
      const along = this.vel.dot(z.D);
      this.zip = { z, s, sp: THREE.MathUtils.clamp(along, ZIP_MIN, ZIP_MAX) };
      this.wall = null; this.dashT = 0; this.airJumps = 1; this.dashReady = true; this.events.push('zip');
      return;
    }
  }
  rideZip(dt, slideHeld) {
    const r = this.zip, z = r.z;
    r.sp = Math.min(ZIP_MAX, r.sp + 4 * dt);
    r.s += r.sp * dt / z.len;
    const s = Math.min(1, r.s);
    this.pos.copy(z.A).addScaledVector(z.D, s * z.len); this.pos.y -= HANG;
    this.vel.copy(z.D).multiplyScalar(r.sp);
    this.h = H_STAND; this.sliding = false;
    if (r.s >= 1 || this.jumpBuf > 0 || slideHeld) {
      if (this.jumpBuf > 0) { this.vel.y = Math.max(this.vel.y, 0) + JUMP * 0.95; this.events.push('jump'); }
      else if (r.s >= 1) { this.vel.x *= 0.6; this.vel.z *= 0.6; } // the clamp at the end brakes you
      this.zip = null; this.zipCd = 0.4; this.jumpBuf = 0; this.airJumps = 1; this.dashReady = true; this.lastGroundY = Math.max(this.lastGroundY, this.pos.y);
      this.events.push('zipoff');
    }
  }

  canStand(boxes) { const h0 = this.h; this.h = H_STAND; const ok = !boxes.some((b) => this.overlap(b)); this.h = h0; return ok; }

  tryWall(boxes, wish, fw) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp < 3.5 && wish.lengthSq() < 0.1) return;
    const p = this.pos, reach = 0.75;
    for (const b of boxes) {
      if (b.kind !== KIND.run || (b === this.lastWall && this.wallCd > 0)) continue;
      if (p.y + this.h * 0.5 < b.min[1] || p.y + 0.3 > b.max[1]) continue;
      // the wall's thin side tells which way it faces
      const thinX = b.max[0] - b.min[0] < b.max[2] - b.min[2];
      let n = null;
      if (thinX) {
        if (p.z < b.min[2] - 0.2 || p.z > b.max[2] + 0.2) continue;
        if (p.x - R >= b.max[0] && p.x - R - b.max[0] < reach) n = new THREE.Vector3(1, 0, 0);
        else if (p.x + R <= b.min[0] && b.min[0] - (p.x + R) < reach) n = new THREE.Vector3(-1, 0, 0);
      } else {
        if (p.x < b.min[0] - 0.2 || p.x > b.max[0] + 0.2) continue;
        if (p.z - R >= b.max[2] && p.z - R - b.max[2] < reach) n = new THREE.Vector3(0, 0, 1);
        else if (p.z + R <= b.min[2] && b.min[2] - (p.z + R) < reach) n = new THREE.Vector3(0, 0, -1);
      }
      if (!n) continue;
      // run in the direction you're already heading (or looking) along the wall
      const t = new THREE.Vector3(-n.z, 0, n.x);
      let dir = this.vel.x * t.x + this.vel.z * t.z;
      if (Math.abs(dir) < 1) dir = fw.x * t.x + fw.z * t.z;
      if (Math.abs(dir) < 0.2) continue;
      if (dir < 0) t.negate();
      // snap against the wall
      if (thinX) this.pos.x = n.x > 0 ? b.max[0] + R + 0.02 : b.min[0] - R - 0.02; else this.pos.z = n.z > 0 ? b.max[2] + R + 0.02 : b.min[2] - R - 0.02;
      const along = Math.max(11, Math.abs(this.vel.x * t.x + this.vel.z * t.z));
      this.vel.set(t.x * along, Math.max(this.vel.y, 2.2), t.z * along);
      this.wall = { b, n, t, time: 0 }; this.airJumps = 1; this.dashReady = true; this.events.push('wallrun');
      return;
    }
  }
  wallRun(dt, wish, fw) {
    const w = this.wall; w.time += dt;
    const b = w.b, p = this.pos, thinX = b.max[0] - b.min[0] < b.max[2] - b.min[2];
    // off the end of the wall, out of time, or steering away: let go
    const past = thinX ? p.z < b.min[2] - 0.3 || p.z > b.max[2] + 0.3 : p.x < b.min[0] - 0.3 || p.x > b.max[0] + 0.3;
    const away = wish.x * w.n.x + wish.z * w.n.z > 0.75;
    if (past || w.time > WALL_T || away || p.y + this.h * 0.5 < b.min[1]) { this.lastWall = b; this.wallCd = 0.4; this.wall = null; return; }
    const along = Math.max(11, Math.abs(this.vel.x * w.t.x + this.vel.z * w.t.z));
    this.vel.x = w.t.x * along - w.n.x * 1.5; this.vel.z = w.t.z * along - w.n.z * 1.5; // a little pull keeps you on it
    this.vel.y = Math.max(this.vel.y - 6 * dt, -2.5); // a slow sink, faster near the end
    if (w.time > WALL_T * 0.7) this.vel.y -= 14 * dt;
  }

  camera(dt, I, settings) {
    const c = this.cam;
    const tilt = this.wall ? -(this.wall.n.x * Math.cos(this.yaw) - this.wall.n.z * Math.sin(this.yaw)) * 0.14 : 0;
    this.roll += (tilt - this.roll) * Math.min(1, dt * 10);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && sp > 1 && !this.sliding) this.bob += dt * sp * 1.1;
    this.landDip = Math.max(0, this.landDip - dt * 4);
    this.fovKick = Math.max(0, this.fovKick - dt * 3);
    const bob = settings.bob ? Math.sin(this.bob) * 0.045 * Math.min(1, sp / RUN) : 0;
    c.position.set(this.pos.x, this.pos.y + this.h - 0.12 + bob - this.landDip * 0.25, this.pos.z);
    c.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    const fov = settings.fov + Math.min(12, Math.max(0, sp - RUN) * 1.2) + this.fovKick * 10;
    if (Math.abs(c.fov - fov) > 0.05) { c.fov += (fov - c.fov) * Math.min(1, dt * 8); c.updateProjectionMatrix(); }
  }
}
