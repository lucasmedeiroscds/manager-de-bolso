// =============================================================
// report-screen.js — janela do relatório do adversário
// =============================================================
import { esc } from '../util.js';
import { overall } from '../engine/ratings.js';
import { opponentReport } from '../engine/report.js';
import { badge } from './ui.js';
import { LEVEL_NAMES } from '../engine/staff.js';

const SECT_NAME = { def: 'Defesa', mid: 'Meio-campo', att: 'Ataque' };

export function reportModal(S, oppId) {
  const g = S.game, opp = g.clubs.find(c => c.id === oppId);
  const r = opponentReport(g, opp);
  const lock = n => r.lvl === n - 1 ? `<div class="card small muted">🔒 Com um auxiliar técnico de nível <b>${LEVEL_NAMES[n]}</b> o relatório mostra mais. Contrate em Elenco → Base → Comissão técnica.</div>` : '';
  const p = x => `<b>${esc(x.name)}</b> <span class="tiny muted">${x.pos} · ${overall(x)}</span>`;
  return `<div class="row" style="gap:10px;margin:4px 48px 10px 0">${badge(opp, 'lg')}<div><div class="tiny muted">📋 RELATÓRIO DO AUXILIAR</div><h2 style="margin:0">${esc(opp.name)}</h2></div></div>
  <div class="kv mb">
    <div><b>${esc(r.formation)}</b><span>Formação</span></div>
    <div><b><span class="form">${r.form.map(x => `<i class="${x}"></i>`).join('') || '—'}</span></b><span>Últimos jogos</span></div>
    ${r.style ? `<div><b>${esc(r.style)}</b><span>Estilo</span></div><div><b>${esc(r.marking)}</b><span>Marcação</span></div>` : ''}
  </div>
  ${r.best ? `<div class="card small"><div class="tiny muted mb">FIQUE DE OLHO</div>${r.best.map(x => `<div>⭐ ${p(x)}</div>`).join('')}</div>` : lock(1)}
  ${r.sect ? `<div class="card small"><div class="tiny muted mb">SETORES (titulares deles × os seus)</div>
    ${['def', 'mid', 'att'].map(k => `<div class="row between"><span>${SECT_NAME[k]}${r.weak === k ? ' <span class="tag good">ponto fraco</span>' : r.strong === k ? ' <span class="tag bad">ponto forte</span>' : ''}</span><b>${Math.round(r.sect[k])} <span class="muted">× ${Math.round(r.mySect[k])}</span></b></div>`).join('')}</div>
    <div class="card small"><div class="tiny muted mb">SUGESTÕES</div>${r.tips.map(t => `<div>💡 ${esc(t)}</div>`).join('')}
    ${Object.keys(r.apply).length ? `<button class="btn-block btn-sm btn-good mt" data-act="applyReport" data-id="${opp.id}">Aplicar: ${Object.values(r.apply).map(esc).join(' · ')}</button>` : ''}</div>` : lock(2)}
  ${r.lvl >= 3 ? `<div class="card small"><div class="tiny muted mb">DETALHES</div>
    ${r.scorer && r.scorer.seasonGoals ? `<div>⚽ Artilheiro: ${p(r.scorer)} · ${r.scorer.seasonGoals} gols</div>` : ''}
    ${r.header ? `<div>🚩 Perigo na bola aérea: ${p(r.header)}</div>` : ''}
    <div>🚑 Desfalques: ${r.out.length ? r.out.map(x => esc(x.name)).join(', ') : 'nenhum'}</div></div>` : lock(3)}`;
}
