// =============================================================
// news-screen.js — Notícias: manchetes, entrevistas e mercado
// =============================================================
import { esc } from '../util.js';
import { icon } from './icons.js';

export function newsScreen(S) {
  const g = S.game;
  const press = g.press || [];
  const market = g.news || [];
  return `<div class="row between"><h1>Notícias</h1><button class="btn-sm" data-act="go" data-to="more">‹ Mais</button></div>
  <div class="section-title"><h3>${icon('news', 15)} Seu clube</h3></div>
  <div class="list">${press.length ? press.map(n => `<div class="item news-item ${n.tone || ''}" style="display:block">
    <b>${esc(n.title)}</b><div class="tiny muted">${esc(n.text || '')} · Semana ${n.round + 1}/${n.season}</div></div>`).join('') : '<div class="item muted small">As manchetes aparecem depois dos seus jogos.</div>'}</div>
  <div class="section-title"><h3>${icon('swap', 15)} Mercado da bola</h3></div>
  <div class="list">${market.length ? market.slice(0, 25).map(n => `<div class="item small"><span class="grow">${esc(n.text)}</span><span class="tiny muted">${n.round + 1}/${n.season}</span></div>`).join('') : '<div class="item muted small">Nenhuma transferência ainda.</div>'}</div>`;
}
