// =============================================================
// match-screen.js — partida ao vivo (campo, lances, números)
// =============================================================
// A tela é desenhada uma vez (matchScreen) e depois só os pedaços
// que mudam são atualizados a cada minuto (patchMatch). Assim a bola
// pode deslizar pelo campo com animação.
// =============================================================
import { esc, money, rnd } from '../util.js';
import { effectiveRating, positionFit } from '../engine/ratings.js';
import { badge } from './ui.js';
import { resultRow, tacticChips } from './screens.js';
import { ceremonyBlock } from './awards-screen.js';
import { reviewBlock } from './career-screen.js';
import { nationalsBlock } from './nations-screen.js';
import { icon } from './icons.js';
import { INSTR } from '../engine/match.js';

const userTeam = (S, m) => m.teams.find(t => t.club.id === S.game.userClubId);
const oppTeam = (S, m) => m.teams.find(t => t.club.id !== S.game.userClubId);
const surname = n => { const w = String(n).trim().split(/\s+/); const s = w.length > 1 ? w[w.length - 1] : w[0]; return s.length > 10 ? s.slice(0, 9) + '.' : s; };

// ---------- Posições no campo ----------
// Linhas: goleiro, defesa, volantes, meias, ataque. Laterais e meias
// vão para as pontas da linha; volantes e zagueiros, para o centro.
const ROW = { GOL: 0, ZAG: 1, LAT: 1, VOL: 2, MEI: 3, ATA: 4 };
const WIDE = { LAT: 3, MEI: 2, ATA: 1, VOL: 1, ZAG: 0, GOL: 0 };
// full = true: um time só ocupando o campo inteiro (tela de Tática)
export function layout(onField, bottom, full = false) {
  const rows = [[], [], [], [], []];
  onField.forEach(f => rows[ROW[f.slot]].push(f));
  const used = rows.filter(r => r.length);
  const out = {};
  const outfield = used.filter(r => r[0].slot !== 'GOL');
  used.forEach(row => {
    // ordena: mais "abertos" nas pontas
    const sorted = row.slice().sort((a, b) => WIDE[b.slot] - WIDE[a.slot]);
    const pos = new Array(row.length);
    let l = 0, r = row.length - 1;
    sorted.forEach((f, i) => { if (i % 2 === 0) pos[l++] = f; else pos[r--] = f; });
    const isGK = row[0].slot === 'GOL';
    const k = outfield.indexOf(row);
    const yb = full
      ? (isGK ? 91 : 73 - (outfield.length > 1 ? k * (56 / (outfield.length - 1)) : 28))
      : (isGK ? 94 : 82 - (outfield.length > 1 ? k * (28 / (outfield.length - 1)) : 14));
    pos.forEach((f, i) => {
      // linhas com poucos jogadores ficam mais centralizadas
      const m = row.length === 2 ? 28 : row.length === 3 ? 18 : 12;
      const x = row.length === 1 ? 50 : m + (100 - 2 * m) * i / (row.length - 1);
      out[f.id] = { x: bottom ? x : 100 - x, y: bottom ? yb : 100 - yb };
    });
  });
  return out;
}

function playerDot(S, m, t, f, xy, bottom) {
  const p = S.game.players[f.id];
  const sel = S.subOut === f.id;
  const y = t.yellows[f.id] ? '🟨' : '';
  const inj = f.injured ? '🚑' : '';
  const mine = t.club.id === S.game.userClubId && !m.pcId;
  return `<div class="pl ${bottom ? 'pl-me' : ''} ${sel ? 'sel' : ''}" style="left:${xy.x}%;top:${xy.y}%" data-pid="${f.id}" ${mine ? `data-act="pitchPick" data-id="${f.id}"` : ''}>
    <span class="shirt" style="--c1:${esc(t.club.colors[0])};--c2:${esc(t.club.colors[1])}">${f.slot}</span>
    <span class="nm">${inj}${y}${esc(surname(p.name))}</span>
    <span class="en ${p.fitness < 50 ? 'low' : p.fitness < 70 ? 'mid' : ''}">E:${Math.round(p.fitness)}</span>
  </div>`;
}

function pitchHTML(S, m) {
  const me = userTeam(S, m), op = oppTeam(S, m);
  const L1 = layout(me.onField, true), L2 = layout(op.onField, false);
  // .pitch-inner é a camada que recebe o zoom no replay do gol
  return `<div class="pitch" id="mx-pitch"><div class="pitch-inner" id="mx-pitch-inner">
    <div class="pitch-lines"><i class="half"></i><i class="circle"></i><i class="box top"></i><i class="box bot"></i></div>
    ${op.onField.map(f => playerDot(S, m, op, f, L2[f.id], false)).join('')}
    ${me.onField.map(f => playerDot(S, m, me, f, L1[f.id], true)).join('')}
    <div class="ball" id="mx-ball" style="left:50%;top:50%"></div>
  </div><div class="goal-flash" id="mx-flash"></div></div>`;
}

function benchHTML(S, m) {
  const t = userTeam(S, m);
  const list = t.bench.filter(id => !t.used.has(id));
  const out = S.subOut ? t.onField.find(f => f.id === S.subOut) : null;
  // Com alguém selecionado para sair: quem joga na mesma posição aparece
  // primeiro e em destaque; depois quem se adapta bem; o resto fica apagado
  const fit = id => out ? positionFit(S.game.players[id].pos, out.slot) : 0;
  const ordered = out ? list.slice().sort((a, b) => fit(b) - fit(a) || effectiveRating(S.game.players[b], out.slot) - effectiveRating(S.game.players[a], out.slot)) : list;
  const outP = out ? S.game.players[out.id] : null;
  return `<div class="row between"><h3 style="margin:0">Reservas · ${t.subsLeft} troca(s)</h3>
    <span class="tiny muted">${out ? 'Agora toque em quem entra' : 'Toque num jogador seu no campo para trocar'}</span></div>
  ${out ? `<div class="sub-hint">${icon('swap', 15)} Saindo: <b>${esc(outP.name)}</b> <span class="pos pos-${out.slot}" style="width:auto;padding:2px 6px">${out.slot}</span> · em destaque quem faz a mesma função</div>` : ''}
  <div class="bench">${ordered.map(id => {
    const p = S.game.players[id];
    const r = Math.round(effectiveRating(p, out ? out.slot : p.pos));
    const f = fit(id);
    const cls = !out ? '' : f >= 1 ? 'ready same' : f >= 0.85 ? 'ready near' : 'ready other';
    const lbl = !out ? '' : f >= 1 ? '<span class="bn-tag">Mesma função</span>' : f >= 0.85 ? '<span class="bn-tag near">Adaptável</span>' : '';
    return `<button class="bn ${cls}" data-act="${out ? 'subIn' : 'benchInfo'}" data-id="${id}">
      ${lbl}<b>${p.pos}</b> ${esc(surname(p.name))}<span class="tiny">E:${Math.round(p.fitness)} · nota ${r}</span></button>`;
  }).join('') || '<span class="muted small">Sem reservas disponíveis.</span>'}</div>`;
}

function statsHTML(m) {
  const [h, a] = m.teams;
  const total = h.stats.poss + a.stats.poss || 1;
  const row = (l, x, y) => {
    const s = (x + y) || 1;
    return `<div class="sbar"><b>${x}</b><div><div class="lbl">${l}</div><div class="track"><i style="width:${x / s * 100}%"></i></div></div><b>${y}</b></div>`;
  };
  const ph = Math.round(h.stats.poss / total * 100);
  return `<div class="card">
    ${row('Posse de bola (%)', ph, 100 - ph)}
    ${row('Finalizações', h.stats.shots, a.stats.shots)}
    ${row('No gol', h.stats.onTarget, a.stats.onTarget)}
    ${row('Escanteios', h.stats.corners, a.stats.corners)}
    ${row('Desarmes', h.stats.tackles, a.stats.tackles)}
    ${row('Erros de passe', h.stats.passErr, a.stats.passErr)}
    ${row('Faltas', h.stats.fouls, a.stats.fouls)}
    ${row('Amarelos', h.stats.yellow, a.stats.yellow)}
    ${row('Vermelhos', h.stats.red, a.stats.red)}
  </div>`;
}

function feedHTML(S, m) {
  // Narração completa por padrão; a caixinha deixa só os lances importantes
  const minor = ['chance', 'tackle', 'play'];
  const evs = m.events.filter(e => !S.matchVerbose || !minor.includes(e.type)).slice().reverse();
  return `<label class="small row" style="margin:0 0 8px"><input type="checkbox" style="width:auto;min-height:0" data-change="verbose" ${S.matchVerbose ? 'checked' : ''}> só os lances importantes</label>
  ${evs.map(e => `<div class="ev ${e.type}"><span class="m">${e.min}'</span>${esc(e.text)}</div>`).join('')}`;
}

// Botões de instrução ao vivo (postura do time)
function instrHTML(S, m) {
  if (m.finished || m.pcId) return '';
  const side = m.teams.findIndex(t => t.club.id === S.game.userClubId);
  const cur = m.instr[side];
  const ic = { normal: 'target', pressao: 'fire', contra: 'bolt', segurar: 'shield', tudo: 'star' };
  return `<div class="instr" id="mx-instr">${Object.entries(INSTR).map(([k, v]) =>
    `<button class="${cur === k ? 'on' : ''}" data-act="matchInstr" data-v="${k}">${icon(ic[k], 15)}${v.label}</button>`).join('')}</div>
  <div class="tiny muted instr-tip" id="mx-instr-tip">${esc(INSTR[cur].tip)}</div>`;
}

// Notas dos jogadores (depois do apito final)
function ratingsHTML(S, m) {
  if (!m.ratings) return '';
  const col = t => [...t.used].map(id => ({ p: S.game.players[id], r: m.ratings[id] })).filter(x => x.p).sort((a, b) => b.r - a.r)
    .map(({ p, r }) => `<div class="row small" style="justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--line)">
      <span class="ellipsis">${p.pos} ${esc(surname(p.name))}</span><b class="${r >= 7.5 ? 'good' : r < 5.5 ? 'bad' : ''}">${r.toFixed(1)}</b></div>`).join('');
  const [h, a] = m.teams;
  const best = [...h.used, ...a.used].sort((x, y) => (m.ratings[y] || 0) - (m.ratings[x] || 0))[0];
  return `<h3 class="mt">Notas da partida</h3>
  ${best ? `<p class="small">⭐ Craque do jogo: <b>${esc(S.game.players[best].name)}</b> (${m.ratings[best].toFixed(1)})</p>` : ''}
  <div class="grid2"><div class="card" style="margin:0"><b class="small">${esc(h.club.short)}</b>${col(h)}</div>
  <div class="card" style="margin:0"><b class="small">${esc(a.club.short)}</b>${col(a)}</div></div>`;
}

function othersHTML(S, m) {
  const same = S.prep.matches.filter(x => x !== m && x.leagueId === m.leagueId);
  return `<h3 class="mt">Outros jogos da liga</h3><div class="list">${same.map(x => `<div class="item small" style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;min-height:0;padding:6px 12px">
    <span class="right ellipsis">${esc(x.teams[0].club.name)}</span><b>${x.teams[0].goals} x ${x.teams[1].goals}</b><span class="ellipsis">${esc(x.teams[1].club.name)}</span></div>`).join('')}</div>`;
}

function scorersLine(t) {
  return t.scorers.map(s => `⚽ ${s.min}'`).join(' ');
}

function lastBigEvent(m, skipGoal) {
  const e = [...m.events].reverse().find(x => !(skipGoal && (x.type === 'goal' || x.min === m.minute && x.type === 'color')) && ['goal', 'red', 'yellow', 'injury', 'sub', 'save', 'half', 'end', 'info', 'pen', 'color', 'talk', 'play', 'instr', 'chance', 'tackle', 'pcmoment'].includes(x.type));
  return e ? `<span class="m">${e.min}'</span> ${esc(e.text)}` : '';
}

// ---------- Tela completa ----------
export function matchScreen(S) {
  const m = S.prep.userMatch;
  const [h, a] = m.teams;
  const tab = S.matchTab || 'campo';
  const ended = m.finished;
  const home = h.club;
  const body = tab === 'campo' ? pitchHTML(S, m) + benchHTML(S, m)
    : tab === 'lances' ? feedHTML(S, m)
    : bigPressure(m) + statsHTML(m) + shotsBlock(m) + ratingsHTML(S, m) + othersHTML(S, m);
  const col = c => esc(c.colors[0] === '#ffffff' || c.colors[0] === '#fff' ? c.colors[1] : c.colors[0]);
  return `
  <div class="score ${ended ? 'ended' : ''}" id="mx-scoreboard" style="--h1:${col(h.club)};--a1:${col(a.club)}">
    <div class="t">${badge(h.club, 'lg')}<span class="ellipsis" style="max-width:110px">${esc(h.club.name)}</span><span class="tiny" id="mx-sc0">${scorersLine(h)}</span></div>
    <div style="display:flex;flex-direction:column;align-items:center"><div class="g" id="mx-g">${h.goals} - ${a.goals}</div>${m.pens ? `<div class="tiny center accent">pênaltis ${m.pens[0]} x ${m.pens[1]}</div>` : ''}<div class="min" id="mx-min">${ended ? 'Encerrado' : m.minute + "'"}</div>
      <div class="prog"><i id="mx-prog" style="width:${m.minute / 90 * 100}%"></i></div></div>
    <div class="t">${badge(a.club, 'lg')}<span class="ellipsis" style="max-width:110px">${esc(a.club.name)}</span><span class="tiny" id="mx-sc1">${scorersLine(a)}</span></div>
  </div>
  <div class="mx-info small"><b class="row" style="gap:5px">${m.cupName ? icon('trophy', 15) + ' ' + esc(m.cupName) + ' · ' + esc(m.stage) : icon('calendar', 15) + ' ' + esc((S.game.leagues.find(l => l.id === m.leagueId) || {}).name || '') + ' · Rodada ' + (S.game.round + 1)}</b>${m.knockout ? ' <span class="tag warn">mata-mata</span>' : ''}</div>
  <div class="mx-info tiny muted"><span>${icon('stadium', 14)} ${esc(home.stadiumName || 'Estádio do ' + home.name)}</span><span>${icon('users', 14)} ${(m.attendance || 0).toLocaleString('pt-BR')}</span><span>${icon('coin', 14)} ${money(m.income || 0)}</span></div>
  <div class="momentum" style="--h1:${col(h.club)};--a1:${col(a.club)}">${momentumHTML(m)}</div>
  <div class="press-wrap" id="mx-press" style="--h1:${col(h.club)};--a1:${col(a.club)}">${pressureSVG(m)}</div>
  <div class="ticker" id="mx-ticker">${lastBigEvent(m)}</div>
  ${instrHTML(S, m)}
  <div class="tabs">
    ${[['campo', 'pitch', 'Campo'], ['lances', 'list', 'Lances'], ['numeros', 'chart', 'Números']].map(([k, ic, l]) =>
      `<button class="${tab === k ? 'on' : ''}" data-act="matchTab" data-v="${k}">${icon(ic, 17)} ${l}</button>`).join('')}
  </div>
  <div id="mx-body" style="--h1:${col(h.club)};--a1:${col(a.club)}">${body}</div>
  <div style="height:86px"></div>
  <div class="match-ctrl"><div class="inner">
    ${ended
      ? `<button class="btn-main" data-act="endMatch">Continuar ${icon('chevron', 20)}</button>`
      : `<button id="mx-pause" data-act="matchPause" class="${S.matchRunning ? '' : 'primary'}">${pauseLabel(S.matchRunning)}</button>
         <button data-act="matchSpeed">${icon('fast', 20)}${['1x', '2x', '4x'][S.matchSpeed]}</button>
         ${m.pcId ? '' : `<button data-act="matchTactics">${icon('target', 20)}Tática</button>`}
         <button data-act="matchSkip">${icon('skip', 20)}Fim</button>
         <button class="snd" id="mx-snd" data-act="toggleSound" aria-label="Som">${icon(S.settings && (S.settings.sfx || S.settings.crowd) ? 'sound' : 'mute', 20)}</button>`}
  </div></div>`;
}

export function pauseLabel(running) {
  return running ? `${icon('pause', 20)}Pausar` : `${icon('play', 20)}Seguir`;
}

// Domínio (posse de bola acumulada) — barra ao vivo
function momentumHTML(m) {
  const [h, a] = m.teams;
  const tot = h.stats.poss + a.stats.poss;
  const p = tot ? Math.round(h.stats.poss / tot * 100) : 50;
  return `<span id="mx-mh">${p}%</span><div class="trk"><i id="mx-mom" style="width:${p}%"></i></div><span id="mx-ma" class="right">${100 - p}%</span><div class="lbl">Posse de bola</div>`;
}

// ---------- Preleção e conversa no intervalo ----------
export function talkModal(S, when) {
  const m = S.prep.userMatch;
  const meIdx = m.teams.findIndex(t => t.club.id === S.game.userClubId);
  const me = m.teams[meIdx], op = m.teams[1 - meIdx];
  const ctx = when === 'half'
    ? `Intervalo: ${me.club.short} ${me.goals} x ${op.goals} ${op.club.short}. ${me.goals > op.goals ? 'Vocês estão vencendo.' : me.goals < op.goals ? 'Vocês estão perdendo.' : 'O jogo está empatado.'}`
    : `Antes de enfrentar o ${op.club.name}. Força: ${Math.round(teamPower(m, meIdx))} x ${Math.round(teamPower(m, 1 - meIdx))}.`;
  const opt = (v, ic, t, d) => `<button class="talk-opt" data-act="teamTalk" data-v="${v}" data-when="${when}">
    <span class="ic-box">${icon(ic, 20)}</span><span class="grow" style="text-align:left"><b>${t}</b><span class="small muted" style="display:block">${d}</span></span></button>`;
  return `<div class="center" style="margin-top:4px">
      <div class="avatar" style="margin:0 auto 10px">${icon('whistle', 30)}</div>
      <h2>${when === 'half' ? 'Conversa no intervalo' : 'Preleção'}</h2>
      <p class="small muted">${esc(ctx)}</p></div>
    <div class="talk-list">
      ${opt('elogiar', 'star', 'Elogiar o time', 'Bom quando as coisas vão bem.')}
      ${opt('cobrar', 'fire', 'Cobrar mais empenho', 'Desperta quem está abaixo. Pode irritar quem joga bem.')}
      ${opt('calma', 'shield', 'Pedir calma e concentração', 'Menos cartões e defesa mais atenta.')}
      ${opt('pracima', 'bolt', 'Mandar o time pra cima', 'Mais ataque, defesa mais exposta e mais cansaço.')}
    </div>
    <button class="btn-block btn-sm btn-ghost mt" data-act="skipTalk" data-when="${when}">Pular</button>`;
}
function teamPower(m, i) {
  const s = m.strength(m.teams[i]);
  return (s.att + s.mid + s.def) / 6;
}

// ---------- Gráfico de pressão (quem está atacando mais, minuto a minuto) ----------
// Acima da linha: mandante; abaixo: visitante. Linhas verticais = gols.
export function pressureSVG(m, height = 46) {
  const raw = m.pressure || [];
  const pts = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 4), i + 1);          // média dos últimos 5 minutos
    return w.reduce((s, v) => s + v, 0) / w.length;
  });
  const maxAbs = Math.max(1.5, ...pts.map(Math.abs));
  const Y = v => 20 - (v / maxAbs) * 18;
  const up = pts.map((v, i) => `${i + 0.5},${Y(Math.max(0, v)).toFixed(2)}`).join(' ');
  const dn = pts.map((v, i) => `${i + 0.5},${Y(Math.min(0, v)).toFixed(2)}`).join(' ');
  const n = pts.length;
  const goals = m.events.filter(e => e.type === 'goal').map(e =>
    `<line x1="${e.min - 0.5}" x2="${e.min - 0.5}" y1="${e.side === 0 ? 1 : 21}" y2="${e.side === 0 ? 19 : 39}" class="pg ${e.side === 0 ? 'h' : 'a'}" vector-effect="non-scaling-stroke"/>`).join('');
  return `<svg class="press" viewBox="0 0 90 40" preserveAspectRatio="none" style="height:${height}px">
    <line x1="45" x2="45" y1="0" y2="40" class="ph" vector-effect="non-scaling-stroke"/>
    ${n ? `<polygon points="0.5,20 ${up} ${n - 0.5},20" class="pu"/><polygon points="0.5,20 ${dn} ${n - 0.5},20" class="pd"/>` : ''}
    <line x1="0" x2="90" y1="20" y2="20" class="pz" vector-effect="non-scaling-stroke"/>${goals}
  </svg>`;
}

function bigPressure(m) {
  const [h, a] = m.teams;
  return `<h3 style="margin-top:4px">Pressão ao longo do jogo</h3>
  <div class="card" style="padding:10px 12px">
    <div class="row between tiny"><b>${esc(h.club.short)} ▲</b><span class="muted">1º tempo · 2º tempo</span><b>▼ ${esc(a.club.short)}</b></div>
    <div class="press-wrap big">${pressureSVG(m, 96)}</div>
    <div class="tiny muted center">Quanto mais alta a onda, mais aquele time atacava. Linhas = gols.</div>
  </div>`;
}

// ---------- Mapa de chutes ----------
function shotMapSVG(m, side) {
  const shots = (m.shots || []).filter(s => s.side === side);
  const dots = shots.map(s => {
    const cx = (s.x / 100 * 68).toFixed(1), cy = (s.d * 52 + 1).toFixed(1);
    return s.res === 'goal' ? `<circle cx="${cx}" cy="${cy}" r="1.9" class="sg"/>`
      : s.res === 'save' ? `<circle cx="${cx}" cy="${cy}" r="1.4" class="ss"/>`
      : `<circle cx="${cx}" cy="${cy}" r="1.2" class="sm"/>`;
  }).join('');
  // só o terço final (onde saem os chutes), para os pontos não ficarem espremidos
  return `<svg class="shotmap" viewBox="0 -2 68 34">
    <rect x="0.5" y="0.5" width="67" height="31.5" class="sp"/>
    <rect x="13.85" y="0.5" width="40.3" height="16.5" class="sl"/><rect x="24.85" y="0.5" width="18.3" height="5.5" class="sl"/>
    <rect x="30.3" y="-1.2" width="7.4" height="1.7" class="sgoal"/>
    <path d="M 26.7 17 A 9.15 9.15 0 0 0 41.3 17" class="sl"/>
    <circle cx="34" cy="11" r=".5" fill="rgba(255,255,255,.6)"/>
    ${dots}
  </svg>`;
}
function shotsBlock(m) {
  const [h, a] = m.teams;
  const cnt = (side, r) => (m.shots || []).filter(s => s.side === side && (!r || s.res === r)).length;
  const col = (t, side) => `<div class="card" style="margin:0;padding:10px">
    <div class="row between small"><b class="ellipsis">${esc(t.club.short)}</b><span class="tiny muted">${cnt(side)} chutes</span></div>
    ${shotMapSVG(m, side)}
    <div class="tiny muted center">⚽ ${cnt(side, 'goal')} · ◎ ${cnt(side, 'save')} no gol · ○ ${cnt(side, 'miss')} fora</div></div>`;
  return `<h3>Mapa de chutes</h3><div class="grid2">${col(h, 0)}${col(a, 1)}</div>
  <p class="tiny muted center" style="margin-top:6px">Cada mapa mostra a área atacada pelo time. <span class="accent">●</span> gol · ◎ defendido · ○ para fora</p>`;
}

// Aviso rápido sobre o campo (cartão, troca, lesão)
function pitchPop(text) {
  const pitch = document.getElementById('mx-pitch');
  if (!pitch) return;
  pitch.querySelectorAll('.pitch-pop').forEach(e => e.remove());
  const d = document.createElement('div');
  d.className = 'pitch-pop';
  d.textContent = text;
  pitch.appendChild(d);
  setTimeout(() => d.remove(), 2300);
}

// Assinatura de quem está em campo: se mudar, a tela é redesenhada
export function fieldSignature(m) {
  return m.teams.map(t => t.onField.map(f => f.id + f.slot + (f.injured ? 'i' : '')).join(',') + '|' + t.subsLeft).join('#');
}

// ---------- Atualização leve (a cada minuto) ----------
export function patchMatch(S, newEvents) {
  const m = S.prep.userMatch;
  const [h, a] = m.teams;
  const $ = id => document.getElementById(id);
  if (!$('mx-g')) return false;
  // Gol pendente do minuto anterior (a animação não chegou a mostrar): revela já
  if (S.revealGoal) S.revealGoal();
  $('mx-min').textContent = m.finished ? 'Encerrado' : m.minute + "'";
  $('mx-prog').style.width = (m.minute / 90 * 100) + '%';
  const tab = S.matchTab || 'campo';
  const goal = newEvents.find(e => e.type === 'goal');
  // Placar, artilheiros e narração do gol: no Campo, só quando a bola entra
  const reveal = () => {
    S.revealGoal = null;
    if (!$('mx-g')) return;
    $('mx-g').textContent = `${h.goals} - ${a.goals}`;
    $('mx-sc0').textContent = scorersLine(h);
    $('mx-sc1').textContent = scorersLine(a);
    const tk = $('mx-ticker');
    const tkHtml = lastBigEvent(m);
    if (tk.innerHTML !== tkHtml) { tk.innerHTML = tkHtml; tk.classList.remove('pop'); void tk.offsetWidth; tk.classList.add('pop'); }
    if (goal) { const sb = $('mx-scoreboard'); sb.classList.remove('flash'); void sb.offsetWidth; sb.classList.add('flash'); }
  };
  if (goal && tab === 'campo' && S.anim && !m.finished) {
    S.revealGoal = reveal;
    // enquanto a bola não entra, o letreiro narra a jogada
    const tk = $('mx-ticker');
    if (tk) tk.innerHTML = lastBigEvent(m, true);
  } else reveal();
  // barra de posse
  const tot = h.stats.poss + a.stats.poss;
  const ph = tot ? Math.round(h.stats.poss / tot * 100) : 50;
  if ($('mx-mom')) { $('mx-mom').style.width = ph + '%'; $('mx-mh').textContent = ph + '%'; $('mx-ma').textContent = (100 - ph) + '%'; }
  if ($('mx-press')) $('mx-press').innerHTML = pressureSVG(m);
  // cartões, trocas e lesões aparecem rapidinho sobre o campo
  const pop = newEvents.find(e => ['yellow', 'red', 'sub', 'injury'].includes(e.type));
  if (pop) pitchPop(pop.text);
  if (tab === 'campo') {
    // Energia de cada jogador
    for (const t of m.teams) for (const f of t.onField) {
      const el = document.querySelector(`.pl[data-pid="${f.id}"] .en`);
      if (!el) continue;
      const fit = S.game.players[f.id].fitness;
      el.textContent = 'E:' + Math.round(fit);
      el.className = 'en ' + (fit < 50 ? 'low' : fit < 70 ? 'mid' : '');
    }
    // Movimento de bola e jogadores (ver pitch-anim.js)
    if (S.anim) S.anim.onMinute(newEvents, S.animMs || S.minuteMs);
  } else {
    $('mx-body').innerHTML = tab === 'lances' ? feedHTML(S, m) : bigPressure(m) + statsHTML(m) + shotsBlock(m) + ratingsHTML(S, m) + othersHTML(S, m);
  }
  return true;
}

// Modal de tática durante o jogo
export function matchTacticsModal(S) {
  const uc = S.game.clubs.find(c => c.id === S.game.userClubId);
  return `<h2>Tática na partida</h2>${tacticChips(uc, 'match')}
  <p class="tiny muted">As mudanças valem a partir do próximo minuto.</p>`;
}

// Resumo depois da rodada
export function roundSummaryScreen(S) {
  const g = S.game;
  const r = S.lastRound;
  return `
  <h1>${r.fixtures.length ? 'Resultados' : 'Semana ' + (r.roundIndex + 1)}</h1>
  ${r.title ? `<p class="muted small">${esc(r.title)}</p>` : ''}
  <div class="list">${r.fixtures.map(f => resultRow(g, f)).join('') || '<div class="item muted small">Sua liga não jogou nesta semana.</div>'}</div>
  ${r.seasonEnd ? `<div class="card hl center">
    <div style="font-size:40px">🏆</div>
    <h2>${esc(r.seasonEnd.champion)} é campeão de ${r.seasonEnd.season}!</h2>
    <p>Você terminou em <b>${r.seasonEnd.userPos}º lugar</b>.</p>
    <p class="small muted">Artilheiro: ${esc(r.seasonEnd.topScorer)}</p>
    ${r.seasonEnd.userCups && r.seasonEnd.userCups.length ? `<p><b>Seus títulos de copa: ${r.seasonEnd.userCups.map(esc).join(', ')} 🏆</b></p>` : ''}
  </div>
  ${nationalsBlock(r.seasonEnd.nationals)}
  ${reviewBlock(r.seasonEnd.career)}
  ${ceremonyBlock(g, r.seasonEnd.awards)}
  <div>
    <p class="small muted">Contratos, aposentadorias e revelações da base estão nas mensagens.</p>
  </div>` : ''}
  <button class="btn-main mt" data-act="go" data-to="hub">Continuar ›</button>
  <button class="btn-block mt" data-act="go" data-to="table">Ver tabela</button>`;
}

// ---------- Disputa de pênaltis (cobrança a cobrança) ----------
// last: resultado da cobrança que acabou de acontecer (para animar)
export function penModal(S, last) {
  const m = S.prep.userMatch, sh = m.pso;
  const me = m.teams.findIndex(t => t.club.id === S.game.userClubId);
  const row = i => {
    const t = m.teams[i], k = sh.marks[i];
    const dots = Array.from({ length: Math.max(5, k.length) }, (_, j) =>
      `<i class="${j < k.length ? (k[j] ? 'ok' : 'no') : ''}"></i>`).join('');
    return `<div class="pk-row ${i === me ? 'me' : ''}">${badge(t.club)}<b class="ellipsis">${esc(t.club.short)}</b><span class="pk-dots">${dots}</span><b class="pk-n">${sh.score[i]}</b></div>`;
  };
  const LBL = ['Esquerda', 'Meio', 'Direita'];
  let prompt;
  if (sh.done) {
    const won = sh.score[me] > sh.score[1 - me];
    prompt = `<div class="pk-msg ${won ? 'good' : 'bad'}">${won ? '🏆 Classificado nos pênaltis!' : '😞 Eliminado nos pênaltis.'}</div>
      <button class="btn-main mt" data-act="penEnd">Continuar ${icon('chevron', 20)}</button>`;
  } else {
    const side = sh.next, mine = side === me;
    const who = mine ? m.penKicker(side).name : m.penKicker(side).name + ' (' + m.teams[side].club.short + ')';
    prompt = `<p class="center small">${mine ? `⚽ Cobrança de <b>${esc(who)}</b>. Onde chutar?` : `🧤 Vai bater: <b>${esc(who)}</b>. Para onde o goleiro pula?`}</p>
      <div class="pk-btns">${LBL.map((l, d) => `<button data-act="penPick" data-v="${d}">${l}</button>`).join('')}</div>`;
  }
  const res = last ? `<div class="pk-res ${last.ok ? 'good' : 'bad'}">${last.ok ? 'GOL!' : last.how === 'save' ? 'DEFENDEU!' : 'PRA FORA!'}</div>` : '';
  return `<h2 class="center" style="margin-top:0">Pênaltis</h2>
    ${row(0)}${row(1)}
    <div class="pk" id="pk" ${last ? `data-dir="${last.dir}" data-dive="${last.dive}" data-how="${last.how}"` : ''}>
      <div class="pk-goal"><i class="pk-net"></i></div>
      <div class="pk-gk"></div><div class="pk-ball"></div>${res}
    </div>
    ${last ? `<p class="center tiny muted">${esc(last.name)} ${last.ok ? 'converte' : last.how === 'save' ? `para em ${esc(last.keeper)}` : 'manda para fora'}.</p>` : ''}
    <div id="pk-prompt" ${last ? 'class="pk-wait"' : ''}>${prompt}</div>`;
}
