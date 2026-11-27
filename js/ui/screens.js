// =============================================================
// screens.js — as telas do jogo (cada função devolve HTML)
// =============================================================
import { esc, money } from '../util.js';
import { overall, effectiveRating, POS_NAMES, POSITIONS } from '../engine/ratings.js';
import { FORMATIONS, STYLES, MARKING, FOCUS, clubPlayers, teamStrength, isAvailable } from '../engine/tactics.js';
import { standings, userClub, userLeague, userFixture, leagueRounds, nextUserMatch } from '../engine/season.js';
import { cupStatus, groupTable, cupScorers, qualZones } from '../engine/cups.js';
import { windowOpen, askingPrice, wageAsk, clubById } from '../engine/market.js';
import { weeklyWages } from '../engine/finance.js';
import { TRAIN_FOCUS, TRAIN_INTENSITY } from '../engine/evolution.js';
import { squadRoles, moodOf, ROLE_LABEL } from '../engine/morale.js';
import { isPlayerMode } from '../engine/player-career.js';
import { challengeBanner } from './modes-screen.js';
import { eventView } from '../engine/events.js';
import { KINDS, takerScore, captainOf, leadership, pickTaker } from '../engine/setpieces.js';

// Capitão e cobradores (tela Tática)
function setPiecesCard(g, uc) {
  const xi = uc.lineup.filter(Boolean);
  const squad = Object.values(g.players).filter(p => p.clubId === uc.id && !p.loan).sort((a, b) => overall(b) - overall(a));
  const cap = captainOf(g, uc);
  const opt = (sel, list, val) => list.map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.name)} · ${val(p)}</option>`).join('');
  return `<h3>Capitão e bolas paradas</h3>
  <div class="card">
    <label>©️ Capitão <span class="tiny muted">(liderança: ${cap ? Math.round(leadership(cap) * 100) : 0})</span></label>
    <select data-change="captain"><option value="">Automático (${cap ? esc(cap.name) : '—'})</option>${opt(uc.captain, squad, p => 'liderança ' + Math.round(leadership(p) * 100))}</select>
    ${KINDS.map(([k, e, l]) => { const auto = pickTaker(g, uc, k, xi); return `<label>${e} ${l}</label>
    <select data-change="taker" data-kind="${k}"><option value="">Automático (${auto ? esc(auto.name) : '—'})</option>${opt(uc.takers && uc.takers[k], squad.filter(p => p.pos !== 'GOL'), p => Math.round(takerScore(p, k)))}</select>`; }).join('')}
    <p class="tiny muted mt" style="margin-bottom:0">O capitão segura a moral do grupo na semana e puxa a reação quando o time perde no 2º tempo. Tirar a faixa de alguém deixa ele chateado. Cobradores: o número é a nota para aquela cobrança; se o escolhido não estiver em campo, bate o melhor disponível.</p>
  </div>`;
}

// Evento aleatório esperando a sua decisão
export function eventCard(g) {
  const v = eventView(g);
  if (!v) return '';
  return `<div class="card event-card"><div class="row" style="gap:10px"><span style="font-size:32px">${v.emoji}</span><div class="grow"><div class="tiny muted">EVENTO · DECIDA AGORA</div><b>${esc(v.title)}</b></div></div>
    <p class="small" style="margin:8px 0">${esc(v.text)}</p>
    ${v.opts.map(([k, l, d]) => `<button class="talk-opt" data-act="eventAnswer" data-v="${k}"><span class="grow" style="text-align:left"><b>${l}</b><span class="small muted" style="display:block">${esc(d)}</span></span></button>`).join('')}</div>`;
}
import { derbyName, h2h } from '../engine/derbies.js';
import { pcCard } from './player-career-screen.js';
import { sponsorOffers, occupancy, EXPANSIONS, expansionCost, MAX_STADIUM } from '../engine/stadium.js';
import { SLOTS, slotInfo } from '../storage.js';
import { badge, posTag, ovrTag, bar, playerRow, statusTags, ring, radar } from './ui.js';
import { icon } from './icons.js';
import { careerScreen, careerCard } from './career-screen.js';
import { zoneSizes } from '../engine/divisions.js';
import { INDIVIDUAL_TRAIN } from '../engine/evolution.js';
import { scoutView } from './market-ui.js';
import { layout } from './match-screen.js';
import { ovrClass } from '../engine/ratings.js';

const club = (g, id) => clubById(g, id);
const stars = rep => '★'.repeat(Math.max(1, Math.min(5, Math.round((rep - 25) / 15)))).padEnd(5, '☆');
const CONT_ORDER = ['América do Sul', 'Europa', 'América do Norte', 'Ásia', 'África', 'Oceania', 'Outros'];
const FLAG = {
  'Brasil': '🇧🇷', 'Argentina': '🇦🇷', 'México': '🇲🇽', 'Estados Unidos': '🇺🇸', 'Inglaterra': '🏴', 'Espanha': '🇪🇸',
  'Itália': '🇮🇹', 'Alemanha': '🇩🇪', 'França': '🇫🇷', 'Portugal': '🇵🇹', 'Holanda': '🇳🇱', 'Bélgica': '🇧🇪',
  'Turquia': '🇹🇷', 'Escócia': '🏴', 'Grécia': '🇬🇷', 'Rússia': '🇷🇺', 'Ucrânia': '🇺🇦', 'Áustria': '🇦🇹',
  'Suíça': '🇨🇭', 'Dinamarca': '🇩🇰', 'Noruega': '🇳🇴', 'Suécia': '🇸🇪', 'Polônia': '🇵🇱', 'Rep. Tcheca': '🇨🇿',
  'Croácia': '🇭🇷', 'Sérvia': '🇷🇸', 'Romênia': '🇷🇴', 'Japão': '🇯🇵', 'Coreia do Sul': '🇰🇷',
  'Arábia Saudita': '🇸🇦', 'Austrália': '🇦🇺'
};
export const flag = c => FLAG[c] || '🏳️';

// Lista de ligas agrupadas por continente para um <select>
function leagueOptions(leagues, selected, withAll = false) {
  const groups = {};
  for (const l of leagues) (groups[l.continent] = groups[l.continent] || []).push(l);
  const conts = Object.keys(groups).sort((a, b) => CONT_ORDER.indexOf(a) - CONT_ORDER.indexOf(b));
  return (withAll ? `<option value="ALL" ${selected === 'ALL' ? 'selected' : ''}>🌍 Todas as ligas</option>` : '') +
    conts.map(c => `<optgroup label="${esc(c)}">${groups[c].sort((a, b) => a.country.localeCompare(b.country)).map(l =>
      `<option value="${esc(l.id)}" ${l.id === selected ? 'selected' : ''}>${flag(l.country)} ${esc(l.country)} — ${esc(l.name)}</option>`).join('')}</optgroup>`).join('');
}

// ---------------------------------------------------------------
// TELA INICIAL
// ---------------------------------------------------------------
export function startScreen(S) {
  const auto = slotInfo('auto');
  const db = S.db;
  const kinds = [['world', '🌍 Mundo real'], ['fictional', '🎲 Liga fictícia'], ...(S.customDB ? [['custom', '📥 Importado']] : [])];
  return `
  <div class="splash">
    <svg class="crest" viewBox="0 0 100 112" aria-hidden="true"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset=".55" stop-color="#d79a1e"/><stop offset="1" stop-color="#ffd34d"/></linearGradient><linearGradient id="cb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c4f9c"/><stop offset="1" stop-color="#071a3c"/></linearGradient></defs>
      <path d="M50 3 L94 16 V54 C94 82 74 100 50 109 C26 100 6 82 6 54 V16 Z" fill="url(#cg)"/><path d="M50 10 L87 21 V54 C87 78 70 94 50 102 C30 94 13 78 13 54 V21 Z" fill="url(#cb)"/>
      <path d="M50 18 l3 6.5 7 .6-5.3 4.6 1.6 6.8-6.3-3.7-6.3 3.7 1.6-6.8-5.3-4.6 7-.6z" fill="#ffd34d"/>
      <circle cx="50" cy="66" r="20" fill="#f4f7fb"/><path d="M50 56 l9.5 6.9-3.6 11.1h-11.8l-3.6-11.1z" fill="#0b1f45"/><path d="M50 46v10M59.5 62.9l9-4M55.9 74l6 7.5M44.1 74l-6 7.5M40.5 62.9l-9-4" stroke="#0b1f45" stroke-width="2.2"/></svg>
    <h1><span class="logo-a">Estratégia</span><span class="logo-b">FC</span></h1>
    <div class="logo-sub">GESTÃO DE EQUIPE</div>
    <p class="muted">31 ligas · 42 copas · 15 mil jogadores reais</p>
  </div>
  ${auto ? `<button class="btn-main mb" data-act="continue" style="flex-direction:column;gap:0;min-height:68px">
      <span class="row">${icon('play', 20)} Continuar</span>
      <span style="font-size:12px;font-style:normal;font-weight:600;text-transform:none;opacity:.75">${esc(auto.label)}</span></button>` : ''}
  <div class="list stagger">
    <div class="item tap menu-item" data-act="go" data-to="chooseClub" ${db ? '' : 'style="opacity:.5;pointer-events:none"'}><span class="ic-box">${icon('bolt')}</span><div class="grow"><b>Novo jogo</b><div class="small muted">Escolha um clube em qualquer continente</div></div>${icon('chevron', 18, 'chev')}</div>
    <div class="item tap menu-item" data-act="loadMenu"><span class="ic-box">${icon('folder')}</span><div class="grow"><b>Carregar jogo</b><div class="small muted">Espaços salvos neste aparelho</div></div>${icon('chevron', 18, 'chev')}</div>
    <div class="item tap menu-item" data-act="go" data-to="challenges" ${db ? '' : 'style="opacity:.5;pointer-events:none"'}><span class="ic-box">${icon('target')}</span><div class="grow"><b>Desafios</b><div class="small muted">Missões prontas: fuga do rebaixamento, gigante em crise…</div></div>${icon('chevron', 18, 'chev')}</div>
    <div class="item tap menu-item" data-act="newPlayerGo" ${db ? '' : 'style="opacity:.5;pointer-events:none"'}><span class="ic-box">${icon('users')}</span><div class="grow"><b>Carreira de jogador</b><div class="small muted">Crie um craque de 17 anos e viva a carreira dele</div></div>${icon('chevron', 18, 'chev')}</div>
    <div class="item tap menu-item" data-act="importSave"><span class="ic-box">${icon('download')}</span><div class="grow"><b>Importar jogo de arquivo</b><div class="small muted">Backup exportado antes</div></div>${icon('chevron', 18, 'chev')}</div>
  </div>
  <div class="card mt">
    <h3 style="margin-top:0">Banco de dados para novo jogo</h3>
    <div class="chips mb">${kinds.map(([k, l]) => `<button class="chip ${S.dbKind === k ? 'on' : ''}" data-act="setDB" data-v="${k}">${l}</button>`).join('')}</div>
    ${db ? `<p><b>${esc(db.name)}</b><br><span class="small muted">${(db.leagues || [1]).length} liga(s) · ${db.clubs.length} clubes · ${Object.keys(db.players).length.toLocaleString('pt-BR')} jogadores</span></p>` : '<p class="muted">Carregando banco de dados…</p>'}
    ${db && db.fictional ? `<div class="fict">⚠️ Clubes e jogadores <b>fictícios</b> (exemplo).</div>` : ''}
    ${db && S.dbKind === 'world' ? `<p class="tiny muted">${esc(db.source || '')}</p>` : ''}
    <div class="btn-row wrap">
      <button class="btn-sm" data-act="importDB">📥 Importar JSON/CSV</button>
      <button class="btn-sm" data-act="exportDBcsv" ${db ? '' : 'disabled'}>📤 Exportar CSV</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------
// ESCOLHA DO CLUBE: continente → país/liga → clube
// ---------------------------------------------------------------
export function chooseClubScreen(S) {
  const db = S.db;
  const leagues = db.leagues && db.leagues.length ? db.leagues
    : [{ id: 'L1', name: db.name, country: 'Brasil', continent: 'América do Sul', clubIds: db.clubs.map(c => c.id) }];
  const { cont, league, q } = S.params;
  const back = league ? `data-act="go" data-to="chooseClub" data-cont="${esc(cont || '')}"` : cont ? `data-act="go" data-to="chooseClub"` : `data-act="go" data-to="start"`;
  let body = '';
  const clubRow = c => {
    const l = leagues.find(x => x.clubIds.includes(c.id));
    return `<div class="item tap" data-act="pickClub" data-id="${c.id}" style="background:linear-gradient(90deg, color-mix(in srgb, ${esc(c.colors[0])} 14%, transparent), transparent 55%)">
      ${badge(c)}
      <div class="grow"><b>${esc(c.name)}</b><div class="small muted">${l ? flag(l.country) + ' ' + esc(l.name) + ' · ' : ''}Caixa ${money(c.budget)}</div></div>
      <span class="accent small" style="letter-spacing:1px">${stars(c.rep)}</span></div>`;
  };
  if (q) {
    const term = q.toLowerCase();
    const found = db.clubs.filter(c => c.name.toLowerCase().includes(term) || (c.fullName || '').toLowerCase().includes(term)).slice(0, 40);
    body = `<div class="list stagger">${found.map(clubRow).join('') || '<div class="item muted">Nenhum clube encontrado.</div>'}</div>`;
  } else if (league) {
    const l = leagues.find(x => x.id === league);
    const cs = l.clubIds.map(id => db.clubs.find(c => c.id === id)).filter(Boolean).sort((a, b) => b.rep - a.rep);
    body = `<div class="card" style="display:flex;align-items:center;gap:12px"><span style="font-size:38px">${flag(l.country)}</span>
      <div><h2 style="margin:0">${esc(l.name)}</h2><div class="small muted">${esc(l.country)} · ${cs.length} clubes · ${l.clubIds.length <= 22 ? 'turno e returno' : 'turno único'}</div></div></div>
      <div class="list stagger">${cs.map(clubRow).join('')}</div>`;
  } else if (cont) {
    const ls = leagues.filter(l => l.continent === cont).sort((a, b) => a.country.localeCompare(b.country));
    body = `<h2>${esc(cont)}</h2><div class="list stagger">${ls.map(l => `
      <div class="item tap" data-act="go" data-to="chooseClub" data-cont="${esc(cont)}" data-league="${esc(l.id)}">
        <span style="font-size:28px">${flag(l.country)}</span>
        <div class="grow"><b>${esc(l.country)}</b><div class="small muted">${esc(l.name)} · ${l.clubIds.length} clubes</div></div>${icon('chevron', 18, 'chev')}
      </div>`).join('')}</div>`;
  } else {
    if (leagues.length === 1) return chooseClubScreen({ ...S, params: { league: leagues[0].id, cont: leagues[0].continent } });
    const conts = [...new Set(leagues.map(l => l.continent))].sort((a, b) => CONT_ORDER.indexOf(a) - CONT_ORDER.indexOf(b));
    const grad = { 'América do Sul': '#2fe07f,#ffd25a', 'América do Norte': '#4cb4ff,#ff4d6d', 'Europa': '#3b6bff,#2ee6ff', 'Ásia': '#ff4d6d,#ffb547', 'África': '#ffb547,#2fe07f', 'Oceania': '#2ee6ff,#c4ff3d' };
    body = `<div class="grid2">${conts.map((c, i) => {
      const ls = leagues.filter(l => l.continent === c);
      return `<div class="comp-card" style="flex:none;animation:enter .4s ${i * 0.05}s both;background:linear-gradient(140deg, color-mix(in srgb, ${(grad[c] || '#4cb4ff,#c4ff3d').split(',')[0]} 35%, transparent), color-mix(in srgb, ${(grad[c] || '#4cb4ff,#c4ff3d').split(',')[1]} 12%, transparent))" data-act="go" data-to="chooseClub" data-cont="${esc(c)}">
        <div style="font-size:22px">${ls.slice(0, 5).map(l => flag(l.country)).join('')}</div>
        <div class="v">${esc(c)}</div><div class="k">${ls.length} liga(s)</div></div>`;
    }).join('')}</div>`;
  }
  return `
  <div class="row between mb"><h1 style="margin:0">Escolha seu clube</h1><button class="btn-sm" ${back}>${icon('back', 16)} Voltar</button></div>
  <div class="search">${icon('search', 18)}<input id="club-q" placeholder="Buscar clube pelo nome" value="${esc(q || '')}" data-change="clubSearch"></div>
  <div class="mt">${body}</div>`;
}

// ---------------------------------------------------------------
// INÍCIO (painel do clube)
// ---------------------------------------------------------------
export function hubScreen(S) {
  const g = S.game, uc = userClub(g), ul = userLeague(g);
  // Técnico demitido: só dá para escolher um novo clube
  if (g.coach && g.coach.fired) return careerScreen(S);
  const tab = standings(g, ul.id);
  const pos = tab.findIndex(s => s.id === uc.id) + 1;
  const nm = nextUserMatch(g);
  let next = '';
  if (nm) {
    const fx = nm.f;
    const h = club(g, fx.h), a = club(g, fx.a);
    const opp = fx.h === uc.id ? a : h;
    const dn = derbyName(h, a), hh = dn ? h2h(g, opp.id) : null;
    const oppInfo = nm.kind === 'league'
      ? (g.round ? (tab.findIndex(s => s.id === opp.id) + 1) + 'º lugar, ' : '')
      : (opp.leagueId !== uc.leagueId ? flag(opp.country) + ' ' : '');
    const where = nm.neutral ? 'Campo neutro' : fx.h === uc.id ? 'Em casa' : 'Fora de casa';
    const sh = teamStrength(g, h), sa = teamStrength(g, a);
    const sharePct = Math.round(Math.pow(sh, 3) / (Math.pow(sh, 3) + Math.pow(sa, 3)) * 100);
    next = `
    <div class="match-hero" style="--h1:${esc(h.colors[0] === '#ffffff' ? h.colors[1] : h.colors[0])};--a1:${esc(a.colors[0] === '#ffffff' ? a.colors[1] : a.colors[0])}">
      <div class="mh-comp">
        <span class="lbl">${nm.kind === 'cup' ? icon('trophy', 16) : icon('calendar', 16)} ${esc(nm.name)}</span>
        <span class="tag ${nm.kind === 'cup' ? 'warn' : ''}">${esc(nm.stage)}</span>
      </div>
      <div class="mh-teams">
        <div class="mh-team">${badge(h, 'xl')}<b class="ellipsis">${esc(h.name)}</b></div>
        <div class="mh-vs">VS</div>
        <div class="mh-team">${badge(a, 'xl')}<b class="ellipsis">${esc(a.name)}</b></div>
      </div>
      ${dn ? `<div class="derby-line"><span class="tag derby">🔥 CLÁSSICO · ${esc(dn)}</span><div class="tiny muted" style="margin-top:4px">Seu retrospecto: ${hh.w}V ${hh.d}E ${hh.l}D · vale mais para a diretoria e a torcida</div></div>` : ''}
      <div class="mh-meta">
        <span>${icon('stadium', 15)} ${where}${h.stadiumName && !nm.neutral ? ' · ' + esc(h.stadiumName) : ''}</span>
        ${nm.kind === 'league' && g.round ? `<span>${icon('chart', 15)} Rival em ${oppInfo.replace(', ', '')}</span>` : oppInfo ? `<span>${oppInfo}</span>` : ''}
      </div>
      <div class="strength"><b>${sh}</b><div><div class="duel"><i style="width:${sharePct}%"></i></div><div class="tiny muted center" style="margin-top:3px">FORÇA DOS TIMES</div></div><b>${sa}</b></div>
      ${nm.kind === 'cup' ? `<p class="tiny muted center" style="position:relative">Meio de semana${userFixture(g) ? ' · o jogo da liga vem depois' : ''}${!nm.stage.startsWith('Grupo') ? ' · empate vai para os pênaltis' : ''}</p>` : ''}
      <button class="btn-main" data-act="playRound">${icon('play', 20)} Jogar partida</button>
      <button class="btn-block btn-sm mt btn-ghost" data-act="quickSim">${icon('fast', 16)} Simulação rápida (para no que importa)</button>
      ${isPlayerMode(g) ? `<p class="tiny muted center" style="position:relative;margin:8px 0 0">Você: <b>${esc(g.pc.role)}</b> · quem escala é o técnico</p>` : `<button class="btn-block btn-sm mt btn-ghost" data-act="go" data-to="tactics">${icon('tactics', 16)} Ajustar escalação</button>`}
    </div>`;
  } else {
    const leagueOver = g.round >= leagueRounds(g, ul.id);
    next = `<div class="match-hero">
      <div class="mh-comp"><span class="lbl">${icon('calendar', 16)} ${leagueOver ? 'Sua liga terminou' : 'Sem jogo nesta semana'}</span></div>
      <p class="small" style="position:relative;margin:12px 0">${leagueOver ? `Você ficou em <b class="accent">${pos}º</b>. ` : ''}Outras ligas e copas do mundo continuam.</p>
      <button class="btn-main" data-act="advanceWeek">${icon('fast', 20)} Avançar semana</button>
      ${leagueOver ? `<button class="btn-block btn-sm mt btn-ghost" data-act="advanceSeason">${icon('skip', 16)} Avançar até a próxima temporada</button>` : ''}
    </div>`;
  }
  const cups = cupStatus(g, uc.id);
  const cupsCard = cups.length ? `<div class="section-title"><h3>Suas competições</h3></div><div class="hscroll">${cups.map(({ cup, status }) =>
    `<div class="comp-card" data-act="go" data-to="table" data-tab="cups" data-cup="${esc(cup.id)}">
      <div class="k">${icon('trophy', 13)} ${cup.type === 'national' ? 'Copa nacional' : cup.type === 'world' ? 'Mundial' : 'Continental'}</div>
      <div class="v ellipsis">${esc(cup.name)}</div><div class="small ${status.includes('Campeão') ? 'accent' : status.startsWith('Elimin') ? 'bad' : 'muted'}">${esc(status)}</div></div>`).join('')}</div>` : '';
  const offers = g.inbox.filter(m => m.type === 'offer');
  const msgs = g.inbox.filter(m => m.type === 'msg').slice(0, 6);
  const last = lastResults(g, uc.id, 5);
  const c1 = uc.colors[0] === '#ffffff' ? uc.colors[1] : uc.colors[0];
  return `
  <div class="club-head" style="--club1:${esc(c1)}">
    ${badge(uc, 'lg')}
    <div class="grow">
      <div class="title ellipsis">${esc(uc.name)}</div>
      <div class="small muted" style="margin-top:4px">${flag(ul.country)} ${esc(ul.name)} · ${g.season}</div>
    </div>
    ${g.round ? `<div class="center"><div class="num" style="font-size:30px;font-style:italic;line-height:1">${pos}º</div><div class="tiny muted">${tab[pos - 1].pts} PTS</div></div>` : ''}
  </div>
  <div class="tiles">
    <div class="tile"><div class="k">${icon('coin', 13)} Caixa</div><div class="v ${uc.budget < 0 ? 'bad' : ''}" data-count="${uc.budget}" data-fmt="money">${money(uc.budget)}</div></div>
    <div class="tile"><div class="k">${icon('market', 13)} Mercado</div><div class="v ${windowOpen(g) ? 'good' : 'muted'}">${windowOpen(g) ? 'Aberto' : 'Fechado'}</div></div>
    <div class="tile"><div class="k">${icon('fire', 13)} Forma</div><div class="v"><span class="form">${last.map(r => `<i class="${r}"></i>`).join('') || '<span class="muted small">—</span>'}</span></div></div>
  </div>
  ${challengeBanner(g)}
  ${eventCard(g)}
  ${next}
  ${isPlayerMode(g) ? pcCard(S) : careerCard(S)}
  ${cupsCard}
  <div class="list"><div class="item tap menu-item" data-act="go" data-to="awards"><span class="ic-box" style="color:var(--gold);background:rgba(255,210,90,.12)">${icon('medal')}</span><div class="grow"><b>Corrida pelos prêmios</b><div class="small muted">Melhor da liga e Melhor do Mundo</div></div>${icon('chevron', 18, 'chev')}</div></div>
  ${offers.length ? `<div class="section-title"><h3>Propostas recebidas</h3><span class="tag warn">${offers.length}</span></div><div class="list stagger">${offers.map(o => offerRow(g, o)).join('')}</div>` : ''}
  <div class="section-title"><h3>Mensagens</h3></div>
  <div class="list stagger">${msgs.length ? msgs.map(m => `<div class="item small">${icon(/🏆|campeão/.test(m.text) ? 'trophy' : /⚠️/.test(m.text) ? 'bell' : /base/.test(m.text) ? 'star' : 'news', 18)}<span class="grow">${esc(m.text)}</span></div>`).join('') : '<div class="item muted small">Nenhuma mensagem.</div>'}</div>
  ${g.news.length ? `<div class="section-title"><h3>Mercado da bola</h3></div><div class="list stagger">${g.news.slice(0, 5).map(n => `<div class="item small muted">${icon('swap', 18)}<span class="grow">${esc(n.text)}</span></div>`).join('')}</div>` : ''}`;
}

function offerRow(g, o) {
  const p = g.players[o.playerId], b = club(g, o.clubId);
  if (!p || !b) return '';
  return `<div class="item">
    ${badge(b, 'sm')}
    <div class="grow small"><b>${esc(b.name)}</b> oferece <b>${money(o.fee)}</b> por <b>${esc(p.name)}</b>
      <div class="muted tiny">Valor de mercado: ${money(p.value)} · expira em ${weeksLeft(g, o)} semana(s)</div></div>
    <button class="btn-sm btn-good icon-btn" data-act="acceptOffer" data-id="${o.id}" aria-label="Aceitar">✓</button>
    <button class="btn-sm btn-bad icon-btn" data-act="rejectOffer" data-id="${o.id}" aria-label="Recusar">${icon('close', 16)}</button>
  </div>
  ${o.countered ? '' : `<div class="counter-row"><span class="tiny muted">Contraproposta:</span>${[[1.1, '+10%'], [1.25, '+25%'], [1.4, '+40%']].map(([m, l]) => `<button class="chip" data-act="counterOffer" data-id="${o.id}" data-v="${m}">${l}</button>`).join('')}</div>`}`;
}

// Propostas de compra recebidas por um jogador (da caixa de entrada)
function offersFor(g, pid) {
  return g.inbox.filter(m => m.type === 'offer' && m.playerId === pid);
}
// Semanas até a proposta expirar (a proposta vale até a semana "expires")
const weeksLeft = (g, o) => Math.max(1, o.expires - g.round + 1);
function offerTag(g, pid) {
  const os = offersFor(g, pid);
  if (!os.length) return '';
  const best = os.slice().sort((a, b) => b.fee - a.fee)[0];
  const w = weeksLeft(g, best);
  return `<span class="tag warn">📨 ${os.length > 1 ? os.length + ' propostas · ' : ''}${money(best.fee)} · expira em ${w} sem.</span>`;
}

function lastResults(g, cid, n) {
  const l = g.leagues.find(x => x.clubIds.includes(cid));
  const out = [];
  for (let r = g.round - 1; r >= 0 && out.length < n; r--) {
    const f = (l.fixtures[r] || []).find(x => (x.h === cid || x.a === cid) && x.r);
    if (!f) continue;
    const my = f.h === cid ? f.r.hg : f.r.ag, ot = f.h === cid ? f.r.ag : f.r.hg;
    out.unshift(my > ot ? 'V' : my < ot ? 'D' : 'E');
  }
  return out;
}

// ---------------------------------------------------------------
// ELENCO
// ---------------------------------------------------------------
export function squadScreen(S) {
  const g = S.game, uc = userClub(g);
  const sort = S.params.sort || 'pos';
  let ps = clubPlayers(g, uc.id);
  const order = { GOL: 0, ZAG: 1, LAT: 2, VOL: 3, MEI: 4, ATA: 5 };
  const sorters = {
    pos: (a, b) => order[a.pos] - order[b.pos] || overall(b) - overall(a),
    ovr: (a, b) => overall(b) - overall(a),
    age: (a, b) => a.age - b.age,
    value: (a, b) => b.value - a.value,
    fit: (a, b) => a.fitness - b.fitness
  };
  ps.sort(sorters[sort]);
  const lineup = new Set(uc.lineup);
  const loanedOut = Object.values(g.players).filter(p => p.loan && p.loan.from === uc.id);
  const avgOvr = Math.round(ps.reduce((s, p) => s + overall(p), 0) / (ps.length || 1));
  const avgAge = (ps.reduce((s, p) => s + p.age, 0) / (ps.length || 1)).toFixed(1);
  const withOffers = ps.filter(p => offersFor(g, p.id).length);
  return `
  <div class="row between"><h1>Elenco</h1>${isPlayerMode(g) ? '' : `<div class="row" style="gap:6px"><button class="btn-sm" data-act="go" data-to="locker">${icon('users', 15)} Vestiário</button><button class="btn-sm" data-act="go" data-to="clubdev">${icon('star', 15)} Base</button></div>`}</div>
  ${withOffers.length ? `<div class="offer-banner" data-act="go" data-to="market" data-tab="offers">${icon('bell', 18)}
    <div class="grow"><b>${withOffers.length} jogador(es) com proposta de compra</b><div class="tiny muted">Toque no jogador para aceitar ou recusar</div></div>${icon('chevron', 18, 'chev')}</div>` : ''}
  <div class="tiles">
    <div class="tile"><div class="k">${icon('users', 13)} Jogadores</div><div class="v" data-count="${ps.length}">${ps.length}</div></div>
    <div class="tile"><div class="k">${icon('star', 13)} Nota média</div><div class="v">${avgOvr} <span class="tiny muted">· ${avgAge}a</span></div></div>
    <div class="tile"><div class="k">${icon('coin', 13)} Folha/sem</div><div class="v">${money(weeklyWages(g, uc.id))}</div></div>
  </div>
  <div class="chips scroll mb">
    ${[['pos', 'Posição'], ['ovr', 'Nota'], ['age', 'Idade'], ['value', 'Valor'], ['fit', 'Energia']].map(([k, l]) =>
      `<button class="chip ${sort === k ? 'on' : ''}" data-act="go" data-to="squad" data-sort="${k}">${l}</button>`).join('')}
  </div>
  <div class="list stagger">
    ${ps.map(p => playerRow(p, {
      sub: `${lineup.has(p.id) ? '<span class="tag good">Titular</span>' : ''} <span>${money(p.value)}</span> ${offerTag(g, p.id)}`,
      right: ring(p.fitness, 38),
      extra: offersFor(g, p.id).length ? 'style="background:linear-gradient(90deg, rgba(255,181,71,.14), transparent 70%)"' : ''
    })).join('')}
  </div>
  ${loanedOut.length ? `<h3>Emprestados a outros clubes</h3><div class="list">${loanedOut.map(p => playerRow(p, { sub: 'no ' + esc(club(g, p.clubId).name) })).join('')}</div>` : ''}`;
}

// ---------------------------------------------------------------
// DETALHE DO JOGADOR (abre num modal)
// ---------------------------------------------------------------
export function playerModal(S, id) {
  const g = S.game, p = g.players[id];
  if (!p) return '<p>Jogador não encontrado.</p>';
  const uc = userClub(g);
  const pc = p.clubId ? club(g, p.clubId) : null;
  const mine = p.clubId === uc.id;
  const A = [['Finalização', 'fin'], ['Passe', 'pas'], ['Defesa', 'def'], ['Força', 'for'], ['Resistência', 'res'], ['Goleiro', 'gk']];
  let actions = '';
  if (mine) {
    const os = offersFor(g, p.id);
    actions = `
      ${os.length ? `<h3>Propostas de compra</h3><div class="list">${os.map(o => offerRow(g, o)).join('')}</div>` : ''}
      <div class="grid2 mt">
        <button data-act="toggleList" data-id="${p.id}">${icon('coin', 17)} ${p.listed ? 'Tirar da venda' : 'Pôr à venda'}</button>
        <button data-act="renew" data-id="${p.id}">${icon('edit', 17)} Renovar</button>
        ${p.loan ? '' : `<button data-act="loanOut" data-id="${p.id}">${icon('swap', 17)} Emprestar</button>`}
        ${p.loan ? '' : `<button class="btn-bad" data-act="release" data-id="${p.id}">${icon('logout', 17)} Dispensar</button>`}
      </div>`;
  } else if (!p.loan || !p.clubId) {
    const ask = askingPrice(g, p);
    const wage = wageAsk(g, p, uc);
    actions = p.clubId ? `
      <div class="card mt">
        <div class="small muted">O ${esc(pc.name)} pede cerca de <b>${money(ask)}</b>. Salário pedido: ${money(wage)}/sem.</div>
        <label>Sua proposta (R$)</label>
        <input id="offer" type="number" inputmode="numeric" step="10000" value="${ask}">
        <div class="btn-row mt">
          <button class="btn-good" data-act="negotiate" data-id="${p.id}">${icon('coin', 17)} Negociar compra</button>
          <button data-act="loanIn" data-id="${p.id}">${icon('swap', 17)} Empréstimo</button>
        </div>
        ${windowOpen(g) ? '' : '<p class="tiny warn mt">A janela de transferências está fechada.</p>'}
      </div>` : `
      <div class="card mt">
        <div class="small">Sem clube. Sem taxa de transferência.<br>Salário pedido: <b>${money(wage)}/sem</b> · Luvas: ${money(wage * 4)}</div>
        <button class="btn-good btn-block mt" data-act="negotiate" data-id="${p.id}">✍️ Negociar contrato</button>
      </div>`;
  }
  // Moral e minutos em campo (só jogadores do seu clube)
  if (mine) {
    const role = squadRoles(g, g.userClubId)[p.id] || 'reserva';
    const md = moodOf(p);
    actions += `<h3>Moral e minutos</h3>
      <div class="card"><div class="row between small"><span>Papel no elenco: <b>${ROLE_LABEL[role]}</b></span><span class="${md.k}">${md.t}</span></div>
      <div class="tiny muted mt">${p.idle ? `${p.idle} jogo(s) seguido(s) sem entrar.` : 'Jogou na última partida.'}${p.promise ? ` · Promessa: jogar nos próximos ${p.promise} jogo(s).` : ''}</div>
      <div class="grid2 mt"><button class="btn-sm" data-act="talkPlayer" data-id="${p.id}" data-v="prometer">${icon('star', 15)} Prometer minutos</button>
      <button class="btn-sm" data-act="talkPlayer" data-id="${p.id}" data-v="paciencia">${icon('shield', 15)} Pedir paciência</button></div>
      <p class="tiny muted" style="margin-bottom:0">Titulares se irritam após 2 jogos sem entrar; rodízio após 4; reservas após 8. Moral alta faz o jogador render mais.</p></div>`;
  }
  // Treino individual (só jogadores do seu clube)
  if (mine) {
    const opts = Object.entries(INDIVIDUAL_TRAIN).filter(([k]) => k !== 'gk' || p.pos === 'GOL');
    actions += `<h3>Treino individual</h3>
      <div class="chips"><button class="chip ${!p.trainFocus ? 'on' : ''}" data-act="setPTrain" data-id="${p.id}" data-v="">Automático</button>
      ${opts.map(([k, l]) => `<button class="chip ${p.trainFocus === k ? 'on' : ''}" data-act="setPTrain" data-id="${p.id}" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="tiny muted">O jogador evolui mais no atributo escolhido (75% das melhoras).${p.potential <= overall(p) ? ' <span class="warn">Ele já chegou ao potencial máximo.</span>' : ''}</p>`;
  }
  actions += `<button class="btn-sm btn-block mt" data-act="compareStart" data-id="${p.id}">${icon('swap', 15)} Comparar com outro jogador</button>`;
  // Carta do jogador: cor pelo nível (ouro 75+, prata 65+, bronze 55+)
  const ov = overall(p);
  const tier = ov >= 75 ? 'gold' : ov >= 65 ? 'silver' : ov >= 55 ? 'bronze' : 'basic';
  const radarKeys = p.pos === 'GOL' ? [['GOL', 'gk'], ['PAS', 'pas'], ['DEF', 'def'], ['FOR', 'for'], ['RES', 'res'], ['FIN', 'fin']]
    : [['FIN', 'fin'], ['PAS', 'pas'], ['DEF', 'def'], ['FOR', 'for'], ['RES', 'res']];
  const ss = p.ss && p.ss.j ? p.ss : null;
  return `
  <div class="pcard ${tier}">
    <div class="top">
      <div class="center" style="min-width:64px"><div class="big">${ov}</div><div class="posl">${p.pos}</div></div>
      <div class="grow" style="min-width:0">
        <div class="name ellipsis">${esc(p.name)}</div>
        <div class="meta">${POS_NAMES[p.pos]} · ${p.age} anos${p.nat ? ' · ' + esc(p.nat) : ''}</div>
        <div class="meta row" style="gap:6px;margin-top:6px">${pc ? badge(pc, 'sm') + ' ' + esc(pc.name) : 'Sem clube'}${p.loan ? ` <span class="small">(emprestado)</span>` : ''}</div>
      </div>
    </div>
    <div class="tags">${statusTags(p)}${p.fictional ? '<span class="tag warn">Fictício</span>' : ''}</div>
  </div>
  <div class="card">
    <div class="radar-wrap">
      ${radar(radarKeys.map(([, k]) => p.attrs[k]), radarKeys.map(([l]) => l))}
      <div>
        ${A.filter(([, k]) => k !== 'gk' || p.pos === 'GOL').map(([l, k]) => `<div class="attr" style="grid-template-columns:1fr 30px;gap:6px;margin:3px 0"><span class="tiny muted" style="text-transform:uppercase;letter-spacing:.06em">${l}</span><b class="right" style="font-size:15px">${p.attrs[k]}</b><div style="grid-column:1/-1">${bar(p.attrs[k], 99)}</div></div>`).join('')}
      </div>
    </div>
    <div class="attr" style="margin-top:10px"><span class="small">${icon('bolt', 14)} Potencial</span>${bar(p.potential, 99)}<b class="right">${mine || p.age > 23 || p.scouted ? p.potential : '?'}</b></div>
    ${p.scouted && !mine ? '<div class="tiny good">🔭 Potencial revelado pelo seu olheiro</div>' : ''}
  </div>
  <div class="kv mb">
    <div>${ring(p.fitness, 44)}<span>Energia</span></div>
    <div><b>${Math.round(p.moral)}</b><span>Moral</span></div>
    <div><b style="font-size:15px">${money(p.value)}</b><span>Valor</span></div>
    <div><b style="font-size:15px">${money(p.contract.wage)}</b><span>Salário/sem</span></div>
    <div><b>${p.contract.years}</b><span>Anos contrato</span></div>
    <div><b>${p.apps}</b><span>Jogos (carreira)</span></div>
  </div>
  ${ss ? `<h3>Temporada ${g.season}</h3><div class="kv mb">
      <div><b>${ss.j}</b><span>Jogos</span></div>
      <div><b>${ss.g}</b><span>Gols</span></div>
      <div><b>${ss.a}</b><span>Assist.</span></div>
      <div><b class="${ss.r / ss.j >= 7.2 ? 'good' : ''}">${(ss.r / ss.j).toFixed(2)}</b><span>Nota média</span></div>
      <div><b>${ss.lg}</b><span>Gols na liga</span></div>
      <div><b>${ss.cs}</b><span>Sem sofrer gol</span></div>
    </div>` : ''}
  ${p.trophies && p.trophies.length ? `<h3>Prêmios individuais</h3><div class="list">${p.trophies.slice().reverse().map(t => `<div class="item small" style="min-height:44px">${icon('medal', 18)}<span class="grow">${esc(t)}</span></div>`).join('')}</div>` : ''}
  <p class="tiny muted">${p.fictional ? 'Jogador fictício (gerado pelo jogo).' : p.realValueEUR ? `Valor real de referência (Transfermarkt, jul/2026): € ${(p.realValueEUR / 1e6).toLocaleString('pt-BR')} mi. Atributos estimados a partir dele.` : ''}
  ${p.pos !== 'GOL' ? ' Rende em outras posições: ' + POSITIONS.filter(x => x !== p.pos && x !== 'GOL').map(x => `${x} ${Math.round(overall(p, x))}`).join(' · ') : ''}</p>
  ${actions}`;
}

// ---------------------------------------------------------------
// TÁTICA E ESCALAÇÃO
// ---------------------------------------------------------------
export function tacticChips(uc, prefix = 'set') {
  return `
  <h3>Estilo de jogo</h3>
  <div class="chips">${Object.keys(STYLES).map(s => `<button class="chip ${uc.style === s ? 'on' : ''}" data-act="${prefix}Tactic" data-k="style" data-v="${s}">${s}</button>`).join('')}</div>
  <p class="small muted mb">${STYLES[uc.style].desc}</p>
  <h3>Marcação</h3>
  <div class="chips">${Object.keys(MARKING).map(s => `<button class="chip ${uc.marking === s ? 'on' : ''}" data-act="${prefix}Tactic" data-k="marking" data-v="${s}">${s}</button>`).join('')}</div>
  <p class="small muted mb">${MARKING[uc.marking].desc}</p>
  <h3>Concentrar ataques</h3>
  <div class="chips">${Object.keys(FOCUS).map(s => `<button class="chip ${uc.focus === s ? 'on' : ''}" data-act="${prefix}Tactic" data-k="focus" data-v="${s}">${s}</button>`).join('')}</div>
  <p class="small muted mb">${FOCUS[uc.focus]}</p>`;
}

export function tacticsScreen(S) {
  const g = S.game, uc = userClub(g);
  const slots = FORMATIONS[uc.formation];
  const tr = uc.training || { focus: 'Equilibrado', intensity: 'Normal' };
  return `
  <div class="row between"><h1>Tática</h1><span class="muted">Força <b>${teamStrength(g, uc)}</b></span></div>
  <h3>Formação</h3>
  <div class="chips mb">${Object.keys(FORMATIONS).map(f => `<button class="chip ${uc.formation === f ? 'on' : ''}" data-act="setFormation" data-v="${f}">${f}</button>`).join('')}</div>
  <div class="row between"><h3>Titulares · ${uc.formation}</h3><button class="btn-sm" data-act="autoLineup">✨ Automática</button></div>
  ${tacticsPitch(S)}
  <p class="tiny muted center" style="margin-top:-4px">Toque numa posição para trocar o jogador. Nota = rendimento naquela posição · ⚠️ improvisado · ⛔ indisponível</p>
  <h3>Reservas</h3>
  <div class="list">
    ${[0, 1, 2, 3, 4, 5, 6].map(i => {
      const p = g.players[uc.bench[i]];
      if (!p) return `<div class="item tap" data-act="pickBench" data-i="${i}"><span class="pos">RES</span><div class="grow muted">— vazio —</div></div>`;
      return playerRow(p, { act: 'pickBench', extra: `data-i="${i}"`, sub: `físico ${Math.round(p.fitness)}%` });
    }).join('')}
  </div>
  ${tacticChips(uc)}
  ${setPiecesCard(g, uc)}
  <h3>Treino da semana</h3>
  <div class="card">
    <label>Foco</label>
    <div class="chips">${Object.keys(TRAIN_FOCUS).map(f => `<button class="chip ${tr.focus === f ? 'on' : ''}" data-act="setTrain" data-k="focus" data-v="${f}">${f}</button>`).join('')}</div>
    <label>Intensidade</label>
    <div class="chips">${Object.keys(TRAIN_INTENSITY).map(f => `<button class="chip ${tr.intensity === f ? 'on' : ''}" data-act="setTrain" data-k="intensity" data-v="${f}">${f}</button>`).join('')}</div>
    <p class="tiny muted mt">Forte: jovens evoluem mais rápido, mas o time recupera menos o físico e há risco de lesão. Leve: recupera melhor.</p>
  </div>`;
}

// Campo com a escalação (cada vaga é um botão)
function tacticsPitch(S) {
  const g = S.game, uc = userClub(g);
  const slots = FORMATIONS[uc.formation];
  const onField = slots.map((slot, i) => ({ id: uc.lineup[i] || 'vaga' + i, slot, i }));
  const pos = layout(onField, true, true);
  const short = n => { const w = String(n).trim().split(/\s+/); const s = w.length > 1 ? w[w.length - 1] : w[0]; return s.length > 11 ? s.slice(0, 10) + '.' : s; };
  return `<div class="pitch pitch-tac">
    <div class="pitch-lines"><i class="half"></i><i class="circle"></i><i class="box top"></i><i class="box bot"></i></div>
    ${onField.map(f => {
      const xy = pos[f.id];
      const p = g.players[uc.lineup[f.i]];
      if (!p) return `<div class="pl pl-me tac-empty" style="left:${xy.x}%;top:${xy.y}%" data-act="pickSlot" data-i="${f.i}">
        <span class="shirt" style="--c1:#555;--c2:#333">${f.slot}</span><span class="nm">+ escolher</span></div>`;
      const r = Math.round(effectiveRating(p, f.slot));
      const off = p.pos !== f.slot;
      const bad = !isAvailable(p, uc.id);
      return `<div class="pl pl-me" style="left:${xy.x}%;top:${xy.y}%" data-act="pickSlot" data-i="${f.i}">
        <span class="shirt" style="--c1:${esc(uc.colors[0])};--c2:${esc(uc.colors[1])}">${f.slot}</span>
        <span class="nm">${bad ? '⛔' : off ? '⚠️' : ''}${esc(short(p.name))}</span>
        <span class="en"><b class="${ovrClass(r)}" style="padding:0 3px;border-radius:3px">${r}</b> E:${Math.round(p.fitness)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// Lista para escolher quem entra numa vaga
export function pickPlayerModal(S, slot, title) {
  const g = S.game, uc = userClub(g);
  const ps = clubPlayers(g, uc.id).sort((a, b) => effectiveRating(b, slot) - effectiveRating(a, slot));
  const where = id => uc.lineup.includes(id) ? '<span class="tag good">titular</span>' : uc.bench.includes(id) ? '<span class="tag">reserva</span>' : '';
  return `<h2>${title}</h2><p class="small muted">Ordenado pelo rendimento na posição ${slot}.</p>
  <div class="list">${ps.map(p => playerRow(p, { act: 'choosePlayer', ovr: Math.round(effectiveRating(p, slot)), sub: `${where(p.id)} físico ${Math.round(p.fitness)}%` })).join('')}</div>`;
}

// ---------------------------------------------------------------
// TABELA, RODADAS E ARTILHARIA (de qualquer liga)
// ---------------------------------------------------------------
export function tableScreen(S) {
  const g = S.game;
  const tab = S.params.tab || 'class';
  const lid = S.params.league || userLeague(g).id;
  const L = g.leagues.find(l => l.id === lid);
  const P = `data-league="${esc(lid)}"`;
  const tabs = `<div class="tabs">
    <button class="${tab === 'class' ? 'on' : ''}" data-act="go" data-to="table" data-tab="class" ${P}>Tabela</button>
    <button class="${tab === 'rounds' ? 'on' : ''}" data-act="go" data-to="table" data-tab="rounds" ${P}>Rodadas</button>
    <button class="${tab === 'scorers' ? 'on' : ''}" data-act="go" data-to="table" data-tab="scorers" ${P}>Artilh.</button>
    <button class="${tab === 'cups' ? 'on' : ''}" data-act="go" data-to="table" data-tab="cups" ${P}>Copas</button>
  </div>`;
  if (tab === 'cups') return `<h1>Temporada ${g.season}</h1>${tabs}` + cupsView(S);
  const head = `<h1>Temporada ${g.season}</h1>
  <select class="mb" data-change="tableLeague">${leagueOptions(g.leagues, lid)}</select>${tabs}`;
  if (tab === 'rounds') return head + roundsView(S, L);
  if (tab === 'scorers') return head + scorersView(S, L);
  const st = standings(g, lid);
  const n = st.length;
  // Faixas: acesso/rebaixamento reais quando a liga tem 2ª divisão
  const zs = zoneSizes(g, lid);
  const z = Math.max(2, Math.round(n / 5));
  const zTop = zs ? (zs.promote || z) : z, zBot = zs ? zs.relegate : z;
  const mine = g.history.filter(h => h.champions && h.champions[lid]);
  const qz = zs && zs.promote ? null : qualZones(g, lid);   // vagas nas copas (1ª divisão)
  const zl = (col, txt) => `<div><span class="zl" style="background:${col}"></span>${txt}</div>`;
  const legend = qz && qz.t1
    ? zl('var(--accent2)', `1º ao ${qz.t1.n}º: ${esc(qz.t1.name)}`)
      + (qz.t2 ? zl('var(--warn)', `${qz.t1.n + 1}º ao ${qz.t1.n + qz.t2.n}º: ${esc(qz.t2.name)}`) : '')
      + (qz.nat ? zl('var(--good)', `1º ao ${qz.nat.n}º: direto nas oitavas da ${esc(qz.nat.name)}`) : '')
      + (zBot ? zl('var(--bad)', `${zBot} últimos ${zs ? 'caem para a 2ª divisão' : ''}`) : '')
      + '<div style="margin-top:2px">As vagas valem para a próxima temporada.</div>'
    : '';
  return head + `
  <div class="card" style="padding:6px 8px">
  <table>
    <tr><th>#</th><th style="text-align:left">Clube</th><th>P</th><th>J</th><th>V</th><th>SG</th><th>Últ.</th></tr>
    ${st.map((s, i) => {
      const c = club(g, s.id);
      const zone = qz && qz.t1 ? (i < qz.t1.n ? 'q1' : qz.t2 && i < qz.t1.n + qz.t2.n ? 'q2' : '') : i < zTop ? 'g4' : '';
      const cls = [s.id === g.userClubId ? 'me' : '', zone, zBot && i >= n - zBot ? 'z4' : ''].join(' ');
      return `<tr class="${cls}"><td>${i + 1}</td>
        <td class="team"><span class="row" style="gap:6px">${badge(c, 'sm')}<span class="ellipsis" style="max-width:120px">${esc(c.name)}</span></span></td>
        <td><b>${s.pts}</b>${s.pen ? `<span class="tiny bad" title="Punição"> −${s.pen}</span>` : ""}</td><td>${s.j}</td><td>${s.v}</td><td>${s.gp - s.gc}</td>
        <td><span class="form">${s.form.slice(-3).map(r => `<i class="${r}"></i>`).join('')}</span></td></tr>`;
    }).join('')}
  </table></div>
  <div class="tiny muted" style="margin:8px 2px;line-height:1.7">${legend || (zs && zs.promote) ? legend || `<span class="good">▌</span> ${zTop} sobem para a 1ª divisão`
    : `<span class="good">▌</span> ${zTop} primeiros &nbsp; ${zBot ? `<span class="bad">▌</span> ${zBot} ${zs ? 'caem para a 2ª divisão' : 'últimos'}` : ''}`}</div>
  ${mine.length ? `<h3>Campeões anteriores</h3><div class="list">${mine.map(h => `<div class="item small">🏆 ${h.season}: <b>${esc(h.champions[lid])}</b>${h.leagueId === lid ? ` · você: ${h.userPos}º` : ''}</div>`).join('')}</div>` : ''}`;
}

// ---------- Copas: grupos, mata-mata, artilharia e campeões ----------
function cupsView(S) {
  const g = S.game;
  const cups = g.cups || [];
  if (!cups.length) return '<p class="muted">As copas começam na próxima temporada.</p>';
  // Só as copas do seu clube: as que ele disputa e as que pode disputar
  // (copa nacional do seu país, continentais do seu continente e o Mundial)
  const ul = userLeague(g);
  const playing = cups.filter(c => c.teams.includes(g.userClubId));
  const possible = cups.filter(c => !playing.includes(c) && (
    (c.type === 'national' && c.leagueId === ul.id) ||
    (c.type === 'continental' && (c.conts || []).includes(ul.continent)) ||
    c.type === 'world'));
  const list = [...playing, ...possible];
  if (!list.length) return '<p class="muted">Nenhuma copa disponível para o seu clube nesta temporada.</p>';
  const cid = S.params.cup && list.some(c => c.id === S.params.cup) ? S.params.cup : list[0].id;
  const cup = list.find(c => c.id === cid);
  const kind = c => c.type === 'national' ? 'Copa nacional' : c.type === 'world' ? 'Mundial' : 'Continental';
  const chip = (c, on) => `<div class="comp-card cup-pick ${c.id === cup.id ? 'on' : ''}" data-act="go" data-to="table" data-tab="cups" data-cup="${esc(c.id)}">
      <div class="k">${icon('trophy', 12)} ${kind(c)}</div><div class="v ellipsis">${esc(c.name)}</div>
      <div class="tiny ${on ? 'good' : 'muted'}">${on ? '● Disputando' : 'Pode disputar se se classificar'}</div></div>`;
  let html = `<div class="hscroll">${playing.map(c => chip(c, true)).join('')}${possible.map(c => chip(c, false)).join('')}</div>`;
  if (!playing.includes(cup)) html += `<p class="small muted">Seu clube não está nesta edição. ${cup.type === 'world' ? 'Vença a copa continental para disputar o Mundial.' : cup.type === 'national' ? '' : 'As vagas vêm da classificação da liga na temporada anterior.'}</p>`;
  if (cup.champion) {
    const c = club(g, cup.champion);
    html += `<div class="card hl center">${badge(c, 'lg')}<h2 style="margin-top:6px">🏆 ${esc(c.name)}</h2><p class="small muted">Campeão da ${esc(cup.name)} ${g.season}</p></div>`;
  }
  // Mata-mata (fases mais recentes primeiro)
  for (const r of cup.rounds.slice().reverse()) {
    html += `<h3>${esc(r.name)} <span class="muted small" style="text-transform:none">· semana ${r.week + 1}</span></h3>
      <div class="list">${r.ties.map(f => resultRow(g, f)).join('')}</div>`;
  }
  if (cup.byes && cup.byes.length && cup.rounds.length) {
    const nm = cup.byes.slice(0, 12).map(id => esc(club(g, id).name)).join(', ');
    html += `<p class="small muted">${cup.type === 'continental' ? 'Já classificados para os grupos' : 'Entram direto numa fase seguinte'}: ${nm}${cup.byes.length > 12 ? ` e mais ${cup.byes.length - 12}` : ''}.</p>`;
  }
  // Grupos
  if (cup.groups.length) {
    html += `<h3>Fase de grupos</h3>`;
    for (const grp of cup.groups) {
      const t = groupTable(grp);
      html += `<div class="card" style="padding:6px 8px"><b>Grupo ${grp.name}</b><table>
        <tr><th>#</th><th style="text-align:left">Clube</th><th>P</th><th>J</th><th>SG</th></tr>
        ${t.map((s, i) => { const c = club(g, s.id); return `<tr class="${s.id === g.userClubId ? 'me' : ''} ${i < 2 ? 'g4' : ''}"><td>${i + 1}</td>
          <td class="team"><span class="row" style="gap:6px">${badge(c, 'sm')}<span class="ellipsis" style="max-width:130px">${esc(c.name)}</span> <span class="tiny">${flag(c.country)}</span></span></td>
          <td><b>${s.pts}</b></td><td>${s.j}</td><td>${s.gp - s.gc}</td></tr>`; }).join('')}
      </table></div>`;
    }
    const myGroup = cup.groups.find(x => x.clubIds.includes(g.userClubId));
    if (myGroup) html += `<h3>Jogos do seu grupo</h3><div class="list">${myGroup.fixtures.flat().map(f => resultRow(g, f)).join('')}</div>`;
  }
  if (!cup.rounds.length && !cup.groups.length) html += '<p class="muted">Ainda sem jogos.</p>';
  const sc = cupScorers(g, cup).slice(0, 10);
  if (sc.length) html += `<h3>Artilharia da copa</h3><div class="list">${sc.map(({ p, n }) => playerRow(p, {
    sub: p.clubId ? esc(club(g, p.clubId).short) : '', right: `<b style="font-size:18px;width:34px" class="center">${n}</b>` })).join('')}</div>`;
  const past = g.history.filter(h => h.cupChampions && h.cupChampions[cup.id]);
  if (past.length) html += `<h3>Campeões anteriores</h3><div class="list">${past.map(h => `<div class="item small">🏆 ${h.season}: <b>${esc(h.cupChampions[cup.id].club)}</b></div>`).join('')}</div>`;
  return html;
}

function roundsView(S, L) {
  const g = S.game;
  const total = L.fixtures.length;
  const r = Math.max(0, Math.min(total - 1, S.params.round != null ? Number(S.params.round) : Math.max(0, Math.min(g.round, total) - 1)));
  const games = L.fixtures[r] || [];
  const P = `data-league="${esc(L.id)}"`;
  return `
  <div class="row between mb">
    <button class="btn-sm" data-act="go" data-to="table" data-tab="rounds" ${P} data-round="${r - 1}" ${r <= 0 ? 'disabled' : ''}>‹ Anterior</button>
    <b>Rodada ${r + 1} de ${total}</b>
    <button class="btn-sm" data-act="go" data-to="table" data-tab="rounds" ${P} data-round="${r + 1}" ${r >= total - 1 ? 'disabled' : ''}>Próxima ›</button>
  </div>
  <div class="list">${games.map(f => resultRow(g, f)).join('')}</div>`;
}

export function resultRow(g, f) {
  const h = club(g, f.h), a = club(g, f.a);
  const me = f.h === g.userClubId || f.a === g.userClubId;
  const sc = f.r ? `<b style="font-size:17px">${f.r.hg} x ${f.r.ag}</b>${f.r.pens ? `<div class="tiny muted">pên. ${f.r.pens[0]}x${f.r.pens[1]}</div>` : ''}` : '<span class="muted">x</span>';
  const scorers = f.r && f.r.scorers ? `<div class="tiny muted" style="grid-column:1/4">${f.r.scorers[0].map(s => `${esc(s.name)} ${s.min}'`).join(', ')}${f.r.scorers[1].length ? ' | ' + f.r.scorers[1].map(s => `${esc(s.name)} ${s.min}'`).join(', ') : ''}</div>` : '';
  return `<div class="item ${me ? 'me' : ''}" style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px">
    <span class="row ellipsis" style="justify-content:flex-end">${esc(h.short)} ${badge(h, 'sm')}</span>
    <span class="center" style="min-width:60px">${sc}</span>
    <span class="row ellipsis">${badge(a, 'sm')} ${esc(a.short)}</span>
    ${scorers}
  </div>`;
}

function scorersView(S, L) {
  const g = S.game;
  const ids = new Set(L.clubIds);
  const top = Object.values(g.players).filter(p => p.seasonGoals > 0 && ids.has(p.clubId)).sort((a, b) => b.seasonGoals - a.seasonGoals).slice(0, 25);
  if (!top.length) return '<p class="muted">Nenhum gol marcado ainda.</p>';
  return `<div class="list">${top.map(p => playerRow(p, {
    sub: p.clubId ? esc(club(g, p.clubId).short) : '', right: `<b style="font-size:18px;width:34px" class="center">${p.seasonGoals}</b>`
  }).replace('class="item tap"', `class="item tap ${p.clubId === g.userClubId ? 'me' : ''}"`)).join('')}</div>`;
}

// ---------------------------------------------------------------
// MERCADO
// ---------------------------------------------------------------
export function marketScreen(S) {
  const g = S.game, uc = userClub(g);
  const tab = S.params.tab || 'search';
  const f = S.marketFilter;
  const tabs = `<div class="tabs">
    <button class="${tab === 'search' ? 'on' : ''}" data-act="go" data-to="market" data-tab="search">Buscar</button>
    <button class="${tab === 'offers' ? 'on' : ''}" data-act="go" data-to="market" data-tab="offers">Propostas</button>
    <button class="${tab === 'mine' ? 'on' : ''}" data-act="go" data-to="market" data-tab="mine">À venda</button>
    <button class="${tab === 'scout' ? 'on' : ''}" data-act="go" data-to="market" data-tab="scout">Olheiros</button>
  </div>`;
  const head = `<div class="row between"><h1>Mercado</h1><span class="tag ${windowOpen(g) ? 'good' : ''}">${windowOpen(g) ? 'Janela aberta' : 'Janela fechada'}</span></div>
  <p class="small muted">Caixa: <b>${money(uc.budget)}</b> · Janelas: semanas 1–5 e 19–23.</p>${tabs}`;

  if (tab === 'offers') {
    const offers = g.inbox.filter(m => m.type === 'offer');
    return head + (offers.length ? `<div class="list">${offers.map(o => offerRow(g, o)).join('')}</div>` : '<p class="muted">Nenhuma proposta. Coloque jogadores à venda para atrair interessados.</p>');
  }
  if (tab === 'scout') return head + scoutView(S);
  if (tab === 'mine') {
    const ls = clubPlayers(g, uc.id).filter(p => p.listed);
    return head + (ls.length ? `<div class="list">${ls.map(p => playerRow(p, { sub: money(p.value) })).join('')}</div>` : '<p class="muted">Nenhum jogador à venda. Abra um jogador no Elenco e toque em "Pôr à venda".</p>');
  }
  const leagueClubs = f.league && f.league !== 'ALL' ? new Set((g.leagues.find(l => l.id === f.league) || { clubIds: [] }).clubIds) : null;
  let ps = Object.values(g.players).filter(p => p.clubId !== uc.id && !(p.loan && p.clubId));
  if (leagueClubs && !f.free) ps = ps.filter(p => leagueClubs.has(p.clubId));
  if (f.pos !== 'ALL') ps = ps.filter(p => p.pos === f.pos);
  if (f.free) ps = ps.filter(p => !p.clubId);
  if (f.maxPrice) ps = ps.filter(p => askingPrice(g, p) <= f.maxPrice);
  if (f.young) ps = ps.filter(p => p.age <= 21);
  if (f.q) { const q = f.q.toLowerCase(); ps = ps.filter(p => p.name.toLowerCase().includes(q)); }
  ps.sort((a, b) => overall(b) - overall(a));
  const total = ps.length;
  ps = ps.slice(0, 60);
  const priceOpts = [[0, 'Qualquer preço'], [1e6, 'até R$ 1 mi'], [5e6, 'até R$ 5 mi'], [15e6, 'até R$ 15 mi'], [40e6, 'até R$ 40 mi'], [100e6, 'até R$ 100 mi']];
  return head + `
  <div class="search">${icon('search', 18)}<input id="mk-q" placeholder="Buscar jogador pelo nome" value="${esc(f.q || '')}" data-change="marketSearch"></div>
  <select class="mt" data-change="mkLeague">${leagueOptions(g.leagues, f.league || 'ALL', true)}</select>
  <div class="chips scroll mt">${['ALL', ...POSITIONS].map(p => `<button class="chip ${f.pos === p ? 'on' : ''}" data-act="mkFilter" data-k="pos" data-v="${p}">${p === 'ALL' ? 'Todos' : p}</button>`).join('')}</div>
  <div class="row mt mb">
    <select data-change="mkPrice" style="flex:1">${priceOpts.map(([v, l]) => `<option value="${v}" ${f.maxPrice == v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="chip ${f.free ? 'on' : ''}" data-act="mkFilter" data-k="free" data-v="${!f.free}">Livres</button>
    <button class="chip ${f.young ? 'on' : ''}" data-act="mkFilter" data-k="young" data-v="${!f.young}">Jovens</button>
  </div>
  <p class="tiny muted">${total.toLocaleString('pt-BR')} jogadores${total > 60 ? ' (mostrando os 60 melhores)' : ''}</p>
  <div class="list">${ps.map(p => playerRow(p, {
    sub: `${p.clubId ? esc(club(g, p.clubId).short) : '<span class="tag good">livre</span>'} · ${p.clubId ? money(askingPrice(g, p)) : 'sem taxa'}`
  })).join('') || '<div class="item muted">Nenhum jogador encontrado.</div>'}</div>`;
}

// ---------------------------------------------------------------
// FINANÇAS
// ---------------------------------------------------------------
export function financeScreen(S) {
  const g = S.game, uc = userClub(g);
  const wages = weeklyWages(g, uc.id);
  const ledger = g.ledger.slice(0, 40);
  return `
  <div class="row between"><h1>Finanças</h1><button class="btn-sm" data-act="go" data-to="more">‹ Mais</button></div>
  <div class="card hl center"><div class="tiny muted">CAIXA ATUAL</div><div style="font-size:28px;font-weight:800" class="${uc.budget < 0 ? 'bad' : ''}">${money(uc.budget)}</div></div>
  <div class="grid2 mb">
    <div class="card" style="margin:0"><div class="tiny muted">SALÁRIOS / SEMANA</div><b class="bad">-${money(wages)}</b></div>
    <div class="card" style="margin:0"><div class="tiny muted">PATROCÍNIO / SEMANA</div><b class="good">+${money(uc.deal ? uc.deal.base : uc.sponsor)}</b></div>
    <div class="card" style="margin:0"><div class="tiny muted">ESTÁDIO</div>${uc.stadiumName ? esc(uc.stadiumName) + '<br>' : ''}${uc.stadium.toLocaleString('pt-BR')} lugares</div>
    <div class="card" style="margin:0"><div class="tiny muted">TORCIDA</div>${uc.fans.toLocaleString('pt-BR')}</div>
  </div>
  <div class="card">
    <h3>Preço do ingresso</h3>
    <div class="row between">
      <button data-act="ticket" data-d="-5">−5</button>
      <b style="font-size:22px">R$ ${uc.ticketPrice}</b>
      <button data-act="ticket" data-d="5">+5</button>
    </div>
    <p class="tiny muted mt">Ingresso caro dá mais dinheiro por torcedor, mas o estádio enche menos. Time bem colocado atrai mais público.</p>
  </div>
  ${sponsorCard(g, uc)}
  ${stadiumCard(g, uc)}
  <h3>Extrato</h3>
  <div class="list">${ledger.length ? ledger.map(l => `<div class="item small"><span class="grow">${esc(l.label)}<div class="tiny muted">Semana ${l.round + 1}/${l.season}</div></span><b class="${l.value < 0 ? 'bad' : 'good'}">${l.value < 0 ? '' : '+'}${money(l.value)}</b></div>`).join('') : '<div class="item muted small">Sem movimentações ainda.</div>'}</div>`;
}

function sponsorCard(g, uc) {
  if (uc.deal) {
    const d = uc.deal;
    return `<h3>Patrocinador</h3><div class="card"><div class="row between"><b>${icon('coin', 16)} ${esc(d.name)}</b><span class="tag good">até o fim de ${d.season}</span></div>
      <div class="small mt">Fixo: <b>${money(d.base)}</b>/semana${d.win ? ` · Vitória: <b>+${money(d.win)}</b>` : ''}${d.top ? ` · G${d.topN}: <b>+${money(d.top)}</b>` : ''}</div></div>`;
  }
  return `<h3>Escolha o patrocinador da temporada</h3>
  <p class="tiny muted">O contrato vale até o fim da temporada. Sem escolha, o clube recebe ${money(uc.sponsor)}/semana.</p>
  <div class="list">${sponsorOffers(g, uc).map(o => `<div class="item" style="display:block">
    <div class="row between"><b>${esc(o.name)}</b><button class="btn-sm" data-act="signSponsor" data-v="${o.id}">Assinar</button></div>
    <div class="small">Fixo <b>${money(o.base)}</b>/sem${o.win ? ` · vitória <b>+${money(o.win)}</b>` : ''}${o.top ? ` · G${o.topN} <b>+${money(o.top)}</b>` : ''}</div>
    <div class="tiny muted">${esc(o.desc)}</div></div>`).join('')}</div>`;
}

function stadiumCard(g, uc) {
  const occ = occupancy(uc);
  const b = uc.build;
  return `<h3>Estádio</h3><div class="card">
    <div class="row between"><b>${icon('stadium', 16)} ${esc(uc.stadiumName || 'Estádio do ' + uc.name)}</b><b>${uc.stadium.toLocaleString('pt-BR')} lugares</b></div>
    <div class="attr mt"><span class="small">Ocupação média</span>${bar(Math.round((occ || 0) * 100), 100)}<b class="right">${occ == null ? '—' : Math.round(occ * 100) + '%'}</b></div>
    <p class="tiny muted">${occ == null ? 'Jogue em casa para ver a ocupação.' : occ > 0.93 ? '🔥 O estádio vive lotado: ampliar deve dar lucro.' : occ < 0.7 ? 'Sobram lugares: ampliar agora não compensa. Baixe o ingresso ou ganhe mais jogos para atrair a torcida.' : 'Ocupação boa. Ampliar compensa se a torcida continuar crescendo.'}</p>
    ${b ? `<div class="attr"><span class="small">🏗️ Obra (+${b.seats.toLocaleString('pt-BR')})</span>${bar(Math.round((b.total - b.weeksLeft) / b.total * 100), 100)}<b class="right" style="white-space:nowrap">${b.weeksLeft}s</b></div>`
      : `<div class="list">${EXPANSIONS.map((e, i) => `<div class="item small"><span class="grow"><b>${e.label}</b> · +${e.seats.toLocaleString('pt-BR')} lugares<div class="tiny muted">${money(expansionCost(uc, e))} · ${e.weeks} semanas de obra</div></span>
        <button class="btn-sm" data-act="expandStadium" data-v="${i}" ${uc.stadium + e.seats > MAX_STADIUM ? 'disabled' : ''}>Construir</button></div>`).join('')}</div>`}
  </div>`;
}

// ---------------------------------------------------------------
// MAIS (salvar, carregar, banco de dados)
// ---------------------------------------------------------------
export function moreScreen(S) {
  const g = S.game;
  return `
  <h1>Mais</h1>
  ${(() => {
    const it = (act, ic, t, sub, extra = '', color = '') => `<div class="item tap menu-item" data-act="${act}" ${extra}><span class="ic-box" ${color}>${icon(ic)}</span><div class="grow"><b>${t}</b>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>${icon('chevron', 18, 'chev')}</div>`;
    return `<div class="list stagger">
      ${it('go', 'whistle', 'Carreira do técnico', 'Metas, diretoria, propostas e troféus', 'data-to="career"')}
      ${it('go', 'medal', 'Prêmios', 'Melhor da liga e Melhor do Mundo', 'data-to="awards"', 'style="color:var(--gold);background:rgba(255,210,90,.12)"')}
      ${it('go', 'globe', 'Seleções e Copa do Mundo', 'Ranking, convocações, Copa, Euro e Copa América', 'data-to="nations"', 'style="color:var(--accent2);background:rgba(46,230,255,.12)"')}
      ${it('go', 'news', 'Notícias', 'Manchetes, entrevistas e mercado da bola', 'data-to="news"')}
      ${it('go', 'star', 'Conquistas', 'Medalhas da sua carreira', 'data-to="achievements"', 'style="color:var(--gold);background:rgba(255,210,90,.12)"')}
      ${isPlayerMode(g) ? '' : it('go', 'chart', 'Ranking de técnicos', 'Sua posição no mundo e compartilhar', 'data-to="ranking"')}
      ${it('go', 'trophy', 'Histórico e recordes', 'Hall da fama, artilheiros e goleadas', 'data-to="records"')}
      ${isPlayerMode(g) ? '' : it('go', 'coin', 'Finanças', 'Caixa, ingressos e extrato', 'data-to="finance"')}
      ${it('go', 'palette', 'Aparência e som', 'Tema, sons e notificações', 'data-to="settings"')}
    </div>
    <h3>Jogo salvo</h3>
    <div class="list stagger">
      ${it('saveMenu', 'save', 'Salvar jogo', '3 espaços + salvamento automático')}
      ${it('loadMenu', 'folder', 'Carregar jogo', '')}
      ${it('exportSave', 'upload', 'Exportar jogo', 'Backup em arquivo')}
    </div>
    <h3>Banco de dados</h3>
    <div class="list stagger">
      ${it('exportDBjson', 'download', 'Exportar banco (JSON)', 'Para editar e importar num jogo novo')}
      ${it('exportDBcsvGame', 'chart', 'Exportar jogadores (CSV)', 'Abre no Excel')}
    </div>
    <div class="list">${it('quit', 'logout', 'Voltar ao menu inicial', 'O jogo fica salvo', '', 'style="color:var(--bad);background:rgba(255,77,109,.12)"')}</div>`;
  })()}
  <div class="card small muted">
    <b>Sobre os dados:</b> ${esc(g.dbName || '')}.<br>${esc(g.dbSource || '')}
    <br>Nomes de clubes e atletas podem ter restrições de uso de imagem e marca: este jogo é para uso pessoal. Escudos não são usados (os círculos têm só as cores).
  </div>`;
}

export function slotsModal(mode) {
  return `<h2>${mode === 'save' ? 'Salvar jogo' : 'Carregar jogo'}</h2>
  <div class="list">${SLOTS.map(s => {
    const info = slotInfo(s);
    if (mode === 'save' && s === 'auto') return '';
    return `<div class="item ${info || mode === 'save' ? 'tap' : ''}" ${info || mode === 'save' ? `data-act="${mode}Slot" data-slot="${s}"` : ''}>
      <span>${s === 'auto' ? '🔄' : '💾'}</span>
      <div class="grow"><b>${s === 'auto' ? 'Automático' : 'Espaço ' + s}</b>
      <div class="small muted">${info ? esc(info.label) + ' · ' + new Date(info.savedAt).toLocaleString('pt-BR') : 'vazio'}</div></div>
    </div>`;
  }).join('')}</div>
  ${mode === 'save' ? '<p class="tiny muted">O jogo também é salvo automaticamente depois de cada rodada.</p>' : ''}`;
}
