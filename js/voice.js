// Voices: the radio lines are read out with the browser's own text to speech (no files, works offline
// with the system voices). Each speaker gets a different voice, pitch and pace.
const S = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;

// who sounds like what. `prefer` is tried in order against the installed voice names.
const CAST = {
  WREN: { pitch: 1.08, rate: 1.07, prefer: [/aria.*natural|jenny.*natural|sonia.*natural|libby/i, /google uk english female|samantha|serena|karen|moira/i, /aria|jenny|zira|hazel|susan|female/i] },
  HALCYON: { pitch: 0.2, rate: 0.82, prefer: [/guy.*natural|ryan.*natural|christopher.*natural/i, /google uk english male|daniel|alex|fred/i, /david|mark|george|male/i] },
  YOU: { pitch: 0.95, rate: 1.0, prefer: [/andrew.*natural|brian.*natural|eric.*natural|davis/i, /google us english|tom|aaron/i, /mark|david|richard/i] },
  NARRATOR: { pitch: 0.9, rate: 0.95, prefer: [/emma.*natural|ava.*natural|michelle.*natural/i, /google uk english male|daniel|tessa/i, /zira|hazel|david/i] },
};
let voices = [], picked = {};
function load() {
  if (!S) return;
  voices = S.getVoices().filter((v) => /^en/i.test(v.lang));
  picked = {};
  const used = new Set();
  for (const [who, c] of Object.entries(CAST)) {
    let v = null;
    for (const re of c.prefer) { v = voices.find((x) => re.test(x.name) && !used.has(x.name)) || v; if (v) break; }
    v = v || voices.find((x) => !used.has(x.name)) || voices[0] || null;
    if (v && who !== 'NARRATOR') used.add(v.name);
    picked[who] = v;
  }
}
if (S) { load(); S.addEventListener?.('voiceschanged', load); }

// written text to something a voice reads well: button glyphs become words, caps become normal case
const GLYPH = { '✕': 'cross', '○': 'circle', '△': 'triangle', '□': 'square', '·': ',', '/': ' or ', '…': '...' };
export function speakable(t) {
  let s = t.replace(/[✕○△□·/…]/g, (g) => ' ' + GLYPH[g] + ' ').replace(/\((hold)\)/g, 'held').replace(/\s+/g, ' ').trim();
  if (s === s.toUpperCase() && /[A-Z]{3}/.test(s)) s = s.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\bhalcyon\b/gi, 'Halcyon').replace(/\bi\b/g, 'I');
  return s;
}

export const voice = {
  on: true, vol: 1, get ok() { return !!S && voices.length > 0; },
  // speak one line; onend fires when it finishes (or straight away if voices are off)
  say(who, text, onend) {
    if (!S || !this.on || this.vol <= 0) { onend?.(); return null; }
    if (!voices.length) load();
    const c = CAST[who] || CAST.NARRATOR, u = new SpeechSynthesisUtterance(speakable(text));
    const v = picked[who] || picked.NARRATOR; if (v) { u.voice = v; u.lang = v.lang; }
    u.pitch = c.pitch; u.rate = c.rate; u.volume = Math.min(1, this.vol);
    let done = false; const end = () => { if (!done) { done = true; onend?.(); } };
    u.onend = end; u.onerror = end;
    try { S.resume(); S.speak(u); } catch { end(); }
    return u;
  },
  cancel() { try { S?.cancel(); } catch { /* fine */ } },
  pause() { try { S?.pause(); } catch { /* fine */ } },
  resume() { try { S?.resume(); } catch { /* fine */ } },
  names() { return Object.fromEntries(Object.entries(picked).map(([k, v]) => [k, v?.name || 'none'])); },
};
