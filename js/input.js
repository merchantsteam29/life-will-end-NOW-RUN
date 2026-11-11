// Keyboard + mouse (pointer lock) and controllers, read once a frame into one state object.
// Controllers: standard-mapping pads only (wheels / flight sticks rest off-centre and spun the camera in
// other games), and an axis only counts once it has been seen centred.
const BAD_PAD = /wheel|joystick|flight|pedal|tablet|throttle|rudder|hotas|stick|g29|g920|t300|wacom/i;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set(); this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.lmb = false; this.rmb = false; this.lmbHit = false; this.rmbHit = false;
    this.pads = true; this.padMode = false; this.padSt = {}; this.padIdx = -1; this.pad = null; this.padSens = 1;
    addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code); this.padMode = false;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.lmb = this.rmb = false; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; this.padMode = false; } });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.lmb = true; this.lmbHit = true; } if (e.button === 2) { this.rmb = true; this.rmbHit = true; }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  get locked() { return document.pointerLockElement === this.canvas; }
  lock() {
    if (this.locked || !this.canvas.requestPointerLock) return;
    const plain = () => { try { const r = this.canvas.requestPointerLock(); r?.catch?.(() => {}); } catch { /* needs a click first */ } };
    try { const r = this.canvas.requestPointerLock({ unadjustedMovement: true }); r?.catch?.(plain); } catch { plain(); }
  }
  unlock() { if (this.locked) document.exitPointerLock(); }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  // the controller, mapped onto the same actions
  pollPad(dt) {
    this.pad = null;
    if (!this.pads || !navigator.getGamepads) return;
    let cur = null;
    for (const g of navigator.getGamepads()) {
      if (!g || !g.connected || g.mapping !== 'standard' || BAD_PAD.test(g.id)) continue;
      const st = this.padSt[g.index] || (this.padSt[g.index] = { c: g.axes.map(() => false), prev: g.buttons.map(() => true) });
      g.axes.forEach((v, i) => { if (Math.abs(v) < 0.2) st.c[i] = true; });
      const fresh = g.buttons.some((b, i) => b.pressed && !st.prev[i]), moved = g.axes.some((v, i) => st.c[i] && Math.abs(v) > 0.5);
      if (fresh || moved) { this.padIdx = g.index; this.padMode = true; }
      if (g.index === this.padIdx) cur = { g, st }; else st.prev = g.buttons.map((b) => b.pressed);
    }
    if (!cur) return;
    const { g, st } = cur, prev = st.prev; st.prev = g.buttons.map((b) => b.pressed);
    const ax = (i) => { const v = st.c[i] ? g.axes[i] || 0 : 0; return Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85; };
    const btn = (i) => !!(g.buttons[i] && g.buttons[i].pressed), hit = (i) => btn(i) && !prev[i];
    this.pad = { mx: ax(0), mz: -ax(1), lx: ax(2), ly: ax(3), jump: hit(0), jumpHeld: btn(0), slide: btn(1), dash: hit(5) || hit(10), fire: btn(7), fireHit: hit(7), blade: btn(6), bladeHit: hit(6) || hit(2), focus: btn(4) || btn(11), pause: hit(9), restart: hit(8), up: hit(12), downB: hit(13), a: hit(0), b: hit(1) };
    // look with the right stick, a little curve for fine aim
    const k = 380 * this.padSens * dt;
    this.dx += Math.sign(this.pad.lx) * this.pad.lx * this.pad.lx * k * 6; this.dy += Math.sign(this.pad.ly) * this.pad.ly * this.pad.ly * k * 4;
  }
  endFrame() { this.pressed.clear(); this.dx = 0; this.dy = 0; this.lmbHit = false; this.rmbHit = false; }
}
