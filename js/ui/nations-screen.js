// =============================================================
// nations-screen.js — Seleções: ranking, convocação e torneios
// =============================================================
import { esc } from '../util.js';
import { overall } from '../engine/ratings.js';
import { nationRanking, natInfo, tournamentsAfter } from '../engine/nations.js';
import { clubById } from '../engine/market.js';
import { posTag, ovrTag } from './ui.js';
import { icon } from './icons.js';
import { flag } from './screens.js';

// Escudo da seleção (círculo com as cores do país)
export function natBadge(nat, size = '') {
  const [, c1, c2, short] = natInfo(nat);
  return `<span class="badge ${size}" style="--c1:${c1};--c2:${c2}">${esc(short)}</span>`;
}

let cache = { key: '', list: [] };
function ranking(g) {
  const key = `${g.season}-${g.round}-${Object.keys(g.players).length}`;
  if (cache.key !== key) cache = { key, list: nationRanking(g) };
  return cache.list;
}

export function nationsScreen(S) {
  const g = S.game;
  const view = S.params.view || 'ranking';
  const tabs = `<div class="tabs">
    <button class="${view === 'ranking' ? 'on' : ''}" data-act="go" data-to="nations" data-view="ranking">${icon('globe', 16)} Ranking</button>
    <button class="${view === 'torneios' ? 'on' : ''}" data-act="go" data-to="nations" data-view="torneios">${icon('trophy', 16)} Torneios</button>
  </div>`;
  // próximo torneio
  let next = '', s = g.season;
  for (let k = 0; k < 4 && !next; k++, s++) {
    const ts = tournamentsAfter(s);
    if (ts.length) next = `${ts.map(t => t.name).join(' e ')} ${s + 1} — nas férias depois da temporada ${s}`;
  }
  const head = `<div class="row between"><h1 style="margin:0">Seleções</h1><button class="btn-sm" data-act="go" data-to="more">${icon('back', 16)} Mais</button></div>
    <div class="card mt" style="display:flex;gap:10px;align-items:center">${icon('calendar', 20)}<div class="small"><b>Próximo torneio</b><div class="muted">${esc(next)}</div></div></div>${tabs}`;

  if (view === 'torneios') return head + tournamentsView(S);
  const list = ranking(g).slice(0, 48);
  const mine = id => clubById(g, g.userClubId) && Object.values(g.players).filter(p => p.clubId === g.userClubId).map(p => p.id);
  const myIds = new Set(mine() || []);
  return head + `<p class="small muted">Força = média dos 11 melhores convocáveis. Toque numa seleção para ver a convocação.</p>
  <div class="list stagger">${list.map((n, i) => {
    const mineN = n.squad.filter(p => myIds.has(p.id)).length;
    return `<div class="item tap" data-act="nationSquad" data-id="${esc(n.nat)}">
      <b class="num" style="width:26px;color:var(--muted)">${i + 1}</b>${natBadge(n.nat)}
      <div class="grow"><b>${flag(n.nat)} ${esc(n.nat)}</b><div class="small muted">${esc(n.cont)}${mineN ? ` · <span class="accent">${mineN} do seu clube</span>` : ''}</div></div>
      ${ovrTag(Math.round(n.str))}</div>`;
  }).join('')}</div>`;
}

// Convocação (modal)
export function squadModal(S, nat) {
  const g = S.game;
  const n = ranking(g).find(x => x.nat === nat);
  if (!n) return '<p>Seleção não encontrada.</p>';
  const order = { GOL: 0, ZAG: 1, LAT: 2, VOL: 3, MEI: 4, ATA: 5 };
  const sq = n.squad.slice().sort((a, b) => order[a.pos] - order[b.pos] || overall(b) - overall(a));
  return `<div class="row" style="gap:12px;margin:4px 48px 10px 0">${natBadge(nat, 'lg')}<div><h2 style="margin:0">${esc(nat)}</h2>
    <div class="small muted">${esc(n.cont)} · força ${n.str.toFixed(1)} · 26 convocados</div></div></div>
  <div class="list">${sq.map(p => {
    const c = clubById(g, p.clubId);
    return `<div class="item ${p.clubId === g.userClubId ? 'me' : ''}" style="min-height:48px">${posTag(p.pos)}
      <div class="grow"><b class="small">${esc(p.name)}</b><div class="tiny muted">${c ? esc(c.name) : ''} · ${p.age}a</div></div>${ovrTag(overall(p))}</div>`;
  }).join('')}</div>`;
}

function tournamentsView(S) {
  const g = S.game;
  const hist = g.nationalCups || [];
  if (!hist.length) return `<div class="card center muted small">${icon('trophy', 28)}<p style="margin-top:6px">Nenhum torneio de seleções disputado ainda.<br>Eles acontecem nas férias: Eurocopa e Copa América nos anos de 2028, 2032…; Copa do Mundo em 2030, 2034…</p></div>`;
  const idx = Math.max(0, Math.min(hist.length - 1, Number(S.params.t || 0)));
  const t = hist[idx];
  const chips = `<div class="hscroll">${hist.map((h, i) => `<div class="comp-card cup-pick ${i === idx ? 'on' : ''}" data-act="go" data-to="nations" data-view="torneios" data-t="${i}">
      <div class="k">${icon('trophy', 12)} ${h.year}</div><div class="v ellipsis">${esc(h.name)}</div><div class="tiny muted">Campeão: ${esc(h.champion)}</div></div>`).join('')}</div>`;
  const pl = id => g.players[id];
  let html = chips + `<div class="card hl center">${natBadge(t.champion, 'xl')}<h2 style="margin-top:8px">🏆 ${esc(t.champion)}</h2>
    <p class="small muted">Campeão da ${esc(t.name)} ${t.year} · vice: ${esc(t.runnerUp)}</p>
    ${t.best ? `<p class="small">⭐ Craque: <b>${esc(t.best.name)}</b> (${esc(t.best.nat || '')})</p>` : ''}</div>`;
  if (t.userCalled && t.userCalled.length) html += `<div class="card small">${icon('users', 16)} Convocados do seu clube: ${t.userCalled.map(u => `<b>${esc(u.name)}</b> (${esc(u.nat)})`).join(', ')}</div>`;
  if (t.topScorers && t.topScorers.length) html += `<h3>Artilharia</h3><div class="list">${t.topScorers.map(s => `<div class="item small" style="min-height:44px">${natBadge(s.nat || '?', 'sm')}<span class="grow"><b>${esc(s.name)}</b> <span class="muted">${esc(s.nat || '')}</span></span><b class="num">${s.g}</b></div>`).join('')}</div>`;
  for (const r of t.rounds.slice().reverse()) {
    html += `<h3>${esc(r.name)}</h3><div class="list">${r.ties.map(x => `<div class="item small" style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;min-height:46px">
      <span class="row ellipsis" style="justify-content:flex-end;${x.winner === x.h ? 'font-weight:800' : ''}">${esc(x.h)} ${natBadge(x.h, 'sm')}</span>
      <span class="center"><b>${x.hg} x ${x.ag}</b>${x.pens ? `<div class="tiny muted">pên. ${x.pens[0]}x${x.pens[1]}</div>` : ''}</span>
      <span class="row ellipsis" style="${x.winner === x.a ? 'font-weight:800' : ''}">${natBadge(x.a, 'sm')} ${esc(x.a)}</span></div>`).join('')}</div>`;
  }
  html += `<h3>Fase de grupos</h3><div class="grid2">${t.groups.map(gr => `<div class="card" style="margin:0;padding:8px 10px"><b class="small">Grupo ${gr.name}</b>
    ${gr.table.map((r, i) => `<div class="row small" style="justify-content:space-between;padding:3px 0;${i < 2 ? 'color:var(--good)' : ''}"><span class="ellipsis">${i + 1}. ${esc(r.nat)}</span><b>${r.pts}</b></div>`).join('')}</div>`).join('')}</div>`;
  return html;
}

// Bloco para o resumo de fim de temporada
export function nationalsBlock(list) {
  if (!list || !list.length) return '';
  return `<div class="card">${list.map(t => `<div class="row" style="gap:10px;margin:6px 0">${natBadge(t.champion, 'lg')}
    <div class="grow"><div class="tiny muted">${esc(t.name.toUpperCase())} ${t.year}</div><b style="font-size:17px">🏆 ${esc(t.champion)}</b>
    <div class="small muted">vice: ${esc(t.runnerUp)}${t.best ? ` · craque: ${esc(t.best.name)}` : ''}${t.userCalled ? ` · ${t.userCalled} do seu clube convocados` : ''}</div></div></div>`).join('')}
    <button class="btn-block btn-sm mt" data-act="go" data-to="nations" data-view="torneios">Ver torneios de seleções</button></div>`;
}
