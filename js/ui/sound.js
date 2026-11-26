// =============================================================
// sound.js — SONS do jogo, sintetizados (sem arquivos de áudio)
// =============================================================
// Usa a Web Audio API do navegador: os sons são "fabricados" na hora,
// então funcionam offline e não pesam nada. O navegador só libera o
// som depois do primeiro toque na tela.
// =============================================================
let ctx = null, master = null, crowdNode = null, crowdGain = null, noiseBuf = null;
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
    // ruído branco (base da torcida, dos chutes e do "uuuh")
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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
export function goal() {
  if (!ac()) return;
  const t = ctx.currentTime + 0.02;
  if (settings.crowd || settings.sfx) {
    // a torcida explode e vai baixando
    noise(t, 3.2, { type: 'bandpass', freq: 700, q: 0.6, peak: 0.55, a: 0.12, rel: 1.6, sweepTo: 1200 });
    noise(t + 0.05, 2.6, { type: 'bandpass', freq: 2200, q: 0.8, peak: 0.18, a: 0.1, rel: 1.2 });
  }
  if (settings.sfx) { // fanfarra curtinha
    [523, 659, 784, 1047].forEach((f, i) => tone(t + 0.15 + i * 0.11, 0.22, { freq: f, type: 'square', peak: 0.05, rel: 0.12 }));
  }
}
export function ooh() {
  if (!settings.crowd || !ac()) return;
  const t = ctx.currentTime + 0.02;
  noise(t, 1.1, { type: 'bandpass', freq: 520, q: 1.2, peak: 0.3, a: 0.15, rel: 0.6, sweepTo: 300 });
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
export function crowdStart() {
  if (!settings.crowd || !ac() || crowdNode) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.5;
  // ondulação lenta do volume (a torcida "respira")
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 0.18; lg.gain.value = 0.02; lfo.connect(lg);
  crowdGain = ctx.createGain(); crowdGain.gain.value = 0.0001;
  lg.connect(crowdGain.gain);
  crowdGain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 1.2);
  src.connect(f).connect(crowdGain).connect(master);
  src.start(); lfo.start();
  crowdNode = { src, lfo };
}
export function crowdStop() {
  if (!crowdNode || !ctx) return;
  const { src, lfo } = crowdNode;
  crowdGain.gain.cancelScheduledValues(ctx.currentTime);
  crowdGain.gain.setValueAtTime(Math.max(0.0001, crowdGain.gain.value), ctx.currentTime);
  crowdGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  setTimeout(() => { try { src.stop(); lfo.stop(); } catch { /* já parou */ } }, 700);
  crowdNode = null;
}
// Pressão no ataque: a torcida cresce um pouquinho
export function crowdSwell() {
  if (!crowdNode || !ctx) return;
  const t = ctx.currentTime;
  crowdGain.gain.cancelScheduledValues(t);
  crowdGain.gain.setValueAtTime(Math.max(0.0001, crowdGain.gain.value), t);
  crowdGain.gain.linearRampToValueAtTime(0.11, t + 0.4);
  crowdGain.gain.linearRampToValueAtTime(0.06, t + 1.6);
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
