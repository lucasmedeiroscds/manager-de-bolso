// =============================================================
// theme.js — tema nas CORES DO SEU CLUBE
// =============================================================
// Pega as duas cores do clube, escolhe a mais "viva" e ajusta o
// brilho para ficar legível no fundo escuro. Clubes preto e branco
// ficam com destaque prateado. A cor vira a variável --accent do CSS.
// =============================================================
const DEFAULT = { accent: '#f5c542', rgb: '245, 197, 66', hi: '#ffdf7e', lo: '#c9921c', text: '#1a1100' };
let current = '';

// Converte qualquer cor CSS (#hex, hsl(), nome) em [r, g, b]
let ctx2d = null;
function toRGB(color) {
  if (!ctx2d) ctx2d = document.createElement('canvas').getContext('2d');
  ctx2d.fillStyle = '#000';
  ctx2d.fillStyle = color;
  const hex = ctx2d.fillStyle; // sempre "#rrggbb"
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}
const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// Calcula as cores do tema para um clube
export function themeFor(club) {
  const cands = club.colors.map(c => ({ c, hsl: rgbToHsl(toRGB(c)) }));
  // a cor mais saturada (e não quase preta) ganha
  const vivid = cands.filter(x => x.hsl[1] > 0.25 && x.hsl[2] > 0.12 && x.hsl[2] < 0.92)
    .sort((a, b) => b.hsl[1] - a.hsl[1])[0];
  let h, s, l;
  if (!vivid) { h = 215; s = 0.12; l = 0.82; }          // preto e branco: prata
  else {
    [h, s, l] = vivid.hsl;
    s = Math.max(s, 0.65);
    l = Math.min(Math.max(l, 0.55), 0.68);              // legível no fundo escuro
  }
  const main = hslToRgb(h, s, l);
  const hi = hslToRgb(h, s, Math.min(0.85, l + 0.14));
  const lo = hslToRgb(h, Math.min(1, s + 0.05), Math.max(0.35, l - 0.14));
  return { accent: hex(main), rgb: main.join(', '), hi: hex(hi), lo: hex(lo), text: lum(main) > 0.55 ? '#0b0f14' : '#ffffff' };
}

// Aplica o tema (club = null volta ao padrão verde-limão)
export function applyTheme(club) {
  const t = club ? themeFor(club) : DEFAULT;
  const key = t.accent;
  if (key === current) return;
  current = key;
  const r = document.documentElement.style;
  r.setProperty('--accent', t.accent);
  r.setProperty('--accent-rgb', t.rgb);
  r.setProperty('--accent-hi', t.hi);
  r.setProperty('--accent-lo', t.lo);
  r.setProperty('--accent-text', t.text);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = '#050d1f';
}
