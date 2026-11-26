// =============================================================
// records-screen.js — Histórico e recordes (técnico e clube)
// =============================================================
import { esc } from '../util.js';
import { icon } from './icons.js';
import { badge } from './ui.js';
import { clubRecord, coachRecord, topList } from '../engine/records.js';

const score = x => x ? `<b>${x.gf} x ${x.ga}</b> <span class="muted">vs ${esc(x.opp)} · ${esc(x.comp)} ${x.season}</span>` : '<span class="muted">—</span>';
const pct = r => r.games ? Math.round((r.w * 3 + r.d) / (r.games * 3) * 100) + '%' : '—';

function summary(r) {
  return `<div class="kv mb">
    <div><b>${r.games}</b><span>Jogos</span></div>
    <div><b class="good">${r.w}</b><span>Vitórias</span></div>
    <div><b>${r.d}</b><span>Empates</span></div>
    <div><b class="bad">${r.l}</b><span>Derrotas</span></div>
    <div><b>${r.gf}:${r.ga}</b><span>Gols</span></div>
    <div><b>${pct(r)}</b><span>Aproveitamento</span></div>
  </div>
  <div class="card small">
    <div class="rec-row">${icon('fire', 15)} Maior goleada: ${score(r.bestWin)}</div>
    <div class="rec-row">${icon('close', 15)} Pior derrota: ${score(r.worstLoss)}</div>
    <div class="rec-row">${icon('shield', 15)} Maior invencibilidade: <b>${r.unbBest} jogos</b>${r.unb > 1 ? ` <span class="tag good">atual: ${r.unb}</span>` : ''}</div>
    <div class="rec-row">${icon('star', 15)} Mais vitórias seguidas: <b>${r.winsBest}</b>${r.wins > 1 ? ` <span class="tag good">atual: ${r.wins}</span>` : ''}</div>
  </div>`;
}

function ranking(title, list, val, unit) {
  return `<h3>${title}</h3><div class="list">${list.length ? list.map((x, i) =>
    `<div class="item small tap" data-act="player" data-id="${x.id}" style="min-height:44px"><span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span><span class="grow ellipsis">${esc(x.name)}</span><b>${val(x)}</b><span class="tiny muted" style="width:52px;text-align:right">${unit(x)}</span></div>`).join('')
    : '<div class="item muted small">Ainda sem registros. Jogue algumas partidas!</div>'}</div>`;
}

export function recordsScreen(S) {
  const g = S.game, c = g.coach;
  const tab = S.recTab || 'coach';
  const uc = g.clubs.find(x => x.id === g.userClubId);
  let body;
  if (tab === 'coach') {
    const r = coachRecord(g);
    const tro = (c && c.trophies) || [];
    const hist = (c && c.history) || [];
    body = `<div class="card hl center"><div class="tiny muted">HALL DA FAMA</div><h2 style="margin:4px 0">${esc(c ? c.name : 'Técnico')}</h2>
      <div style="font-size:30px">${tro.length ? '🏆'.repeat(Math.min(tro.length, 8)) : '—'}</div><div class="small muted">${tro.length} título(s) na carreira</div></div>
    ${summary(r)}
    <h3>Títulos</h3><div class="list">${tro.length ? tro.slice().reverse().map(t => `<div class="item small" style="min-height:44px">${icon('trophy', 18)}<span class="grow"><b>${esc(t.name)}</b><div class="tiny muted">${esc(t.club)}</div></span><b>${t.season}</b></div>`).join('') : '<div class="item muted small">Nenhum título ainda. O primeiro está chegando!</div>'}</div>
    <h3>Temporadas</h3><div class="list">${hist.length ? hist.slice().reverse().map(h => `<div class="item small" style="min-height:44px"><b style="width:44px">${h.season}</b><span class="grow"><b>${esc(h.club)}</b><div class="tiny muted">${esc(h.league)}${h.note ? ' · ' + esc(h.note) : ''}</div></span><b>${h.pos ? h.pos + 'º' : '—'}</b></div>`).join('') : '<div class="item muted small">A primeira temporada ainda está em andamento.</div>'}</div>`;
  } else {
    const r = clubRecord(g, uc.id);
    body = `<div class="row" style="gap:10px;margin-bottom:10px">${badge(uc, 'lg')}<div><h2 style="margin:0">${esc(uc.name)}</h2><div class="tiny muted">Recordes com você no comando</div></div></div>
    ${summary(r)}
    ${ranking('Artilheiros de todos os tempos', topList(r, 1), x => x.g + ' gols', x => x.j + ' j')}
    ${ranking('Mais jogos', topList(r, 2), x => x.j + ' jogos', x => x.g + ' g')}
    ${ranking('Mais assistências', topList(r, 3), x => x.a + ' assist.', x => x.j + ' j')}`;
  }
  return `<div class="row between"><h1>Histórico</h1><button class="btn-sm" data-act="go" data-to="more">‹ Mais</button></div>
  <div class="tabs">${[['coach', 'whistle', 'Técnico'], ['club', 'shield', 'Clube']].map(([k, ic, l]) =>
    `<button class="${tab === k ? 'on' : ''}" data-act="recTab" data-v="${k}">${icon(ic, 17)} ${l}</button>`).join('')}</div>
  ${body}`;
}
