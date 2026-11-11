// You: running, jumping (plus one air jump), wall-running, sliding, dashing, launch pads, and the camera.
// Collision is box against box (the level is all boxes), one axis at a time, with small steps climbed.
import * as THREE from 'three';
import { KIND } from './levels.js';

const R = 0.34, H_STAND = 1.8, H_SLIDE = 0.95;
const RUN = 10.5, ACC_G = 70, ACC_A = 22, FRICTION = 12, GRAV = 28, JUMP = 11, PAD = 22, TERMINAL = 40;
const DASH = 26, DASH_T = 0.16, WALL_T = 1.9;

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
    if (jumpHit) this.jumpBuf = 0.13;
    this.jumpBuf -= dt; this.coyote -= dt; this.wallCd -= dt; this.dashCd -= dt; this.padT -= dt;

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

    if (this.pos.y < L.killY) { this.alive = false; ev.push('fell'); }
    this.camera(dt, I, settings);
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
