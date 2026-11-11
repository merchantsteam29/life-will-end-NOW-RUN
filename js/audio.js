// All sound is synthesized: gun, blade, deflects, footsteps, the city's rain, and a synthwave loop per chapter.
let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, vol = { master: 0.8, music: 0.6 };
export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = vol.master;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = vol.music * 0.5; musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}
export function setVolume(m, mu) { vol.master = m; vol.music = mu; if (master) master.gain.value = m; if (musicBus) musicBus.gain.value = mu * 0.5; }
export function suspend(on) { if (!ac) return; if (on) ac.suspend().catch(() => {}); else ac.resume().catch(() => {}); }
const now = () => ac.currentTime;
function tone(f, dur, { type = 'sine', gain = 0.2, f2 = null, delay = 0, bus = sfxBus, attack = 0.004 } = {}) {
  if (!ac) return;
  const t = now() + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { f = 1200, q = 1, type = 'bandpass', gain = 0.3, f2 = null, delay = 0, bus = sfxBus } = {}) {
  if (!ac) return;
  const t = now() + delay, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
export const sfx = {
  shoot() { noise(0.12, { f: 2400, f2: 600, q: 0.8, gain: 0.55 }); tone(180, 0.12, { type: 'square', gain: 0.18, f2: 60 }); tone(1600, 0.05, { type: 'triangle', gain: 0.08 }); },
  empty() { tone(2200, 0.03, { type: 'square', gain: 0.05 }); },
  reload() { tone(700, 0.05, { type: 'square', gain: 0.06 }); tone(1100, 0.05, { type: 'square', gain: 0.06, delay: 0.12 }); },
  slash() { noise(0.18, { f: 900, f2: 4800, q: 2, gain: 0.35 }); },
  deflect() { tone(2600, 0.25, { type: 'triangle', gain: 0.18, f2: 3800 }); tone(3900, 0.18, { type: 'sine', gain: 0.1, delay: 0.02 }); noise(0.08, { f: 6000, gain: 0.2, type: 'highpass' }); },
  enemyShot() { tone(820, 0.18, { type: 'sawtooth', gain: 0.06, f2: 300 }); },
  kill() { noise(0.25, { f: 400, q: 0.7, gain: 0.45, type: 'lowpass' }); tone(140, 0.2, { type: 'square', gain: 0.12, f2: 50 }); tone(880, 0.12, { gain: 0.08, delay: 0.05 }); tone(1320, 0.18, { gain: 0.06, delay: 0.1 }); },
  clink() { tone(3200, 0.08, { type: 'triangle', gain: 0.07 }); },
  die() { noise(0.6, { f: 3000, f2: 200, q: 0.5, gain: 0.5 }); tone(400, 0.5, { type: 'sawtooth', gain: 0.15, f2: 40 }); },
  jump() { noise(0.1, { f: 500, gain: 0.12, type: 'lowpass' }); },
  airjump() { tone(420, 0.14, { type: 'triangle', gain: 0.07, f2: 900 }); noise(0.1, { f: 1500, gain: 0.1 }); },
  dash() { noise(0.25, { f: 300, f2: 3000, q: 1.5, gain: 0.32 }); },
  land() { noise(0.08, { f: 200, gain: 0.3, type: 'lowpass' }); },
  wallrun() { noise(0.35, { f: 2600, f2: 1800, q: 3, gain: 0.08 }); },
  pad() { tone(200, 0.35, { type: 'sine', gain: 0.25, f2: 900 }); noise(0.2, { f: 2000, gain: 0.12 }); },
  checkpoint() { tone(660, 0.18, { gain: 0.1 }); tone(990, 0.3, { gain: 0.1, delay: 0.09 }); },
  focus(on) { tone(on ? 300 : 600, 0.3, { type: 'sine', gain: 0.12, f2: on ? 120 : 1200 }); },
  step(run) { noise(0.04, { f: run ? 700 : 500, gain: run ? 0.08 : 0.05 }); },
  radio() { noise(0.12, { f: 2000, q: 3, gain: 0.08 }); tone(1800, 0.04, { type: 'square', gain: 0.03 }); },
  type() { tone(1400 + Math.random() * 400, 0.015, { type: 'square', gain: 0.012 }); },
  clear() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.1, delay: i * 0.1 })); },
  bossHit() { tone(90, 0.8, { type: 'sawtooth', gain: 0.3, f2: 40 }); noise(0.5, { f: 600, gain: 0.4 }); },
};

// ---------- music: a slow synthwave loop (bass, arpeggio, pad), key and tempo per chapter ----------
const SCALES = { 1: [57, [0, 3, 7, 10]], 2: [55, [0, 3, 7, 12]], 3: [53, [0, 5, 7, 10]], 4: [58, [0, 4, 7, 11]], 5: [50, [0, 3, 7, 10]], 6: [52, [0, 1, 7, 8]], 0: [45, [0, 3, 7, 10]] };
let musicT = null, step = 0;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
export function music(id, intensity = 1) {
  if (musicT) { clearInterval(musicT); musicT = null; }
  if (!ac || id == null) return;
  const [root, iv] = SCALES[id] || SCALES[0], bpm = id === 6 ? 128 : id === 0 ? 84 : 112, sixteenth = 60 / bpm / 4;
  const prog = [0, -4, -2, -5];
  step = 0;
  musicT = setInterval(() => {
    if (!ac || ac.state !== 'running') return;
    const bar = Math.floor(step / 16) % 4, s = step % 16, r = root + prog[bar];
    if (s % 4 === 0) tone(midi(r - 12), sixteenth * 3.6, { type: 'sawtooth', gain: 0.07, bus: musicBus });
    if (intensity > 0 && s % 2 === 0) tone(midi(r + 12 + iv[(s / 2) % iv.length]), sixteenth * 1.6, { type: 'square', gain: 0.025, bus: musicBus });
    if (s === 0) for (const k of [0, iv[1], iv[2]]) tone(midi(r + k), sixteenth * 15, { type: 'triangle', gain: 0.03, bus: musicBus, attack: 0.3 });
    if (id !== 0 && intensity > 0) { if (s % 4 === 0) noise(0.08, { f: 120, type: 'lowpass', gain: 0.22, bus: musicBus }); if (s % 8 === 4) noise(0.12, { f: 3000, type: 'highpass', gain: 0.07, bus: musicBus }); if (s % 2 === 1) noise(0.03, { f: 8000, type: 'highpass', gain: 0.02, bus: musicBus }); }
    step++;
  }, sixteenth * 1000);
}
