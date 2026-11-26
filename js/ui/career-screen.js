// =============================================================
// career-screen.js — tela da CARREIRA DO TÉCNICO
// (perfil, diretoria e torcida, metas, propostas, troféus, histórico)
// =============================================================
import { esc, money } from '../util.js';
import { natBadge } from './nations-screen.js';
import { evaluate, coachLevel, LEVELS } from '../engine/career.js';
import { clubById } from '../engine/market.js';
import { badge } from './ui.js';
import { icon } from './icons.js';
import { flag } from './screens.js';

const initials = n => String(n).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'T';
const mood = v => v >= 80 ? 'Muito satisfeita' : v >= 60 ? 'Satisfeita' : v >= 40 ? 'Neutra' : v >= 25 ? 'Insatisfeita' : 'Furiosa';
const moodCol = v => v >= 60 ? 'var(--good)' : v >= 40 ? 'var(--warn)' : 'var(--bad)';

// Medidor em meia-lua (0–100)
export function gauge(v, label, size = 132) {
  const r = size / 2 - 10, cx = size / 2, cy = size / 2 + 4;
  const len = Math.PI * r, pct = Math.max(0, Math.min(100, v)) / 100;
  const col = moodCol(v);
  return `<div class="gauge">
    <svg width="${size}" height="${size / 2 + 14}" viewBox="0 0 ${size} ${size / 2 + 14}">
      <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="11" stroke-linecap="round"/>
      <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round"
        stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${(len * (1 - pct)).toFixed(1)}" class="g-arc" style="--len:${len.toFixed(1)};filter:drop-shadow(0 0 6px ${col})"/>
    </svg>
    <div class="g-val" style="color:${col}">${Math.round(v)}</div>
    <div class="g-lbl">${label}</div>
    <div class="tiny" style="color:${col};font-weight:700">${mood(v)}</div>
  </div>`;
}

function stateTag(s) {
  return s.state === 'done' ? `<span class="tag good">✔ Cumprida</span>`
    : s.state === 'ok' ? `<span class="tag">● No caminho</span>`
    : s.state === 'risk' ? `<span class="tag warn">⚠ Em risco</span>`
    : `<span class="tag bad">✘ Perdida</span>`;
}

function offerCard(g, o, fired) {
  const c = clubById(g, o.clubId);
  if (!c) return '';
  const L = g.leagues.find(l => l.clubIds.includes(c.id));
  return `<div class="offer" style="--oc:${esc(c.colors[0] === '#ffffff' ? c.colors[1] : c.colors[0])}">
    ${badge(c, 'lg')}
    <div class="grow" style="min-width:0">
      <div class="tiny muted">${icon('bell', 12)} PROPOSTA DE EMPREGO</div>
      <b class="ellipsis" style="display:block;font-size:17px">${esc(c.name)}</b>
      <div class="small muted ellipsis">${L ? flag(L.country) + ' ' + esc(L.name) : ''} · reputação ${c.rep}</div>
      ${o.fee && !fired ? `<div class="tiny good">Paga multa rescisória de ${money(o.fee)} ao seu clube atual</div>` : ''}
      <div class="btn-row" style="margin-top:8px">
        <button class="btn-sm btn-good" data-act="acceptJob" data-id="${o.clubId}">Aceitar</button>
        ${fired ? '' : `<button class="btn-sm" data-act="rejectJob" data-id="${o.id}">Recusar</button>`}
      </div>
    </div>
  </div>`;
}

export function careerScreen(S) {
  const g = S.game, c = g.coach;
  const uc = clubById(g, g.userClubId);
  const lvl = coachLevel(c.rep);
  const nextLvl = LEVELS.find(([min]) => min > c.rep);
  const evs = c.objectives.map(o => ({ o, s: evaluate(g, o) }));
  const done = evs.filter(e => e.s.state === 'done').length;
  return `
  <div class="row between"><h1 style="margin:0">Carreira</h1><button class="btn-sm" data-act="go" data-to="hub">${icon('back', 16)} Início</button></div>
  <div class="coach-hero mt">
    <div class="avatar">${esc(initials(c.name))}</div>
    <div class="grow" style="min-width:0">
      <div class="title ellipsis">${esc(c.name)}</div>
      <div class="row small" style="gap:6px;margin-top:4px"><span class="tag good">${lvl}</span><span class="muted">${c.fired ? 'Sem clube' : 'Técnico do ' + esc(uc.name)}</span></div>
      <div class="row" style="gap:8px;margin-top:8px"><div class="grow"><div class="bar"><i style="width:${c.rep}%;background:linear-gradient(90deg,var(--accent2),var(--accent))"></i></div></div><b class="num">${c.rep}</b></div>
      <div class="tiny muted" style="margin-top:3px">Reputação${nextLvl ? ` · próximo nível (${nextLvl[1]}) em ${nextLvl[0]}` : ' máxima'}</div>
    </div>
  </div>
  <div class="tiles">
    <div class="tile"><div class="k">${icon('whistle', 13)} Jogos</div><div class="v">${c.stats.games}</div></div>
    <div class="tile"><div class="k">${icon('chart', 13)} V-E-D</div><div class="v" style="font-size:16px">${c.stats.w}-${c.stats.d}-${c.stats.l}</div></div>
    <div class="tile"><div class="k">${icon('trophy', 13)} Títulos</div><div class="v accent">${c.trophies.length}</div></div>
  </div>

  ${c.fired ? `<div class="card hl" style="border-color:rgba(255,77,109,.5);box-shadow:0 0 0 1px rgba(255,77,109,.3),0 8px 28px -6px rgba(255,77,109,.45)">
      <h2 style="color:var(--bad)">${icon('logout', 20)} Você está sem clube</h2>
      <p class="small">${esc(c.firedReason || '')} Escolha uma das propostas para continuar a carreira.</p>
      <div class="btn-row">
        <button class="btn-sm" data-act="searchJobs">${icon('search', 15)} Procurar propostas</button>
        <button class="btn-sm" data-act="advanceWeek">${icon('fast', 15)} Esperar 1 semana</button>
      </div>
      <p class="tiny muted mt" style="margin-bottom:0">Dá para procurar uma vez por semana. O campeonato continua enquanto você está sem clube.</p>
    </div>` : `
  <div class="section-title"><h3>Confiança</h3></div>
  <div class="gauges">${gauge(c.board, 'Diretoria')}${gauge(c.fans, 'Torcida')}</div>
  <p class="tiny muted center">Vencer quem é mais forte vale mais; perder para um mais fraco pesa mais. Com a diretoria muito baixa, você pode ser demitido.</p>`}

  ${c.offers.length ? `<div class="section-title"><h3>Propostas</h3><span class="tag warn">${c.offers.length}</span></div>
    ${c.offers.map(o => offerCard(g, o, c.fired)).join('')}
    ${c.fired ? '' : '<p class="tiny muted">Aceitar troca de clube na hora: o clube atual volta a ser da IA.</p>'}` : ''}

  ${c.natOffer ? `<div class="section-title"><h3>Convite de seleção</h3><span class="tag warn">1</span></div>
    <div class="offer" style="--oc:var(--gold)">${natBadge(c.natOffer.nat, 'lg')}
      <div class="grow" style="min-width:0"><div class="tiny muted">🧢 CONVITE DA FEDERAÇÃO</div>
        <b class="ellipsis" style="display:block;font-size:17px">Seleção: ${flag(c.natOffer.nat)} ${esc(c.natOffer.nat)}</b>
        <div class="small muted">${c.natOffer.rank}ª do ranking · você continua no clube</div>
        <div class="btn-row" style="margin-top:8px"><button class="btn-sm btn-good" data-act="acceptNation">Aceitar</button><button class="btn-sm" data-act="rejectNation">Recusar</button></div>
      </div></div>` : ''}

  <div class="section-title"><h3>Seleção</h3></div>
  ${c.nation ? `<div class="card tap-card" data-act="go" data-to="nations" data-view="minha"><div class="row" style="gap:12px">${natBadge(c.nation.nat, 'lg')}
      <div class="grow"><b>${flag(c.nation.nat)} ${esc(c.nation.nat)}</b><div class="small muted">Técnico desde ${c.nation.since} · formação ${esc(c.nation.formation)}</div>
      <div class="tiny muted">${c.nation.squad.length ? 'Convocação sua' : 'Convocação automática'} · toque para convocar</div></div>${icon('chevron', 18, 'chev')}</div></div>`
    : `<p class="small muted">Com reputação 55 ou mais, seleções podem convidar você (no fim da temporada ou, mais raro, durante ela). Quanto maior a reputação, mais forte a seleção.${(c.natPast || []).length ? '<br>Passagens: ' + c.natPast.map(p => `${esc(p.nat)} (${p.from}–${p.to}${p.note === 'Demitido' ? ', demitido' : ''})`).join(', ') : ''}</p>`}

  ${c.fired ? '' : `<div class="section-title"><h3>Metas de ${g.season}</h3><span class="tag ${done ? 'good' : ''}">${done}/${evs.length}</span></div>
  <div class="list stagger">${evs.map(({ o, s }) => `<div class="item">
    <span class="ic-box" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06)">${icon(o.kind === 'league' ? 'chart' : o.kind === 'cup' ? 'trophy' : 'coin', 18)}</span>
    <div class="grow"><b class="small">${esc(o.text)}</b><div class="tiny muted">${esc(s.detail || '')}</div></div>${stateTag(s)}</div>`).join('')}</div>`}

  <div class="section-title"><h3>Sala de troféus</h3></div>
  ${c.trophies.length ? `<div class="trophies">${c.trophies.slice().reverse().map((t, i) => `<div class="trophy" style="animation-delay:${i * 0.05}s">
      <div class="cup">${icon('trophy', 30)}</div><b class="small">${esc(t.name)}</b><span class="tiny muted">${t.season} · ${esc(t.club)}</span></div>`).join('')}</div>`
    : `<div class="card center muted small">${icon('trophy', 28)}<p style="margin-top:6px">Nenhum título ainda. A primeira taça está esperando!</p></div>`}

  <div class="section-title"><h3>Histórico</h3></div>
  <div class="timeline">${c.history.length ? c.history.slice().reverse().map(h => `<div class="tl">
      <div class="tl-dot ${/Demitido/.test(h.note) ? 'bad' : /🏆/.test(h.note) ? 'gold' : ''}"></div>
      <div><b>${h.season} · ${esc(h.club)}</b><div class="small muted">${esc(h.league)} · ${h.pos}º lugar${h.note ? ' · ' + esc(h.note) : ''}</div></div></div>`).join('')
    : '<p class="small muted">Sua primeira temporada está em andamento.</p>'}</div>`;
}

// Cartão compacto para o Início
export function careerCard(S) {
  const c = S.game.coach;
  if (!c) return '';
  return `<div class="card tap-card" data-act="go" data-to="career">
    <div class="row between"><div class="row" style="gap:10px"><div class="avatar sm">${esc(initials(c.name))}</div>
      <div><b>${esc(c.name)}</b><div class="tiny muted">${coachLevel(c.rep)} · reputação ${c.rep}</div></div></div>${icon('chevron', 18, 'chev')}</div>
    <div class="mini-meters">
      <div><span class="tiny muted">DIRETORIA</span><div class="bar"><i style="width:${c.board}%;background:${moodCol(c.board)}"></i></div></div>
      <div><span class="tiny muted">TORCIDA</span><div class="bar"><i style="width:${c.fans}%;background:${moodCol(c.fans)}"></i></div></div>
    </div>
    ${c.offers.length ? `<div class="tag warn" style="margin-top:10px;display:inline-block">📨 ${c.offers.length} proposta(s) de emprego</div>` : ''}
    ${c.natOffer ? `<div class="tag warn" style="margin-top:10px;display:inline-block">🧢 Convite da seleção ${esc(c.natOffer.nat)}</div>` : ''}
    ${c.nation ? `<div class="tiny muted" style="margin-top:8px">🧢 Também técnico da seleção: <b>${esc(c.nation.nat)}</b></div>` : ''}
  </div>`;
}

// Balanço no fim da temporada
export function reviewBlock(r) {
  if (!r) return '';
  return `<div class="card">
    <h2>${icon('chart', 18)} Balanço do técnico</h2>
    <div class="list" style="margin:8px 0">${r.results.map(x => `<div class="item small" style="min-height:44px"><span class="grow">${esc(x.text)}<div class="tiny muted">${esc(x.detail || '')}</div></span>${x.state === 'done' ? '<span class="tag good">✔</span>' : '<span class="tag bad">✘</span>'}</div>`).join('')}</div>
    <p class="center">Reputação <b class="${r.repDelta >= 0 ? 'good' : 'bad'}">${r.repDelta >= 0 ? '+' : ''}${r.repDelta}</b> → <b>${r.rep}</b> (${esc(r.level)})</p>
    ${r.titles.length ? `<p class="center accent"><b>🏆 ${r.titles.map(esc).join(' · ')}</b></p>` : ''}
    ${r.firedNow ? '<p class="center bad"><b>A diretoria não vai renovar com você.</b> Escolha uma proposta em Carreira.</p>' : ''}
    <button class="btn-block btn-sm" data-act="go" data-to="career">Ver carreira</button>
  </div>`;
}
