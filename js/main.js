// LIFE WILL END: NOW RUN. The game: chapters, checkpoints, deaths, focus, the radio, results, menus, saves.
import * as THREE from 'three';
import { CHAPTERS, buildChapter } from './levels.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { makeViewmodel } from './models.js';
import { Input, LABELS } from './input.js';
import { initAudio, sfx, music, setVolume, suspend, setListener, setSpatial } from './audio.js';
import { voice } from './voice.js';
import { createGovernor } from '../perf.js';

const $ = (id) => document.getElementById(id);
const TEST = /[?&]test\b/.test(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('lwe.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lwe.' + k, JSON.stringify(v)); } catch { /* full or blocked */ } },
};
const DEF = { sens: 1, padSens: 1, touchSens: 1, fov: 95, vol: 0.8, music: 0.55, invert: false, bob: true, shake: true, autoRes: true, pads: true, rumble: true, voices: true, voiceVol: 1, surround: true };
const settings = { ...DEF, ...store.get('settings', {}) };
const progress = { unlocked: 1, best: {}, ...store.get('progress', {}) };
const stats = { kills: 0, blade: 0, deflects: 0, deaths: 0, chapters: 0, ...store.get('stats', {}) };
const saveAll = () => { store.set('settings', settings); store.set('progress', progress); store.set('stats', stats); };

// ---------- renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const COARSE = matchMedia('(pointer: coarse)').matches;
const baseRatio = () => Math.min(devicePixelRatio, COARSE ? 1.25 : 1.75);
renderer.setPixelRatio(baseRatio());
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const gov = createGovernor({ apply: (s) => { renderer.setPixelRatio(baseRatio() * s); resize(); } });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 1200);
// the viewmodel (gun in the right hand, blade in the left) draws on top
const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0x8899ff, 0x220a20, 1.6)); const vmKey = new THREE.DirectionalLight(0xffffff, 1.2); vmKey.position.set(1, 2, 1); vmScene.add(vmKey);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = vmCam.aspect = w / h; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const VM = makeViewmodel(); vmScene.add(VM.g); VM.g.scale.setScalar(0.62); VM.g.position.set(0.04, -0.02, -0.08);
VM.blade.rotation.set(0.35, 0.3, 0.75);

// ---------- prompts: the names of the buttons on whatever you're holding ----------
function keyNames() {
  const I = input;
  if (I.padMode) { const L = LABELS[I.kind] || LABELS.xbox; return { jump: L[0], slide: L[1] + ' (hold)', dash: L[5], shoot: L[7], blade: L[6], focus: L[4], restart: L[8], pause: L[9] }; }
  if (I.touchMode) return { jump: 'JUMP', slide: 'SLIDE', dash: 'DASH', shoot: 'FIRE', blade: 'BLADE', focus: 'FOCUS', restart: 'pause > checkpoint', pause: 'II' };
  return { jump: 'Space', slide: 'C', dash: 'Shift', shoot: 'Left click', blade: 'Right click', focus: 'Q', restart: 'R', pause: 'Esc' };
}
const fillKeys = (t) => { const k = keyNames(); return t.replace(/\{(\w+)\}/g, (_, n) => k[n] || n); };
const PAD_NAMES = { xbox: 'Xbox controller', ps: 'PlayStation controller', deck: 'Steam Deck', steam: 'Steam Controller', switch: 'Switch controller' };
function refreshPrompts() {
  const I = input, mode2 = I.padMode ? 'pad' : I.touchMode ? 'touch' : 'keys';
  document.body.classList.remove('m-keys', 'm-pad', 'm-touch'); document.body.classList.add('m-' + mode2);
  const k = keyNames();
  $('focusLbl').textContent = mode2 === 'touch' ? 'FOCUS' : `FOCUS [${k.focus}]`;
  const L = LABELS[I.kind] || LABELS.xbox;
  $('padTitle').textContent = 'CONTROLLER · ' + (PAD_NAMES[I.kind] || 'controller').toUpperCase();
  $('padMap').innerHTML = [['Left stick / D-pad', 'Move'], ['Right stick', 'Look'], [L[0], 'Jump (and wall-jump)'], [L[1] + ' / ' + L[11], 'Slide (hold)'], [L[5] + ' / ' + L[10], 'Dash'],
    [L[7], 'Shoot'], [L[6] + ' / ' + L[2], 'Blade (and deflect)'], [L[4], 'Focus (hold)'], [L[8], 'Back to checkpoint'], [L[9], 'Pause']].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  const hello = I.gp ? `${PAD_NAMES[I.kind] || 'Controller'} connected · ${L[0]} to choose, ${L[1]} to go back` : 'Controller ready';
  $('padHello').textContent = hello; $('padNow').textContent = I.padMode ? hello : 'Plug in or pair a controller and press any button.';
  if (radioCur) $('radioTxt').textContent = fillKeys(radioCur.line.t).slice(0, radioCur.shown);
}

// ---------- state ----------
const input = new Input(canvas);
input.bindTouch($('touch'));
input.onKind = () => refreshPrompts();
document.addEventListener('touchstart', () => { if (!input.padMode && !input.touchMode) { input.setMode('touch'); refreshPrompts(); } }, { passive: true });
const player = new Player(camera);
let ch = null, L = null, world = null, enemies = null, boxes = [];
let mode = 'title'; // title | intro | play | dead | paused | result | ending
let runT = 0, deaths = 0, kills = 0, cpIdx = -1, deadAtCp = new Set(), saidDone = new Set(), clock = 0;
let ammo = 6, reloadT = 0, fireCd = 0, bladeCd = 0, deflectT = 0, focus = 1, focusOn = false, bossKilled = false, chapterDeaths = 0;
let radioQ = [], radioT = 0, radioCur = null, hintT = 0, introT = 0, deadT = 0, flashT = 0, shake = 0, endT = 0;

function show(id, on) { $(id).hidden = !on; }
function screens(id) { for (const s of ['title', 'chapters', 'how', 'settings', 'pause', 'result', 'ending']) show(s, s === id); }
function hint(t, sec = 2.5) { $('hint').textContent = t; $('hint').classList.add('on'); hintT = sec; }
function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; }

// ---------- chapters ----------
function loadChapter(id) {
  if (world) { world.dispose(); world = null; }
  if (enemies) { enemies.clear(); scene.remove(enemies.group); }
  ch = CHAPTERS.find((c) => c.id === id); L = buildChapter(ch);
  world = buildWorld(scene, L, ch); boxes = L.boxes;
  enemies = new Enemies(scene, ch.neon);
  enemies.onCoreHit = (core) => {
    sfx.bossHit(enemies.center(core)); shake = 1; flashT = 0.4;
    const lines = [[{ who: 'HALCYON', t: 'YOU CANNOT CUT THE SEA.' }], [{ who: 'HALCYON', t: 'STOP. STOP. THE WATER IS ALREADY HERE.' }]][2 - core.hp] || [];
    queue([...lines, { who: 'WREN', t: core.hp === 2 ? "It's re-arming! Drones incoming. Hit it again when the shell opens!" : 'One more!' }]);
    for (let i = 0; i < 2; i++) { const a = Math.random() * 6.28; enemies.spawn({ type: 'drone', p: [core.home.x + Math.cos(a) * 12, core.home.y + 1, core.home.z + Math.sin(a) * 12] }, 1000 + Math.floor(Math.random() * 1e6)).aware = true; }
  };
  enemies.onKill = onKill; enemies.onHit = () => die('shot'); enemies.onTouch = () => die('charger'); 
  enemies.onFire = (e) => sfx.enemyShot(enemies.center(e), e.type); enemies.onTele = (e) => sfx.tele(enemies.center(e), e.type, e.T.tele);
  enemies.onWhiz = (b) => sfx.whiz(b.pos); enemies.onStep = (e) => sfx.thud(e.pos);
  enemies.onImpact = (p) => { if (p.distanceTo(camera.position) < 40) sfx.impact(p); };
  radioQ = []; radioCur = null; radioT = 0.6; voice.cancel(); $('radio').classList.remove('on'); hintT = 0; $('hint').classList.remove('on');
  cpIdx = -1; deadAtCp = new Set(); saidDone = new Set(); runT = 0; deaths = 0; kills = 0; bossKilled = false; chapterDeaths = 0;
  spawnFromCheckpoint();
  // compile every shader now, under the title card, so the first look at things doesn't stutter
  try { renderer.compile(scene, camera); renderer.compile(vmScene, vmCam); } catch { /* fine */ }
  $('chapLbl').textContent = `${ch.id} · ${ch.name}`;
  $('boss').hidden = !ch.boss;
}
function spawnFromCheckpoint() {
  enemies.clear();
  L.enemies.forEach((d, i) => { if (!deadAtCp.has(i)) enemies.spawn(d, i); });
  const cp = cpIdx >= 0 ? L.checkpoints[cpIdx].p : [L.spawn.x, L.spawn.y, L.spawn.z];
  player.reset(new THREE.Vector3(...cp), 0);
  ammo = 6; reloadT = 0; focus = Math.max(focus, 0.5); fireCd = 0.2; bladeCd = 0;
  if (world) for (const b of L.movers) b.delta = null;
}
function startChapter(id) {
  initAudio(); loadChapter(id);
  screens(null); show('hud', true);
  mode = 'intro'; introT = TEST ? 0.3 : 2.6;
  $('introNum').textContent = ch.boss ? 'FINAL CHAPTER' : `CHAPTER ${ch.id}`; $('introName').textContent = ch.name; $('introSub').textContent = ch.sub;
  $('intro').classList.add('on');
  music(ch.id); input.lock(); document.body.classList.add('playing');
  if (input.touchMode && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}
function onKill(e, how) {
  kills++; stats.kills++; sfx.kill(enemies.center(e)); input.rumble(0.3, 0.5, 80);
  if (how === 'blade') { stats.blade++; ammo = Math.min(6, ammo + 2); }
  if (how === 'deflect') stats.deflects++;
  focus = Math.min(1, focus + 0.25);
  $('cross').classList.add('hit'); setTimeout(() => $('cross').classList.remove('hit'), 120);
  shake = Math.max(shake, 0.25);
  if (e.type === 'core') { bossKilled = true; sfx.bossHit(enemies.center(e)); }
  if (e.type === 'pylon') { sfx.bossHit(enemies.center(e)); const left = enemies.list.filter((o) => o.type === 'pylon' && !o.dead).length; hint(left ? `PYLON DOWN · ${left} LEFT` : 'THE CORE IS OPEN · CUT IT', 2.5); if (!left) queue([{ who: 'WREN', t: 'Its shield is down! Get up there and cut it!' }]); }
  saveAll();
}
function die(why) {
  if (mode !== 'play') return;
  if (TEST && window.__lwGod) return;
  player.alive = false; mode = 'dead'; deadT = TEST ? 0.2 : 0.75; deaths++; chapterDeaths++; stats.deaths++;
  sfx.die(); input.rumble(1, 0.8, 350); $('dead').classList.add('on'); flashT = 0.3; shake = 0.6; focusOn = false;
  $('deaths').textContent = `DEATHS ${deaths}`;
}
function respawn() { $('dead').classList.remove('on'); spawnFromCheckpoint(); mode = 'play'; }
function finishChapter() {
  document.body.classList.remove('playing');
  mode = 'result'; input.unlock(); music(0, 0);
  sfx.clear();
  const par = ch.par, t = runT;
  const rank = t <= par * 0.85 && deaths === 0 ? 'S' : t <= par && deaths <= 2 ? 'A' : t <= par * 1.5 && deaths <= 6 ? 'B' : 'C';
  const prev = progress.best[ch.id], order = 'SABC';
  const better = !prev || order.indexOf(rank) < order.indexOf(prev.rank) || (rank === prev.rank && t < prev.time);
  if (better) progress.best[ch.id] = { rank, time: t, deaths };
  if (prev && t < prev.time) progress.best[ch.id].time = t;
  progress.unlocked = Math.max(progress.unlocked, Math.min(CHAPTERS.length, ch.id + 1));
  stats.chapters++;
  if (deaths === 0) stats.flawless = (stats.flawless || 0) + 1;
  if (rank === 'S') stats.sranks = (stats.sranks || 0) + 1;
  saveAll();
  if (ch.boss) { showEnding(); return; }
  show('hud', false); screens('result');
  $('resTitle').textContent = `${ch.name} · CLEAR`;
  $('resRank').textContent = rank;
  const best = progress.best[ch.id];
  $('resStats').innerHTML = `<dt>Time</dt><dd>${fmt(t)}</dd><dt>Par</dt><dd>${fmt(par)}</dd><dt>Deaths</dt><dd>${deaths}</dd><dt>Kills</dt><dd>${kills}</dd><dt>Best</dt><dd>${best.rank} · ${fmt(best.time)}</dd>`;
  $('btnNext').hidden = ch.id >= CHAPTERS.length;
  $('btnNext').focus();
}
const ENDING = [
  'The core goes dark. For a second the whole Spire hums, then nothing.',
  'Far below, the sea gates grind to a stop, half open, and hold.',
  'The Lower Ring wakes up wet, and alive.',
  'WREN: "Courier? ...Courier. You can stop running now."',
  'You sit down on the edge of the Spire and watch the sun come up over the water.',
];
function showEnding() {
  mode = 'ending'; show('hud', false); screens('ending'); music(0, 0); input.unlock();
  $('endText').innerHTML = ENDING.map((l, i) => `<p style="animation-delay:${i * 2.4}s">${l}</p>`).join('') +
    `<p style="animation-delay:${ENDING.length * 2.4}s;font-family:var(--f-head);font-size:28px;letter-spacing:.2em;color:var(--gold)">LIFE DID NOT END</p>` +
    `<div class="row" style="opacity:0;animation:up .9s forwards;animation-delay:${ENDING.length * 2.4 + 1.5}s"><button class="primary" id="btnEndMenu">Title</button></div>`;
  $('btnEndMenu').onclick = toTitle;
  if (settings.voices) { voice.cancel(); ENDING.forEach((l, i) => setTimeout(() => { if (mode !== 'ending') return; const m = l.match(/^WREN: "(.*)"$/); voice.say(m ? 'WREN' : 'NARRATOR', m ? m[1] : l); }, i * 2400 + 400)); setTimeout(() => mode === 'ending' && voice.say('NARRATOR', 'Life did not end.'), ENDING.length * 2400 + 600); }
}
function toTitle() { voice.cancel(); document.body.classList.remove('playing'); titleLoaded = false; mode = 'title'; input.unlock(); show('hud', false); screens('title'); music(0, 0.3); refreshTitle(); if (world) { world.dispose(); world = null; } if (enemies) enemies.clear(); }

// ---------- the radio ----------
function queue(lines) { radioQ.push(...lines); }
function updateRadio(dt) {
  if (radioCur) {
    radioCur.t += dt;
    const full = fillKeys(radioCur.line.t), shown = Math.min(full.length, Math.floor(radioCur.t * 55));
    if (shown > radioCur.shown) { radioCur.shown = shown; if (shown % 3 === 0) sfx.type(); $('radioTxt').textContent = full.slice(0, shown); }
    if (radioCur.t > (radioCur.spoken ? 0.5 + full.length * 0.03 : 1.6 + full.length * 0.045) && (radioCur.spoken !== false || radioCur.t > 16)) { radioCur = null; $('radio').classList.remove('on'); radioT = 0.25; }
    return;
  }
  radioT -= dt;
  if (radioT <= 0 && radioQ.length) {
    const line = radioQ.shift(); radioCur = { line, t: 0, shown: 0 };
    if (settings.voices) { const cur = radioCur; cur.spoken = false; setTimeout(() => { if (radioCur === cur) voice.say(line.who, fillKeys(line.t), () => { cur.spoken = true; }); }, 180); }
    $('radioWho').textContent = line.who; $('radioTxt').textContent = '';
    $('radio').className = 'on ' + (line.who === 'HALCYON' ? 'halcyon' : line.who === 'YOU' ? 'you' : '');
    sfx.radio();
  }
}

// ---------- a frame of play ----------
function updatePlay(dt, rawDt) {
  const I = input, P = I.pad;
  // focus: hold to slow the world (you slow less)
  const wantFocus = (I.down('KeyQ') || (P && P.focus)) && focus > 0.02;
  if (wantFocus !== focusOn) { focusOn = wantFocus; sfx.focus(focusOn); $('fx').className = focusOn ? 'focus' : ''; }
  if (focusOn) focus = Math.max(0, focus - rawDt * 0.45); else focus = Math.min(1, focus + rawDt * 0.03);
  const worldDt = dt * (focusOn ? 0.3 : 1), meDt = dt * (focusOn ? 0.62 : 1);
  runT += rawDt; clock += worldDt;

  world.update(clock, worldDt, camera.position);
  player.update(meDt, I, L, boxes, settings);
  for (const e of player.events) {
    if (e === 'jump') sfx.jump(); else if (e === 'airjump') sfx.airjump(); else if (e === 'dash') sfx.dash(); else if (e === 'land') sfx.land();
    else if (e === 'wallrun') { sfx.wallrun(); input.rumble(0, 0.2, 80); } else if (e === 'walljump') sfx.jump(); else if (e === 'pad') { sfx.pad(); input.rumble(0.5, 0.3, 140); } else if (e === 'slide') sfx.dash(); else if (e === 'fell') die('fell');
  }
  player.events.length = 0;
  if (mode !== 'play') return;

  // gun
  fireCd -= meDt; bladeCd -= meDt;
  if (reloadT > 0) { reloadT -= meDt; if (reloadT <= 0) { ammo = 6; sfx.reload(); } }
  const fire = I.lmb || (P && P.fire), fireHit = I.lmbHit || (P && P.fireHit);
  if ((fire || fireHit) && fireCd <= 0 && reloadT <= 0) {
    if (ammo > 0) {
      ammo--; fireCd = 0.2; sfx.shoot(); VM.kick = 1; shake = Math.max(shake, 0.08);
      let aim = player.forward;
      if (input.padMode || input.touchMode) {
        const eye = camera.position, cone = input.touchMode ? 0.12 : 0.075; let best = cone;
        for (const e of enemies.list) { if (e.dead) continue; const d = enemies.center(e).sub(eye), dist = d.length(); if (dist > 60) continue; const ang = d.normalize().angleTo(player.forward) - Math.atan2(e.T.r, dist); if (ang < best) { best = ang; aim = d.clone(); } }
      }
      const r = enemies.shoot(camera.position.clone(), aim, boxes);
      input.rumble(0.15, 0.35, 60);
      if (!r.enemy && r.wall) { enemies.spark(r.point, 0x9ff8ff, 4); sfx.impact(r.point); }
      if (r.blocked) sfx.clink(r.point);
      if (ammo === 0) reloadT = 1.0;
    } else if (fireHit) { sfx.empty(); if (reloadT <= 0) reloadT = 1.0; }
  }
  // blade: a cut, and a short window that sends shots back
  if ((I.rmbHit || (P && P.bladeHit)) && bladeCd <= 0) {
    bladeCd = 0.38; VM.swing = 1; sfx.slash(); deflectT = 0.2;
    const reach = player.dashT > 0 ? 4.6 : 3.3;
    enemies.slash(camera.position.clone(), player.forward, reach, boxes);
  }
  if (deflectT > 0) {
    deflectT -= meDt;
    const n = enemies.deflect(camera.position.clone(), player.forward);
    if (n) { sfx.deflect(); input.rumble(0.4, 0.9, 90); focus = Math.min(1, focus + 0.1 * n); hint('DEFLECTED', 0.6); }
  }
  enemies.update(worldDt, player, boxes);
  if (mode !== 'play') return;

  // checkpoints
  L.checkpoints.forEach((c, i) => {
    if (i <= cpIdx) return;
    if (Math.hypot(player.pos.x - c.p[0], player.pos.z - c.p[2]) < 3.5 && Math.abs(player.pos.y - c.p[1]) < 3) {
      cpIdx = i; deadAtCp = new Set(enemies.list.filter((e) => e.dead).map((e) => e.idx)); sfx.checkpoint();
      if (world.cps[i]) world.cps[i].material.color.setHex(ch.accent);
    }
  });
  // story lines as you pass
  L.says.forEach((s, i) => { if (!saidDone.has(i) && player.pos.z < s.z) { saidDone.add(i); queue(s.lines); } });
  // the exit, or the boss
  if (L.exit && Math.hypot(player.pos.x - L.exit.p[0], player.pos.z - L.exit.p[2]) < 2.4 && Math.abs(player.pos.y - L.exit.p[1]) < 3) finishChapter();
  if (ch.boss) {
    const core = enemies.list.find((e) => e.type === 'core');
    if (core) $('bossBar').style.width = (core.dead ? 0 : (core.hp / core.T.hp) * 100) + '%';
    if (bossKilled && !endT) endT = 2.5;
    if (endT > 0) { endT -= rawDt; if (endT <= 0) { endT = 0; finishChapter(); } }
  }
  // restart from the checkpoint
  if (I.hit('KeyR') || (P && P.restart)) die('restart');
}

// ---------- HUD ----------
const hudLast = {};
const setOnce = (k, v, fn) => { if (hudLast[k] !== v) { hudLast[k] = v; fn(v); } };
function updateHud() {
  setOnce('t', fmt(runT), (v) => { $('timer').textContent = v; });
  setOnce('a', ammo + '|' + (reloadT > 0), () => { $('ammo').innerHTML = (reloadT > 0 ? '<span>RELOADING</span>' : '') + Array.from({ length: 6 }, (_, i) => `<i class="${i < ammo ? '' : 'off'}"></i>`).join(''); });
  setOnce('f', (focus * 100).toFixed(0), (v) => { $('focusBar').style.width = v + '%'; });
}

// ---------- the viewmodel ----------
function updateVM(dt) {
  VM.kick = Math.max(0, VM.kick - dt * 9); VM.swing = Math.max(0, VM.swing - dt * 3.2);
  const sp = Math.hypot(player.vel.x, player.vel.z), bob = settings.bob && player.grounded ? Math.sin(player.bob * 1) * 0.012 * Math.min(1, sp / 10) : 0;
  VM.gun.position.set(0.27, -0.27 + bob - VM.kick * 0.02, -0.62 + VM.kick * 0.07); VM.gun.rotation.x = VM.kick * 0.25;
  VM.flash.material.opacity = VM.kick > 0.75 ? 1 : 0; VM.flash.rotation.z = Math.random() * 6; VM.muzzle.intensity = VM.kick > 0.6 ? 3 : 0;
  // the cut: a fast arc from upper left across
  const s = VM.swing, k = s > 0 ? 1 - s : 0, arc = s > 0 ? Math.sin(Math.min(1, k * 1.6) * Math.PI) : 0;
  VM.blade.position.set(-0.36 + arc * 0.36, -0.32 + arc * 0.18 + bob, -0.6 - arc * 0.08);
  VM.blade.rotation.set(0.35 - arc * 0.6, 0.3 + arc * 1.2, 0.75 - arc * 2.1);
  const ec = deflectT > 0 ? 0x9ff8ff : 0xff2f6d; VM.edge.material.color.setHex(ec); VM.edgeGlow.material.color.setHex(ec); VM.edgeGlow.material.opacity = 0.3 + arc * 0.6;
  VM.g.rotation.z = player.roll * 0.6;
}

// ---------- main loop ----------
let last = performance.now(); const _fw = new THREE.Vector3(), _up = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.1, (now - last) / 1000); last = now;
  const dt = Math.min(0.033, raw);
  input.pollPad(dt); input.padSens = settings.padSens; input.pads = settings.pads; input.touchSens = settings.touchSens; input.rumbleOn = settings.rumble;
  const P = input.pad;
  if (mode === 'play' || mode === 'dead' || mode === 'intro') {
    if (settings.autoRes) gov.tick(raw);
    if ((input.hit('Escape') || (P && P.pause)) && mode !== 'intro') pause(true);
    if (mode === 'intro') {
      introT -= raw; world.update(clock += dt, dt, camera.position); player.camera(dt, input, settings);
      if (introT <= 0) { mode = 'play'; $('intro').classList.remove('on'); }
    } else if (mode === 'play') updatePlay(dt, raw);
    else if (mode === 'dead') { deadT -= raw; world.update(clock += dt * 0.2, dt * 0.2, camera.position); enemies.update(dt * 0.2, player, boxes); if (deadT <= 0) respawn(); }
    updateRadio(raw); updateHud(); updateVM(raw);
    if (hintT > 0) { hintT -= raw; if (hintT <= 0) $('hint').classList.remove('on'); }
    flashT = Math.max(0, flashT - raw); $('flash').style.opacity = settings.shake ? (flashT * 1.2).toFixed(2) : 0;
    shake = Math.max(0, shake - raw * 2.5);
    if (settings.shake && shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.15; camera.position.y += (Math.random() - 0.5) * shake * 0.15; }
    camera.getWorldDirection(_fw); _up.set(0, 1, 0).applyQuaternion(camera.quaternion); setListener(camera.position, _fw, _up);
    renderer.autoClear = true; renderer.render(scene, camera);
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, vmCam);
  } else if (mode === 'paused' && world) {
    renderer.autoClear = true; renderer.render(scene, camera);
  } else {
    titleScene(raw);
  }
  menuNav(raw);
  input.endFrame();
}

// ---------- title backdrop: the first chapter's rooftops, slowly circling ----------
let titleT = 0, titleLoaded = false;
function titleScene(dt) {
  if (mode === 'title' && !titleLoaded) {
    titleLoaded = true;
    const c = CHAPTERS[0]; L = buildChapter(c); ch = c; world = buildWorld(scene, L, c); boxes = L.boxes;
  }
  if (!world) { renderer.render(scene, camera); return; }
  titleT += dt;
  const z = -40 + Math.sin(titleT * 0.05) * 30;
  camera.position.set(Math.cos(titleT * 0.08) * 18, 9 + Math.sin(titleT * 0.2) * 2, z + Math.sin(titleT * 0.08) * 18);
  camera.lookAt(0, 2, z - 6);
  world.update(titleT, dt, camera.position);
  renderer.autoClear = true; renderer.render(scene, camera);
}

// ---------- pause / menus ----------
function pause(on) {
  if (on && (mode === 'play' || mode === 'dead')) { document.body.classList.remove('playing'); mode = 'paused'; input.unlock(); screens('pause'); $('pauseInfo').textContent = `${ch.name} · ${fmt(runT)} · deaths ${deaths}`; suspend(false); voice.pause(); $('btnResume').focus(); }
  else if (!on && mode === 'paused') { document.body.classList.add('playing'); screens(null); mode = player.alive ? 'play' : 'dead'; input.lock(); voice.resume(); last = performance.now(); }
}
document.addEventListener('pointerlockchange', () => { if (!input.locked && mode === 'play' && !input.padMode && !input.touchMode && !TEST) pause(true); });
canvas.addEventListener('click', () => { if (mode === 'play' && !input.locked && !input.padMode && !input.touchMode) input.lock(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (mode === 'play' || mode === 'dead')) pause(true); });

let backTo = 'title';
function refreshTitle() {
  $('btnPlay').textContent = progress.unlocked > 1 ? `Continue · Chapter ${progress.unlocked}` : 'Start';
}
function chapterList() {
  $('chapList').innerHTML = CHAPTERS.map((c) => {
    const lock = c.id > progress.unlocked, b = progress.best[c.id];
    return `<button class="chapter" data-ch="${c.id}" ${lock ? 'disabled' : ''}><span class="n">${c.id}</span><span><b>${lock ? '???' : c.name}</b><small>${lock ? 'Locked' : c.sub}</small></span><span class="rk">${b ? b.rank : ''}<small>${b ? fmt(b.time) : ''}</small></span></button>`;
  }).join('');
}
$('btnPlay').onclick = () => startChapter(Math.min(progress.unlocked, CHAPTERS.length));
$('btnChapters').onclick = () => { chapterList(); screens('chapters'); };
$('chapList').onclick = (e) => { const b = e.target.closest('[data-ch]'); if (b && !b.disabled) startChapter(+b.dataset.ch); };
$('btnHow').onclick = () => { refreshPrompts(); screens('how'); };
$('btnSettings').onclick = () => { backTo = 'title'; openSettings(); };
$('btnPSettings').onclick = () => { backTo = 'pause'; openSettings(); };
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { saveAll(); screens(b.closest('#settings') ? backTo : 'title'); }));
$('btnResume').onclick = () => pause(false);
$('btnCp').onclick = () => { pause(false); die('restart'); };
$('btnRestart').onclick = () => { const id = ch.id; startChapter(id); };
$('btnQuit').onclick = toTitle;
$('btnNext').onclick = () => startChapter(ch.id + 1);
$('btnAgain').onclick = () => startChapter(ch.id);
$('btnMenu').onclick = toTitle;
$('fsBtn').onclick = () => { const r = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); r?.catch?.(() => {}); };

function openSettings() {
  screens('settings');
  const bind = (id, key, fmtv) => { const el = $(id), out = $('o' + id.slice(1)); el.value = settings[key]; if (out) out.textContent = fmtv(settings[key]); el.oninput = () => { settings[key] = +el.value; if (out) out.textContent = fmtv(settings[key]); apply(); }; };
  bind('sSens', 'sens', (v) => v.toFixed(2)); bind('sPad', 'padSens', (v) => v.toFixed(2)); bind('sFov', 'fov', (v) => v + '°');
  bind('sTouch', 'touchSens', (v) => v.toFixed(2)); bind('sVol', 'vol', (v) => Math.round(v * 100) + '%'); bind('sMus', 'music', (v) => Math.round(v * 100) + '%'); bind('sVoice', 'voiceVol', (v) => Math.round(v * 100) + '%');
  for (const [id, key] of [['sInvert', 'invert'], ['sBob', 'bob'], ['sShake', 'shake'], ['sAuto', 'autoRes'], ['sPads', 'pads'], ['sRumble', 'rumble'], ['sVoices', 'voices'], ['sSurround', 'surround']]) { const el = $(id); el.checked = !!settings[key]; el.onchange = () => { settings[key] = el.checked; if (key === 'autoRes' && !el.checked) gov.reset(); apply(); }; }
}
function apply() { setVolume(settings.vol, settings.music); setSpatial(settings.surround); voice.on = settings.voices; voice.vol = settings.voiceVol * settings.vol; if (!settings.voices) voice.cancel(); saveAll(); }
apply();

// menus with a controller: up / down (stick or D-pad) moves between buttons, A / ✕ presses, B / ○ goes back
let navT = 0;
function menuNav(dt) {
  if (mode === 'play' || mode === 'dead' || mode === 'intro') return;
  const P = input.pad; if (!P || P.touch) return;
  const scr = [...document.querySelectorAll('.screen')].find((s) => !s.hidden); if (!scr) return;
  const items = [...scr.querySelectorAll('button, input')].filter((b) => !b.disabled && b.offsetParent);
  if (!items.length) return;
  let i = items.indexOf(document.activeElement);
  navT -= dt;
  const v = P.up ? -1 : P.downB ? 1 : Math.abs(P.mz) > 0.6 && navT <= 0 ? (P.mz > 0 ? -1 : 1) : 0;
  if (v) { i = i < 0 ? 0 : (i + v + items.length) % items.length; items[i].focus(); navT = 0.22; }
  else if (Math.abs(P.mz) < 0.3) navT = 0;
  const f = document.activeElement;
  // left / right nudges a slider
  if (f && f.type === 'range' && Math.abs(P.mx) > 0.6 && navT <= 0) { f.value = +f.value + Math.sign(P.mx) * (+f.step || 0.05); f.dispatchEvent(new Event('input')); navT = 0.12; }
  if (P.a && f && items.includes(f)) { if (f.type === 'checkbox') { f.checked = !f.checked; f.dispatchEvent(new Event('change')); } else f.click(); }
  if (P.b) { const back = scr.querySelector('[data-back]') || (mode === 'paused' && $('btnResume')); back?.click(); }
  if (P.pause && mode === 'paused') pause(false);
}

// ---------- sync + achievements (sync.js) ----------
if (window.GameSync) {
  const st = (g) => g('lwe.stats') || {}, pr = (g) => g('lwe.progress') || {};
  const cleared = (g, n) => !!(pr(g).best || {})[n];
  GameSync.init({ game: 'lifewillend', idle: () => mode === 'title', keys: [{ match: 'lwe.progress', mode: 'max' }, { match: 'lwe.stats', mode: 'max' }], ach: [
    { id: 'ch1', name: 'Last delivery', desc: 'Finish chapter 1', test: (g) => cleared(g, 1) },
    { id: 'ch3', name: 'Under the Ring', desc: 'Finish the Floodworks', test: (g) => cleared(g, 3) },
    { id: 'ch5', name: 'Don\'t look down', desc: 'Climb the Spire', test: (g) => cleared(g, 5) },
    { id: 'end', name: 'Life did not end', desc: 'Stop HALCYON', test: (g) => cleared(g, 6) },
    { id: 'flawless', name: 'Untouched', desc: 'Finish a chapter without dying', test: (g) => (st(g).flawless || 0) > 0 },
    { id: 'srank', name: 'Courier of the year', desc: 'Get an S rank', test: (g) => (st(g).sranks || 0) > 0 },
    { id: 'deflect10', name: 'Return to sender', desc: 'Kill 10 wardens with their own shots', test: (g) => (st(g).deflects || 0) >= 10 },
    { id: 'blade50', name: 'Edge of the world', desc: '50 blade kills', test: (g) => (st(g).blade || 0) >= 50 },
  ] });
  $('syncBtn').onclick = () => GameSync.open();
} else $('syncBtn').hidden = true;

// ---------- boot ----------
if (COARSE) input.setMode('touch');
refreshTitle(); refreshPrompts();
document.addEventListener('pointerdown', () => { initAudio(); if (mode === 'title' && !window.__musicOn) { window.__musicOn = true; music(0, 0.3); } }, { once: false });
requestAnimationFrame(frame);

// test hook (only with ?test)
if (TEST) window.__lw = {
  get mode() { return mode; }, get player() { return player; }, get enemies() { return enemies; }, get L() { return L; }, get ch() { return ch; },
  get ammo() { return ammo; }, get radio() { return radioCur; }, voice, queue, get deaths() { return deaths; }, get cp() { return cpIdx; }, get runT() { return runT; }, input, CHAPTERS, buildChapter,
  start: startChapter, finish: finishChapter, die, progress, stats, settings, pause, Player, THREE, refreshPrompts, fillKeys,
  tp(x, y, z) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); },
};
