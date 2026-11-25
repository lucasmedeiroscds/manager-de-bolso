// =============================================================
// ui.js — peças visuais reutilizáveis e interações
// (escudo, nota, barras, anel de energia, radar, janelas, avisos,
//  ondinha ao tocar, vibração, números que contam)
// =============================================================
import { esc } from '../util.js';
import { overall, ovrClass } from '../engine/ratings.js';
import { icon } from './icons.js';

// Escudo simples com as cores do clube (sem imagens com direitos)
export function badge(club, size = '') {
  if (!club) return `<span class="badge ${size}" style="--c1:#444;--c2:#222">—</span>`;
  return `<span class="badge ${size}" style="--c1:${esc(club.colors[0])};--c2:${esc(club.colors[1])}">${esc(club.short)}</span>`;
}

export function posTag(pos) {
  return `<span class="pos pos-${pos}">${pos}</span>`;
}

export function ovrTag(v) {
  return `<span class="ovr ${ovrClass(v)}">${v}</span>`;
}

export function bar(v, max = 100) {
  const pct = Math.max(0, Math.min(100, v / max * 100));
  const cls = pct < 45 ? 'low' : pct < 70 ? 'mid' : '';
  return `<div class="bar ${cls}"><i style="width:${pct.toFixed(0)}%"></i></div>`;
}

// Anel de energia (0–100) com o número no meio
export function ring(v, size = 40) {
  const r = size / 2 - 4, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, v)) / 100;
  const col = v < 50 ? 'var(--bad)' : v < 70 ? 'var(--warn)' : 'var(--good)';
  return `<div class="ring" style="width:${size}px;height:${size}px" title="Energia">
    <svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="4"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}" style="filter:drop-shadow(0 0 3px ${col})"/></svg>
    <span>${Math.round(v)}</span></div>`;
}

// Gráfico de radar dos atributos (hexágono)
export function radar(attrs, labels, size = 170) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 24, n = attrs.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v];
  };
  const grid = [0.25, 0.5, 0.75, 1].map(k => `<polygon points="${attrs.map((_, i) => pt(i, k).join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,.1)"/>`).join('');
  const spokes = attrs.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" stroke="rgba(255,255,255,.08)"/>`).join('');
  const area = `<polygon class="area" points="${attrs.map((v, i) => pt(i, Math.max(.05, v / 99)).join(',')).join(' ')}"/>`;
  const lbl = labels.map((l, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x}" y="${y + 3}" text-anchor="middle">${l} ${attrs[i]}</text>`; }).join('');
  return `<svg class="radar" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${grid}${spokes}${area}${lbl}</svg>`;
}

// Etiquetas de situação do jogador
export function statusTags(p) {
  const t = [];
  if (p.injury > 0) t.push(`<span class="tag bad">🚑 ${p.injury} sem</span>`);
  if (p.suspended > 0) t.push(`<span class="tag bad">🟥 suspenso</span>`);
  if (p.yellow === 2) t.push(`<span class="tag warn">🟨🟨</span>`);
  if (p.listed) t.push(`<span class="tag warn">À venda</span>`);
  if (p.loan) t.push(`<span class="tag">Emprestado</span>`);
  if (p.contract.years <= 1 && p.clubId) t.push(`<span class="tag warn">Contrato ${p.contract.years}a</span>`);
  return t.join(' ');
}

// Linha padrão de jogador para listas
export function playerRow(p, opts = {}) {
  const right = opts.right != null ? opts.right : '';
  return `<div class="item tap" data-act="${opts.act || 'player'}" data-id="${p.id}" ${opts.extra || ''}>
    ${posTag(opts.slot || p.pos)}
    <div class="grow">
      <div class="ellipsis"><b>${esc(p.name)}</b> <span class="muted small">${p.age}a</span></div>
      <div class="row small muted wrap" style="gap:5px;margin-top:2px">${opts.sub || ''} ${statusTags(p)}</div>
    </div>
    ${right}
    ${ovrTag(opts.ovr != null ? opts.ovr : overall(p))}
  </div>`;
}

// ---------- Aviso rápido (desce do topo) ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('show'); void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  haptic(8);
}

// ---------- Janela (folha que sobe de baixo; arraste para fechar) ----------
const sheetTop = () => `<div class="grab"></div><button class="close btn-ghost" data-act="closeModal" aria-label="Fechar">${icon('close', 18)}</button>`;
export function openModal(html) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'modal';
  bg.innerHTML = `<div class="modal">${sheetTop()}${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  enableSwipeClose(bg.querySelector('.modal'));
  haptic(6);
}
// Atualiza o conteúdo da janela aberta sem fechar (mantém a rolagem)
export function updateModal(html) {
  const m = document.querySelector('#modal .modal');
  if (!m) return openModal(html);
  const y = m.scrollTop;
  m.innerHTML = `${sheetTop()}${html}`;
  m.scrollTop = y;
}
export function closeModal() {
  const m = document.getElementById('modal');
  if (m) m.remove();
}
// Arrastar a janela para baixo (quando já está no topo da rolagem) fecha
function enableSwipeClose(sheet) {
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', e => { if (sheet.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; } }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    sheet.style.transition = 'transform .22s ease-out';
    if (dy > 110) { sheet.style.transform = 'translateY(100%)'; setTimeout(closeModal, 200); }
    else sheet.style.transform = '';
    y0 = null;
  });
}

// Pergunta sim/não (devolve Promise<boolean>)
export function confirmBox(text, yes = 'Confirmar', no = 'Cancelar') {
  return new Promise(resolve => {
    openModal(`<p style="margin:14px 40px 4px 0;font-size:16px">${text}</p>
      <div class="btn-row mt"><button id="cf-no">${no}</button><button id="cf-yes" class="btn-good">${yes}</button></div>`);
    document.getElementById('cf-yes').onclick = () => { closeModal(); resolve(true); };
    document.getElementById('cf-no').onclick = () => { closeModal(); resolve(false); };
  });
}

// ---------- Toque: vibração leve e "ondinha" ----------
export function haptic(ms = 10) {
  // o navegador só permite vibrar depois que a pessoa tocou na tela
  try {
    const ua = navigator.userActivation;
    if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(ms);
  } catch { /* sem vibração */ }
}
// A "ondinha" nasce dentro de uma moldura do tamanho exato do elemento
// tocado (com bordas recortadas), então nunca vaza para o resto da tela.
export function rippleAt(el, ev) {
  if (!el || !el.getBoundingClientRect) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const host = document.createElement('span');
  host.className = 'ripple-host';
  const s = Math.max(r.width, r.height);
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.width = span.style.height = s + 'px';
  span.style.left = (ev.clientX - r.left - s / 2) + 'px';
  span.style.top = (ev.clientY - r.top - s / 2) + 'px';
  host.appendChild(span);
  el.appendChild(host);
  setTimeout(() => host.remove(), 600);
}

// ---------- Números que "contam" até o valor ----------
// Elementos com data-count="1234" e data-fmt="money|int"
export function animateCounts(root, fmtMoney) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const end = Number(el.dataset.count);
    if (!isFinite(end)) return;
    const fmt = el.dataset.fmt === 'money' ? fmtMoney : v => Math.round(v).toLocaleString('pt-BR');
    const t0 = performance.now(), dur = 700;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(end * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
