// =============================================================
// clubdev-screen.js — Categorias de base e comissão técnica
// =============================================================
import { esc, money } from '../util.js';
import { icon } from './icons.js';
import { bar } from './ui.js';
import { overall } from '../engine/ratings.js';
import { ensureAcademy as academyOf, upgradeCost, ACAD_MAX } from '../engine/academy.js';
import { STAFF, LEVEL_NAMES, staffOf, staffWage, staffTotal } from '../engine/staff.js';
import { clubById } from '../engine/market.js';

function baseTab(g) {
  const a = academyOf(g), club = clubById(g, g.userClubId);
  const kids = a.kids.slice().sort((x, y) => y.potential - x.potential);
  const cost = upgradeCost(g);
  return `<div class="card">
    <div class="row between"><b>Estrutura da base</b><span class="tag good">Nível ${a.level}/${ACAD_MAX}</span></div>
    <div class="acad-lv">${Array.from({ length: ACAD_MAX }, (_, i) => `<i class="${i < a.level ? 'on' : ''}"></i>`).join('')}</div>
    <p class="tiny muted">Base melhor = mais garotos por ano, com mais talento e crescendo mais rápido.</p>
    ${a.level < ACAD_MAX ? `<button class="btn-block btn-sm" data-act="acadUp" ${club.budget >= cost ? '' : 'disabled'}>${icon('bolt', 15)} Melhorar para nível ${a.level + 1} · ${money(cost)}</button>` : '<p class="small good center">Estrutura de elite!</p>'}
  </div>
  <div class="section-title"><h3>Garotos (${kids.length})</h3></div>
  <p class="tiny muted">Eles crescem toda semana. Promova quem estiver pronto; com 19 anos, quem ficou na base vai embora. Os garotos são fictícios.</p>
  <div class="list">${kids.length ? kids.map(k => `<div class="item" style="display:block">
      <div class="row" style="gap:10px"><div class="pc-ovr">${overall(k)}</div><div class="grow"><b>${esc(k.name)}</b><div class="tiny muted">${k.pos} · ${k.age} anos · potencial <b class="${k.potential >= 78 ? 'good' : ''}">${k.potential}</b>${k.potential >= 82 ? ' ⭐' : ''}</div></div></div>
      <div class="grid2 mt"><button class="btn-sm btn-good" data-act="kidUp" data-id="${esc(k.id)}">⬆️ Promover</button><button class="btn-sm" data-act="kidOut" data-id="${esc(k.id)}">Dispensar</button></div></div>`).join('')
    : '<div class="item muted small">Nenhum garoto agora. A próxima turma chega no fim da temporada.</div>'}</div>`;
}

function staffTab(g) {
  const s = staffOf(g), club = clubById(g, g.userClubId);
  return `<div class="card small">Custo semanal da comissão: <b>${money(staffTotal(g))}</b><div class="tiny muted">Sai do caixa toda semana, junto com os salários.</div></div>
  <div class="list">${STAFF.map(([k, emoji, name, desc]) => {
    const lv = s[k] || 0;
    return `<div class="item" style="display:block"><div class="row" style="gap:10px"><span style="font-size:24px">${emoji}</span><div class="grow"><b>${name}</b><div class="tiny muted">${desc}</div></div></div>
      <div class="chips mt">${LEVEL_NAMES.map((n, i) => `<button class="chip ${lv === i ? 'on' : ''}" data-act="staffSet" data-k="${k}" data-v="${i}">${n}${i ? `<span class="tiny"> ${money(staffWage(g, club, i))}</span>` : ''}</button>`).join('')}</div></div>`;
  }).join('')}</div>`;
}

export function clubdevScreen(S) {
  const g = S.game, tab = S.devTab || 'base';
  return `<div class="row between"><h1>Base e comissão</h1><button class="btn-sm" data-act="go" data-to="squad">‹ Elenco</button></div>
  <div class="tabs">${[['base', 'star', 'Base'], ['staff', 'users', 'Comissão técnica']].map(([k, ic, l]) =>
    `<button class="${tab === k ? 'on' : ''}" data-act="devTab" data-v="${k}">${icon(ic, 17)} ${l}</button>`).join('')}</div>
  ${tab === 'base' ? baseTab(g) : staffTab(g)}`;
}
