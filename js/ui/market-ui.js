// =============================================================
// market-ui.js — negociação, olheiros, comparação de jogadores
// =============================================================
import { esc, money } from '../util.js';
import { overall } from '../engine/ratings.js';
import { negotiationChance, askingPrice, wageAsk, clubById, windowOpen, CLAUSES } from '../engine/market.js';
import { REGIONS, SCOUT_COST } from '../engine/scouting.js';
import { badge, posTag, ovrTag, radar } from './ui.js';
import { icon } from './icons.js';

const chanceLabel = c => c >= 0.85 ? ['Muito alta', 'var(--good)'] : c >= 0.6 ? ['Alta', 'var(--good)'] : c >= 0.35 ? ['Média', 'var(--warn)'] : c >= 0.12 ? ['Baixa', 'var(--bad)'] : ['Muito baixa', 'var(--bad)'];

// ---------- Negociação ----------
// st: { fee, wage, years, msg, tries }
export function negotiationModal(S, id, st) {
  const g = S.game, p = g.players[id];
  const user = clubById(g, g.userClubId);
  const from = p.clubId ? clubById(g, p.clubId) : null;
  const ask = askingPrice(g, p), wAsk = wageAsk(g, p, user);
  st = st || { fee: ask, wage: wAsk, years: p.age >= 30 ? 2 : 3 };
  const ch = negotiationChance(g, p, st.fee, st.wage, st.years, st);
  const [lbl, col] = chanceLabel(ch.total);
  const total = (from ? st.fee : 0) + (from ? 0 : st.wage * 4);
  return `<div class="row" style="gap:12px;margin:4px 48px 10px 0">${posTag(p.pos)}<div class="grow"><h2 style="margin:0">${esc(p.name)}</h2>
      <div class="small muted">${p.age} anos · ${from ? esc(from.name) : 'sem clube'}</div></div>${ovrTag(overall(p))}</div>
    <div class="card">
      ${from ? `<label>Valor da transferência <span class="tiny muted">(o clube pede ${money(ask)})</span></label>
      <div class="row"><input type="range" id="ng-fee" min="${Math.round(ask * 0.5)}" max="${Math.round(ask * 1.5)}" step="${Math.max(10000, Math.round(ask / 200 / 10000) * 10000)}" value="${st.fee}" data-change="nego" data-id="${id}">
        <b class="num" id="ng-fee-v" style="min-width:86px;text-align:right">${money(st.fee)}</b></div>` : '<p class="small">Sem clube: não há taxa de transferência, só as luvas (4 semanas de salário).</p>'}
      <label>Salário semanal <span class="tiny muted">(o jogador pede ${money(wAsk)})</span></label>
      <div class="row"><input type="range" id="ng-wage" min="${Math.round(wAsk * 0.6)}" max="${Math.round(wAsk * 1.6)}" step="${Math.max(100, Math.round(wAsk / 100 / 100) * 100)}" value="${st.wage}" data-change="nego" data-id="${id}">
        <b class="num" id="ng-wage-v" style="min-width:86px;text-align:right">${money(st.wage)}</b></div>
      <label>Contrato</label>
      <div class="chips">${[1, 2, 3, 4, 5].map(y => `<button class="chip ${st.years === y ? 'on' : ''}" data-act="negoYears" data-id="${id}" data-v="${y}">${y} ano${y > 1 ? 's' : ''}</button>`).join('')}</div>
      ${from ? `<label>% de venda futura para o ${esc(from.name)} <span class="tiny muted">(ajuda a baixar o preço)</span></label>
      <div class="chips">${[0, 0.1, 0.2].map(v => `<button class="chip ${(st.sellOn || 0) === v ? 'on' : ''}" data-act="negoOpt" data-k="sellOn" data-id="${id}" data-v="${v}">${v ? Math.round(v * 100) + '%' : 'Nenhuma'}</button>`).join('')}</div>` : ''}
      <label>Multa rescisória <span class="tiny muted">(multa baixa agrada o jogador, mas outro clube pode pagar e levá-lo)</span></label>
      <div class="chips">${Object.entries(CLAUSES).map(([k, c]) => `<button class="chip ${(st.clause || 'none') === k ? 'on' : ''}" data-act="negoOpt" data-k="clause" data-id="${id}" data-v="${k}">${c[0]}</button>`).join('')}</div>
    </div>
    ${ch.rival ? `<div class="card small" style="border-color:var(--bad)">🚨 <b>${esc(clubById(g, ch.rival.clubId).name)}</b> está na disputa com oferta de <b>${money(ch.rival.fee)}</b>. Cubra até a próxima semana!</div>` : ''}
    <div class="card" id="ng-chance">
      <div class="row between"><b>Chance de aceitarem</b><b id="ng-lbl" style="color:${col}">${lbl} · ${Math.round(ch.total * 100)}%</b></div>
      <div class="bar" style="height:10px;margin:8px 0"><i id="ng-bar" style="width:${Math.round(ch.total * 100)}%;background:${col}"></i></div>
      <div class="tiny muted" id="ng-parts">${from ? `Clube: ${Math.round(ch.club * 100)}% · ` : ''}Jogador: ${Math.round(ch.player * 100)}%</div>
      ${from && from.rep - user.rep > 12 ? `<div class="tiny warn mt">⚠️ Ele joga num clube bem maior que o seu e resiste a vir, mesmo ganhando mais.</div>` : ''}
      ${p.age >= 30 ? `<div class="tiny muted">Veterano: prefere contratos de 2 anos ou mais.</div>` : ''}
      <div class="tiny muted mt">Custo agora: <b id="ng-total">${money(total)}</b> · seu caixa: ${money(user.budget)}</div>
    </div>
    ${st.msg ? `<div class="card small" style="border-color:${st.ok ? 'var(--good)' : 'var(--warn)'}">${esc(st.msg)}${st.tries != null ? ` <span class="muted">(${st.tries} tentativa(s) restante(s) nesta semana)</span>` : ''}</div>` : ''}
    ${from && !windowOpen(g) ? '<p class="small warn">A janela de transferências está fechada.</p>' : ''}
    <button class="btn-main" data-act="negoSend" data-id="${id}">${icon('swap', 18)} Enviar proposta</button>`;
}

// Atualiza a chance ao mexer nos controles (sem redesenhar a janela)
export function updateNegotiation(S, id, st) {
  const g = S.game, p = g.players[id];
  const ch = negotiationChance(g, p, st.fee, st.wage, st.years, st);
  const [lbl, col] = chanceLabel(ch.total);
  const $ = x => document.getElementById(x);
  if ($('ng-fee-v')) $('ng-fee-v').textContent = money(st.fee);
  if ($('ng-wage-v')) $('ng-wage-v').textContent = money(st.wage);
  if ($('ng-lbl')) { $('ng-lbl').textContent = `${lbl} · ${Math.round(ch.total * 100)}%`; $('ng-lbl').style.color = col; }
  if ($('ng-bar')) { $('ng-bar').style.width = Math.round(ch.total * 100) + '%'; $('ng-bar').style.background = col; }
  if ($('ng-parts')) $('ng-parts').textContent = `${p.clubId ? `Clube: ${Math.round(ch.club * 100)}% · ` : ''}Jogador: ${Math.round(ch.player * 100)}%`;
  if ($('ng-total')) $('ng-total').textContent = money(p.clubId ? st.fee : st.wage * 4);
}

// ---------- Comparação ----------
export function compareModal(S, idA, idB) {
  const g = S.game, A = g.players[idA], B = g.players[idB];
  if (!A || !B) return '<p>Jogador não encontrado.</p>';
  const keys = [['FIN', 'fin'], ['PAS', 'pas'], ['DEF', 'def'], ['FOR', 'for'], ['RES', 'res']];
  if (A.pos === 'GOL' || B.pos === 'GOL') keys.push(['GOL', 'gk']);
  const head = (p, cls) => {
    const c = p.clubId ? clubById(g, p.clubId) : null;
    return `<div class="cmp-head ${cls}">${posTag(p.pos)} ${ovrTag(overall(p))}<b class="small ellipsis" style="display:block;margin-top:6px">${esc(p.name)}</b>
      <span class="tiny muted">${p.age}a · ${c ? esc(c.name) : 'sem clube'}</span></div>`;
  };
  const rows = [
    ...keys.map(([l, k]) => [l, A.attrs[k], B.attrs[k]]),
    ['Nota', overall(A), overall(B)], ['Potencial', A.potential, B.potential], ['Idade', A.age, B.age, true],
    ['Energia', Math.round(A.fitness), Math.round(B.fitness)], ['Moral', Math.round(A.moral), Math.round(B.moral)]
  ];
  return `<h2 style="margin:4px 48px 10px 0">${icon('swap', 18)} Comparar</h2>
    <div class="grid2">${head(A, 'a')}${head(B, 'b')}</div>
    <div class="center" style="margin:6px 0">${radarCompare(keys, A, B)}</div>
    <div class="list">${rows.map(([l, a, b, lowBetter]) => {
      const aw = lowBetter ? a < b : a > b, bw = lowBetter ? b < a : b > a;
      return `<div class="item small" style="min-height:40px;display:grid;grid-template-columns:1fr 90px 1fr;text-align:center">
        <b class="${aw ? 'good' : ''}">${a}</b><span class="muted tiny" style="text-transform:uppercase;letter-spacing:.06em">${l}</span><b class="${bw ? 'good' : ''}">${b}</b></div>`;
    }).join('')}</div>
    <p class="tiny muted center">Em verde, quem é melhor naquele item. <span style="color:var(--accent)">■</span> ${esc(A.name)} · <span style="color:var(--accent2)">■</span> ${esc(B.name)}</p>`;
}
function radarCompare(keys, A, B) {
  const size = 200, cx = 100, cy = 100, R = 72, n = keys.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  const poly = (p, cls) => `<polygon class="${cls}" points="${keys.map(([, k], i) => pt(i, Math.max(.05, p.attrs[k] / 99)).join(',')).join(' ')}"/>`;
  const grid = [0.25, 0.5, 0.75, 1].map(k => `<polygon points="${keys.map((_, i) => pt(i, k).join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,.1)"/>`).join('');
  const lbl = keys.map(([l], i) => { const [x, y] = pt(i, 1.18); return `<text x="${x}" y="${y + 3}" text-anchor="middle">${l}</text>`; }).join('');
  return `<svg class="radar cmp" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${grid}${poly(A, 'ra')}${poly(B, 'rb')}${lbl}</svg>`;
}

// ---------- Olheiros (aba do Mercado) ----------
export function scoutView(S) {
  const g = S.game;
  const s = g.scout;
  const f = S.scoutForm || (S.scoutForm = { region: 'Brasil', pos: 'ALL', profile: 'jovens', weeks: 4 });
  const reports = (s && s.reports) || [];
  const chip = (k, v, l) => `<button class="chip ${f[k] === v ? 'on' : ''}" data-act="scoutForm" data-k="${k}" data-v="${v}">${l}</button>`;
  let html = '';
  if (s && s.weeksLeft > 0) {
    html += `<div class="card hl"><div class="row between"><b>${icon('search', 16)} Olheiro em missão</b><span class="tag good">${s.weeksLeft} sem. restante(s)</span></div>
      <p class="small muted" style="margin:6px 0">${esc(s.region)} · ${s.pos === 'ALL' ? 'todas as posições' : s.pos} · ${s.profile === 'jovens' ? 'jovens promessas (até 21)' : 'prontos para jogar (21–29)'} · ${money(SCOUT_COST[s.region])}/semana</p>
      <button class="btn-sm btn-bad" data-act="scoutStop">Encerrar missão</button></div>`;
  } else {
    html += `<div class="card"><b>${icon('search', 16)} Enviar olheiro</b><p class="small muted" style="margin:4px 0 8px">Ele traz até 2 relatórios por semana e revela o potencial real dos jogadores.</p>
      <label>Região</label><div class="chips">${REGIONS.map(r => chip('region', r, r)).join('')}</div>
      <label>Posição</label><div class="chips">${['ALL', 'GOL', 'ZAG', 'LAT', 'VOL', 'MEI', 'ATA'].map(p => chip('pos', p, p === 'ALL' ? 'Todas' : p)).join('')}</div>
      <label>Perfil</label><div class="chips">${chip('profile', 'jovens', 'Jovens promessas')}${chip('profile', 'prontos', 'Prontos para jogar')}</div>
      <label>Duração</label><div class="chips">${[4, 8, 12].map(w => chip('weeks', String(w), `${w} semanas`)).join('')}</div>
      <p class="small mt">Custo: <b>${money(SCOUT_COST[f.region])}</b>/semana · total ${money(SCOUT_COST[f.region] * Number(f.weeks))}</p>
      <button class="btn-main" data-act="scoutStart">${icon('search', 18)} Enviar olheiro</button></div>`;
  }
  html += `<h3>Relatórios (${reports.length})</h3>`;
  html += reports.length ? `<div class="list stagger">${reports.map(r => {
    const p = g.players[r.id];
    if (!p) return '';
    const c = p.clubId ? clubById(g, p.clubId) : null;
    return `<div class="item tap" data-act="player" data-id="${p.id}">${posTag(p.pos)}
      <div class="grow"><b>${esc(p.name)}</b> <span class="small muted">${p.age}a</span>
        <div class="tiny muted">${c ? esc(c.name) : 'sem clube'} · ${money(p.clubId ? askingPrice(g, p) : 0)} · <i>${esc(r.note)}</i></div></div>
      <div class="center"><span class="tag good">POT ${p.potential}</span></div>${ovrTag(overall(p))}</div>`;
  }).join('')}</div>` : '<p class="small muted">Nenhum relatório ainda.</p>';
  return html;
}
