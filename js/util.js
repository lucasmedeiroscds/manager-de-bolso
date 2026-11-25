// =============================================================
// util.js — funções pequenas usadas em todo o jogo
// =============================================================

// Gerador de números aleatórios "com semente" (mulberry32).
// Com a mesma semente, gera sempre a mesma sequência.
// Usamos isso para criar o banco de dados fictício sempre igual.
export function seededRandom(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Aleatório "normal" do jogo (partidas, mercado etc.)
export const rnd = Math.random;

// Inteiro entre min e max (inclusive)
export function randInt(min, max, r = rnd) {
  return Math.floor(r() * (max - min + 1)) + min;
}

// Escolhe um item de uma lista
export function pick(list, r = rnd) {
  return list[Math.floor(r() * list.length)];
}

// Escolhe um item usando pesos: pickWeighted([a,b], [3,1]) → "a" 75% das vezes
export function pickWeighted(items, weights, r = rnd) {
  const total = weights.reduce((s, w) => s + w, 0);
  let x = r() * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Limita um valor entre min e max
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Embaralha uma lista (cópia)
export function shuffle(list, r = rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Formata dinheiro: 1500000 → "R$ 1,5 mi"
export function money(v) {
  const neg = v < 0;
  const a = Math.abs(v);
  let s;
  if (a >= 1e6) s = (a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace('.', ',') + ' mi';
  else if (a >= 1e3) s = Math.round(a / 1e3) + ' mil';
  else s = String(Math.round(a));
  return (neg ? '-R$ ' : 'R$ ') + s;
}

// Escapa texto para colocar em HTML com segurança
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Cria um ID curto e único
let idCounter = Date.now() % 100000;
export function newId(prefix) {
  idCounter++;
  return prefix + idCounter.toString(36) + Math.floor(rnd() * 1296).toString(36);
}
