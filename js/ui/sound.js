// =============================================================
// sound.js — SONS do jogo, sintetizados (sem arquivos de áudio)
// =============================================================
// Usa a Web Audio API do navegador: os sons são "fabricados" na hora,
// então funcionam offline e não pesam nada. O navegador só libera o
// som depois do primeiro toque na tela.
// =============================================================
let ctx = null, master = null, crowdNode = null, crowdGain = null, noiseBuf = null, brownBuf = null;
export const settings = { sfx: true, crowd: true, volume: 0.7 };

export function loadSoundSettings(saved) { Object.assign(settings, saved || {}); if (master) master.gain.value = settings.volume; }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    master.connect(ctx.destination);
    // ruído branco (estalo do chute, vaia) e ruído "marrom" (grave e
    // abafado, como o ronco de um estádio — sem o chiado do ruído branco)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    brownBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const b = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// Chamar num toque do usuário (libera o áudio no celular)
export function unlock() { if (settings.sfx || settings.crowd) ac(); }
export function setVolume(v) { settings.volume = v; if (master) master.gain.value = v; }

function env(g, t, a, peak, hold, rel) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
}
function noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, peak = 0.3, a = 0.02, rel = 0.3, sweepTo = null } = {}) {
  const c = ac(); if (!c) return;
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = c.createGain();
  env(g, t, a, peak, Math.max(0, dur - a - rel), rel);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}
function tone(t, dur, { freq = 440, type = 'sine', peak = 0.2, a = 0.005, rel = 0.1, to = null, vib = 0 } = {}) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vib) { // vibrato (o "trinado" do apito)
    const l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = vib; lg.gain.value = freq * 0.04; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
  }
  const g = c.createGain(); env(g, t, a, peak, Math.max(0, dur - a - rel), rel);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}

// ---------- Sons ----------
export function whistle(times = 1, long = false) {
  if (!settings.sfx || !ac()) return;
  let t = ctx.currentTime + 0.02;
  for (let i = 0; i < times; i++) {
    const d = long && i === times - 1 ? 0.9 : 0.28;
    tone(t, d, { freq: 2900, type: 'sine', peak: 0.16, vib: 38, rel: 0.06 });
    tone(t, d, { freq: 2950, type: 'triangle', peak: 0.05, vib: 41, rel: 0.06 });
    t += d + 0.12;
  }
}
export function kick() {
  if (!settings.sfx || !ac()) return;
  const t = ctx.currentTime + 0.01;
  tone(t, 0.12, { freq: 150, to: 50, type: 'sine', peak: 0.45, rel: 0.08 });
  noise(t, 0.05, { type: 'highpass', freq: 2500, peak: 0.12, a: 0.002, rel: 0.04 });
}
// ---------- Vozes da torcida ----------
// Várias "vozes" (osciladores com timbre de vogal, cada uma num tom e num
// ritmo diferentes) somadas soam como gente cantando/gritando — e não
// como chiado. formants: as frequências que dão a vogal ("ôô", "uu", "aa").
const VOWEL = { a: [[750, 6], [1200, 7]], o: [[500, 6], [900, 7]], u: [[330, 7], [760, 8]] };
function voices(n, { base = 170, spread = 110, vowel = 'o', dest }) {
  const c = ctx;
  const out = c.createGain(); out.gain.value = 1;
  const soft = c.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 2400;
  out.connect(soft).connect(dest || master);
  const nodes = [], forms = [];
  for (let i = 0; i < n; i++) {
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = base + Math.random() * spread; o.frequency.value = f0;
    const vib = c.createOscillator(), vg = c.createGain();      // vibrato da voz
    vib.frequency.value = 4 + Math.random() * 2.5; vg.gain.value = f0 * 0.025;
    vib.connect(vg).connect(o.frequency);
    const amp = c.createGain(); amp.gain.value = 0.5;            // cada um respira num ritmo
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.15 + Math.random() * 0.5; lg.gain.value = 0.45;
    lfo.connect(lg).connect(amp.gain);
    const vg2 = c.createGain(); vg2.gain.value = 1 / n;
    for (const [ff, q] of VOWEL[vowel]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff * (0.92 + Math.random() * 0.16); bp.Q.value = q;
      o.connect(bp).connect(amp); forms.push(bp);
    }
    amp.connect(vg2).connect(out);
    o.start(); vib.start(); lfo.start();
    nodes.push(o, vib, lfo);
  }
  return {
    out, forms,
    oscs: nodes.filter((_, i) => i % 3 === 0),
    // muda o tom de todas as vozes (mult) em "dur" segundos
    pitch(mult, t, dur) { for (const o of this.oscs) { const v = o.frequency.value; o.frequency.setTargetAtTime(v * mult, t, dur / 3); } },
    stop(t) { for (const x of nodes) { try { x.stop(t); } catch { /* já parou */ } } }
  };
}
// ronco grave do estádio (ruído marrom filtrado: nada de chiado)
function rumble(t, dur, peak, freq = 500) {
  const c = ac(); if (!c) return;
  const src = c.createBufferSource(); src.buffer = brownBuf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); env(g, t, 0.15, peak, Math.max(0, dur - 1.2), 1);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 3); src.stop(t + dur + 0.1);
}

export function goal() {
  if (!ac()) return;
  const t = ctx.currentTime + 0.02;
  if (settings.crowd) {
    // a torcida explode num "GOOOL" e vai baixando
    const g = ctx.createGain(); g.connect(master);
    env(g, t, 0.18, 0.9, 1.6, 1.6);
    const v = voices(14, { base: 210, spread: 160, vowel: 'o', dest: g });
    v.pitch(1.18, t, 0.4);
    v.pitch(0.9, t + 1.8, 1.4);
    v.stop(t + 3.6);
    rumble(t, 3.4, 0.5, 700);
    crowdSwell(1.8);
  }
  if (settings.sfx) { // fanfarra curtinha
    [523, 659, 784, 1047].forEach((f, i) => tone(t + 0.15 + i * 0.11, 0.22, { freq: f, type: 'square', peak: 0.04, rel: 0.12 }));
  }
}
export function ooh() {
  if (!settings.crowd || !ac()) return;
  const t = ctx.currentTime + 0.02;
  // "uuuuh": vozes em "u" que descem de tom
  const g = ctx.createGain(); g.connect(master);
  env(g, t, 0.12, 0.55, 0.35, 0.7);
  const v = voices(10, { base: 190, spread: 90, vowel: 'u', dest: g });
  v.pitch(0.72, t + 0.15, 1.0);
  v.stop(t + 1.4);
  rumble(t, 1.3, 0.18, 400);
}
export function card(red = false) {
  if (!settings.sfx || !ac()) return;
  const t = ctx.currentTime + 0.01;
  tone(t, 0.18, { freq: red ? 620 : 880, type: 'triangle', peak: 0.12 });
  if (red) tone(t + 0.22, 0.25, { freq: 440, type: 'triangle', peak: 0.12 });
  noise(t + 0.05, 0.6, { type: 'lowpass', freq: 600, peak: 0.12, a: 0.1, rel: 0.4 }); // vaia baixinha
}
export function click() {
  if (!settings.sfx || !ac()) return;
  tone(ctx.currentTime, 0.03, { freq: 1900, type: 'sine', peak: 0.035, rel: 0.02 });
}
export function success() {
  if (!settings.sfx || !ac()) return;
  const t = ctx.currentTime + 0.01;
  [660, 880, 1320].forEach((f, i) => tone(t + i * 0.08, 0.16, { freq: f, type: 'sine', peak: 0.09 }));
}

// Murmúrio da torcida ao fundo durante a partida
const CROWD_BASE = 0.32;
export function crowdStart() {
  if (!settings.crowd || !ac() || crowdNode) return;
  const t = ctx.currentTime;
  crowdGain = ctx.createGain(); crowdGain.gain.value = 0.0001;
  crowdGain.connect(master);
  crowdGain.gain.exponentialRampToValueAtTime(CROWD_BASE, t + 1.5);
  // murmúrio: muitas vozes baixinhas em "aa" + ronco grave do estádio
  const v = voices(10, { base: 140, spread: 130, vowel: 'a', dest: crowdGain });
  v.out.gain.value = 0.35;
  const src = ctx.createBufferSource(); src.buffer = brownBuf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const rg = ctx.createGain(); rg.gain.value = 0.22;
  src.connect(lp).connect(rg).connect(crowdGain);
  src.start();
  crowdNode = { v, src, lp };
}
export function crowdStop() {
  if (!crowdNode || !ctx) return;
  const { v, src } = crowdNode, t = ctx.currentTime;
  crowdGain.gain.cancelScheduledValues(t);
  crowdGain.gain.setValueAtTime(Math.max(0.0001, crowdGain.gain.value), t);
  crowdGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  v.stop(t + 0.7); try { src.stop(t + 0.7); } catch { /* já parou */ }
  crowdNode = null;
}
// Pressão no ataque: a torcida cresce e "sobe o tom" um pouquinho
export function crowdSwell(strength = 1) {
  if (!crowdNode || !ctx) return;
  const t = ctx.currentTime;
  crowdGain.gain.cancelScheduledValues(t);
  crowdGain.gain.setValueAtTime(Math.max(0.0001, crowdGain.gain.value), t);
  crowdGain.gain.linearRampToValueAtTime(CROWD_BASE * (1 + 0.8 * strength), t + 0.5);
  crowdGain.gain.linearRampToValueAtTime(CROWD_BASE, t + 1.5 + strength);
  crowdNode.lp.frequency.setTargetAtTime(420 + 300 * strength, t, 0.2);
  crowdNode.lp.frequency.setTargetAtTime(420, t + 1, 0.6);
}

// Toca os sons de um minuto da partida
// animated: a animação do campo toca chute/gol/"uuuh" no momento certo da jogada
export function playMinute(evs, { animated = false } = {}) {
  if (!evs || !evs.length) return;
  for (const e of evs) {
    if (e.type === 'info' && e.min <= 1) whistle(1);
    else if (e.type === 'half') whistle(2);
    else if (e.type === 'end' && !/pênaltis/.test(e.text)) whistle(3, true);
    else if (animated && ['goal', 'save', 'chance'].includes(e.type)) continue;
    else if (e.type === 'goal') { kick(); setTimeout(goal, 250); }
    else if (e.type === 'save' || e.type === 'chance') { kick(); setTimeout(ooh, 200); }
    else if (e.type === 'yellow') card(false);
    else if (e.type === 'red') card(true);
    else if (e.type === 'pen') kick();
  }
}
