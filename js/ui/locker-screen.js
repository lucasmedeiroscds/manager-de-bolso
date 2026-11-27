// =============================================================
// locker-screen.js — Vestiário: panelinhas, amizades e rivalidades
// =============================================================
import { esc } from '../util.js';
import { groupsOf, chemistry, pairs } from '../engine/locker.js';

export function lockerScreen(S) {
  const g = S.game, uc = g.clubs.find(c => c.id === g.userClubId);
  const chem = chemistry(g, uc);
  const col = chem >= 65 ? 'var(--good)' : chem >= 40 ? 'var(--warn)' : 'var(--bad)';
  const prs = pairs(g).map(p => ({ ...p, A: g.players[p.a], B: g.players[p.b] })).filter(p => p.A && p.B);
  const xi = new Set(uc.lineup);
  const face = m => `<span class="tag tap" data-act="player" data-id="${m.id}" style="margin:2px">${esc(m.name)}${xi.has(m.id) ? ' ⚽' : ''}</span>`;
  return `<div class="row between"><h1>Vestiário</h1><button class="btn-sm" data-act="go" data-to="squad">‹ Elenco</button></div>
  <div class="card hl"><div class="row between"><b>Entrosamento</b><b style="color:${col}">${chem}</b></div>
    <div class="bar" style="height:10px;margin:8px 0"><i style="width:${chem}%;background:${col}"></i></div>
    <p class="tiny muted" style="margin:0">Moral do elenco + amigos jogando juntos − rivais escalados juntos. Mexe um pouco na força do time em campo (até 4%).</p></div>
  <h3>Panelinhas</h3>
  <div class="list">${groupsOf(g, uc).map(gr => `<div class="item" style="display:block"><div class="row between"><b>${gr.emoji} ${esc(gr.name)}</b><span class="tag ${gr.moral >= 60 ? 'good' : gr.moral < 40 ? 'bad' : 'warn'}">moral ${gr.moral}</span></div>
    <div class="tiny muted">Líder: <b>${esc(gr.leader.name)}</b> · ${gr.members.length} jogadores · ${gr.members.filter(m => xi.has(m.id)).length} titulares</div>
    <div class="mt">${gr.members.map(face).join('')}</div></div>`).join('')}</div>
  <p class="tiny muted">Grupo inteiro fora do time reclama. Líder insatisfeito derruba o entrosamento. ⚽ = titular.</p>
  <h3>Amizades e rivalidades</h3>
  <div class="list">${prs.length ? prs.map(p => `<div class="item small" style="min-height:44px"><span style="font-size:20px">${p.type === 'friend' ? '🤝' : '⚡'}</span><span class="grow"><b>${esc(p.A.name)}</b> e <b>${esc(p.B.name)}</b><div class="tiny muted">${p.type === 'friend' ? 'Amigos: rendem e se animam jogando juntos' : 'Rivais pela mesma vaga: escalar os dois pode dar briga'}</div></span>${xi.has(p.a) && xi.has(p.b) ? `<span class="tag ${p.type === 'friend' ? 'good' : 'bad'}">juntos</span>` : ''}</div>`).join('') : '<div class="item muted small">Ainda nenhuma. As relações aparecem com as semanas.</div>'}</div>`;
}
