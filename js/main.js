// =============================================================
// main.js — liga tudo: estado do jogo, navegação e ações dos botões
// =============================================================
import { generateDatabase } from './data/generator.js';
import { loadWorld } from './data/world.js';
import { importJSON, importCSV, exportJSON, exportCSV } from './data/importer.js';
import { createGame, userClub, userLeague, prepareRound, finishRound, nextUserMatch } from './engine/season.js';
import { FORMATIONS, autoLineup } from './engine/tactics.js';
import { overall, marketValue } from './engine/ratings.js';
import { buyPlayer, loanIn, loanOut, renewContract, releasePlayer, acceptOffer, rejectOffer } from './engine/market.js';
import { saveGame, loadGame, downloadFile, pickFile, migrate, saveCustomDB, loadCustomDB } from './storage.js';
import { clamp, money } from './util.js';
import * as UI from './ui/ui.js';
import * as SC from './ui/screens.js';
import { matchScreen, patchMatch, fieldSignature, matchTacticsModal, roundSummaryScreen, pauseLabel, talkModal } from './ui/match-screen.js';
import { awardsScreen } from './ui/awards-screen.js';
import { PitchAnimator } from './ui/pitch-anim.js';
import { icon } from './ui/icons.js';
import { careerScreen } from './ui/career-screen.js';
import { nationsScreen, squadModal } from './ui/nations-screen.js';
import { negotiationModal, updateNegotiation, compareModal } from './ui/market-ui.js';
import { negotiate, askingPrice, wageAsk } from './engine/market.js';
import { startScouting, stopScouting } from './engine/scouting.js';

import * as Sound from './ui/sound.js';
import { applyTheme } from './ui/theme.js';
import { settingsScreen } from './ui/settings-screen.js';

// Preferências de tema e som
function loadSettings() {
  let s = { theme: 'club', sfx: true, crowd: true, volume: 0.7 };
  try { s = { ...s, ...JSON.parse(localStorage.getItem('brasfoot_settings') || '{}') }; } catch { /* padrão */ }
  Sound.loadSoundSettings({ sfx: s.sfx, crowd: s.crowd, volume: s.volume });
  return s;
}
function saveSettings() {
  try { localStorage.setItem('brasfoot_settings', JSON.stringify(S.settings)); } catch { /* sem problema */ }
  Sound.loadSoundSettings({ sfx: S.settings.sfx, crowd: S.settings.crowd, volume: S.settings.volume });
}
// Tema: cores do clube do usuário (ou o padrão verde-limão)
function updateTheme() {
  const uc = S.game && S.settings.theme !== 'default' ? S.game.clubs.find(c => c.id === S.game.userClubId) : null;
  applyTheme(uc);
}

// Sai do modo comparação
function endCompare() { S.compareA = null; document.getElementById('compare-bar')?.remove(); }
import { takeJob, searchJobs } from './engine/career.js';
import * as NC from './engine/national-coach.js';

// ---------- Estado da aplicação ----------
const S = {
  game: null,          // jogo em andamento
  db: null,            // banco usado no "Novo jogo"
  dbKind: 'world',     // 'world' | 'fictional' | 'custom'
  worldDB: null, customDB: null,
  screen: 'start',
  params: {},
  prep: null,          // semana em andamento (partidas)
  matchRunning: false, matchSpeed: 0, matchVerbose: false, matchTab: 'campo', subOut: null,
  lastRound: null,
  pick: null,          // vaga sendo escolhida na tática
  marketFilter: { pos: 'ALL', free: false, young: false, maxPrice: 0, q: '', league: 'ALL' },
  settings: loadSettings()   // tema e som (guardados no aparelho)
};

// ---------- Desenho das telas ----------
const SCREENS = {
  start: SC.startScreen, chooseClub: SC.chooseClubScreen, hub: SC.hubScreen,
  squad: SC.squadScreen, tactics: SC.tacticsScreen, table: SC.tableScreen,
  market: SC.marketScreen, finance: SC.financeScreen, more: SC.moreScreen,
  match: matchScreen, roundSummary: roundSummaryScreen, awards: awardsScreen, career: careerScreen, nations: nationsScreen, settings: settingsScreen
};

// Pergunta o nome do técnico ao começar um jogo novo (devolve null se cancelar)
function askCoachName(club) {
  let last = '';
  try { last = localStorage.getItem('brasfoot_coach_name') || ''; } catch { /* */ }
  return new Promise(resolve => {
    UI.openModal(`<div class="center" style="margin-top:6px">
      <div class="avatar" style="margin:0 auto 12px">${icon('whistle', 34)}</div>
      <h2>Sua carreira começa no ${club.name.replace(/</g, '&lt;')}</h2>
      <p class="small muted">Como você quer ser chamado?</p>
      <input id="coach-name" class="name-input" maxlength="30" placeholder="Seu nome de técnico" value="${last.replace(/"/g, '&quot;')}">
      <p class="tiny warn mt">O salvamento automático atual será substituído.</p>
      <div class="btn-row mt"><button id="cn-no">Cancelar</button><button id="cn-yes" class="btn-good">Começar</button></div></div>`);
    const input = document.getElementById('coach-name');
    setTimeout(() => input.focus(), 350);
    const ok = () => { const v = input.value.trim() || 'Técnico'; UI.closeModal(); resolve(v); };
    document.getElementById('cn-yes').onclick = ok;
    input.onkeydown = e => { if (e.key === 'Enter') ok(); };
    document.getElementById('cn-no').onclick = () => { UI.closeModal(); resolve(null); };
  });
}
const NAV = [
  ['hub', 'home', 'Início'], ['squad', 'squad', 'Elenco'], ['tactics', 'tactics', 'Tática'],
  ['table', 'trophy', 'Tabela'], ['market', 'market', 'Mercado'], ['more', 'menu', 'Mais']
];
const NO_NAV = ['start', 'chooseClub', 'match', 'roundSummary'];

let lastRendered = '';
function render(keepScroll = false) {
  const app = document.getElementById('app');
  const y = window.scrollY;
  app.innerHTML = SCREENS[S.screen](S);
  // animação de entrada só quando muda de tela (não a cada atualização)
  const key = S.screen + JSON.stringify(S.params);
  app.classList.toggle('enter', key !== lastRendered && S.screen !== 'match');
  lastRendered = key;
  const hideNav = NO_NAV.includes(S.screen);
  app.classList.toggle('no-nav', hideNav);
  const nav = document.getElementById('nav');
  nav.classList.toggle('hidden', hideNav);
  nav.innerHTML = `<div class="inner">${NAV.map(([k, ic, l]) =>
    `<button class="${S.screen === k || (k === 'more' && (S.screen === 'finance' || S.screen === 'awards' || S.screen === 'nations' || S.screen === 'settings')) || (k === 'hub' && S.screen === 'career') ? 'on' : ''}" data-act="go" data-to="${k}">${icon(ic, 23)}${l}</button>`).join('')}</div>`;
  UI.animateCounts(app, money);
  updateTheme();
  if (keepScroll) window.scrollTo(0, y);
  // a tela da partida foi redesenhada: o animador se liga aos novos elementos
  if (S.screen === 'match' && S.anim) S.anim.attach();
}

function go(screen, params = {}) {
  S.screen = screen;
  S.params = params;
  render();
  window.scrollTo(0, 0);
}

function showPlayer(id) { UI.openModal(SC.playerModal(S, id)); }

function result(r, reopenId) {
  UI.toast(r.msg, 3200);
  if (r.ok) autosave();
  render(true);
  if (reopenId && S.game.players[reopenId]) showPlayer(reopenId);
}

function autosave() {
  if (S.game) saveGame(S.game, 'auto').then(ok => { if (!ok) UI.toast('⚠️ Não foi possível salvar automaticamente.'); });
}

// "Ocupado": mostra aviso enquanto algo pesado roda
async function busy(msg, fn) {
  UI.toast(msg, 60000);
  await new Promise(r => setTimeout(r, 30)); // deixa a tela atualizar
  try { return await fn(); } finally { document.getElementById('toast').classList.remove('show'); }
}

// ---------- Banco de dados para novo jogo ----------
async function selectDB(kind) {
  S.dbKind = kind;
  if (kind === 'fictional') S.db = generateDatabase();
  else if (kind === 'custom') S.db = S.customDB;
  else {
    if (!S.worldDB) {
      S.db = null; render();
      try { S.worldDB = await loadWorld(); }
      catch (e) { UI.toast('Erro ao carregar o mundo real: ' + e.message, 5000); return selectDB('fictional'); }
    }
    S.db = S.worldDB;
  }
  if (S.screen === 'start') render();
}

// ---------- Partida ao vivo ----------
let timer = null;
let lastSig = '';
const SPEEDS = [300, 120, 40]; // milissegundos por minuto de jogo (≈27s, 11s, 4s por partida)

// Em lances de perigo o relógio "segura" um pouco (1x e 2x) para dar
// tempo de ver a jogada no campo: passes, chute, defesa, gol.
const HOLD = [1900, 900, 0];
const HOLD_GOAL = [4200, 3000, 2200]; // gol: tempo para a jogada, a comemoração e o replay
let holdTimer = null;

function startMatchLoop() {
  stopMatchLoop();
  S.matchRunning = true;
  S.minuteMs = SPEEDS[S.matchSpeed];
  setPauseLabel();
  Sound.crowdStart(); // murmúrio da torcida enquanto o jogo corre
  timer = setInterval(tick, SPEEDS[S.matchSpeed]);
}
function stopMatchLoop() {
  clearInterval(timer); timer = null;
  clearTimeout(holdTimer); holdTimer = null;
  S.matchRunning = false; setPauseLabel();
  Sound.crowdStop();
}
function holdClock(ms) {
  clearInterval(timer); timer = null;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    if (S.matchRunning && S.prep) timer = setInterval(tick, SPEEDS[S.matchSpeed]);
  }, ms);
}
function setPauseLabel() {
  const b = document.getElementById('mx-pause');
  if (b) { b.innerHTML = pauseLabel(S.matchRunning); b.classList.toggle('primary', !S.matchRunning); }
}

function tick() {
  const m = S.prep.userMatch;
  const evs = m.step();
  // Ao vivo, só os jogos da mesma competição (os que aparecem na tela);
  // o resto do mundo é simulado de uma vez no fim da partida
  if (!S.prep.live) S.prep.live = S.prep.matches.filter(x => x !== m && x.leagueId === m.leagueId);
  for (const x of S.prep.live) x.step();
  // Sons do minuto (no Campo, chute/gol/defesa tocam junto com a animação)
  Sound.playMinute(evs, { animated: !!S.anim && (S.matchTab || 'campo') === 'campo' });
  if (m.attackSide >= 0 && Math.random() < 0.35) Sound.crowdSwell();
  // Pausa automática no intervalo e quando um jogador seu se machuca
  const myIdx = m.teams.findIndex(t => t.club.id === S.game.userClubId);
  const half = evs.some(e => e.type === 'half');
  const hurt = evs.some(e => e.type === 'injury' && e.side === myIdx);
  if (half || hurt) {
    stopMatchLoop();
    if (half) setTimeout(() => UI.openModal(talkModal(S, 'half')), 400); // conversa no intervalo
    else UI.toast('Jogador machucado! Toque nele no campo para trocar.');
  }
  if (m.finished) {
    stopMatchLoop();
    S.subOut = null;
    for (const x of S.prep.matches) x.runToEnd();
    return render(true);
  }
  // Lance de perigo: tempo extra para a animação
  const big = evs.some(e => e.type === 'goal' || e.type === 'save' || e.type === 'chance');
  const isGoal = evs.some(e => e.type === 'goal');
  const extra = !S.matchRunning ? 0 : isGoal ? HOLD_GOAL[S.matchSpeed] : big ? HOLD[S.matchSpeed] : 0;
  // a animação do gol usa o tempo sem contar o replay (que roda por cima)
  S.animMs = SPEEDS[S.matchSpeed] + (isGoal ? Math.max(extra - 2200, 900) : extra);
  if (extra) holdClock(extra);
  // Mudou quem está em campo (expulsão, troca da IA)? redesenha tudo
  const sig = fieldSignature(m);
  if (sig !== lastSig) {
    lastSig = sig; render(true);
    if (S.anim && (S.matchTab || 'campo') === 'campo') S.anim.onMinute(evs, S.animMs);
    return;
  }
  patchMatch(S, evs);
}

function playRound() {
  S.prep = prepareRound(S.game);
  // Fase de copa sem jogo do usuário: simula direto e passa para a liga
  while (S.prep.phase === 'cup' && !S.prep.userMatch) {
    finishRound(S.game, S.prep);
    S.prep = prepareRound(S.game);
  }
  if (S.prep.warnings.length) UI.toast(S.prep.warnings.join(' '), 4000);
  if (!S.prep.userMatch) return advanceWeek();
  S.subOut = null;
  S.matchTab = 'campo';
  S.anim = new PitchAnimator(S);
  go('match');
  lastSig = fieldSignature(S.prep.userMatch);
  // Preleção antes do apito inicial (o jogo começa depois da escolha)
  setPauseLabel();
  UI.openModal(talkModal(S, 'pre'));
}

function endMatch() {
  const roundIndex = S.game.round;
  const m = S.prep.userMatch;
  let fixtures, title;
  if (S.prep.phase === 'cup') {
    // só os jogos da mesma copa
    fixtures = S.prep.fixtures.filter((f, i) => S.prep.matches[i].leagueId === m.leagueId);
    title = `${m.cupName} · ${m.stage}`;
  } else {
    const ul = userLeague(S.game);
    fixtures = ul.fixtures[roundIndex] || [];
    title = `${ul.name} · Rodada ${roundIndex + 1}`;
  }
  if (S.anim) { S.anim.destroy(); S.anim = null; }
  Sound.crowdStop();
  const out = finishRound(S.game, S.prep);
  S.lastRound = { roundIndex, fixtures, title, seasonEnd: out.seasonEnd };
  S.prep = null;
  autosave();
  go('roundSummary');
}

// Semana sem jogo do usuário: simula a fase de copa (se houver) e a liga
function advanceWeek(quiet = false) {
  let prep = S.prep || prepareRound(S.game);
  while (prep.phase === 'cup') { finishRound(S.game, prep); prep = prepareRound(S.game); }
  const roundIndex = S.game.round;
  const out = finishRound(S.game, prep);
  S.prep = null;
  if (out.seasonEnd) {
    autosave();
    S.lastRound = { roundIndex, fixtures: [], seasonEnd: out.seasonEnd };
    go('roundSummary');
    return true;
  }
  if (!quiet) { autosave(); UI.toast(`Semana ${roundIndex + 1} concluída.`); render(true); }
  return false;
}

// ---------- Ações (cada botão tem data-act="nome") ----------
const ACTIONS = {
  closeModal: () => UI.closeModal(),
  go: d => {
    UI.closeModal();
    const params = {};
    for (const k of ['tab', 'round', 'sort', 'cont', 'league', 'cup', 'view', 'season', 't']) if (d[k] != null && d[k] !== '') params[k] = d[k];
    if (d.to === 'market' && !params.tab) params.tab = S.params.tab;
    go(d.to, params);
  },

  // Início
  setDB: d => selectDB(d.v),
  continue: async () => {
    const g = await busy('Carregando jogo…', () => loadGame('auto'));
    if (!g) return UI.toast('Nenhum jogo salvo.');
    S.game = g; go('hub');
  },
  pickClub: async d => {
    const c = S.db.clubs.find(x => x.id === d.id);
    const name = await askCoachName(c);
    if (name == null) return;
    try { localStorage.setItem('brasfoot_coach_name', name); } catch { /* sem problema */ }
    S.game = await busy('Montando o mundo…', () => createGame(S.db, c.id, name));
    autosave();
    go('hub');
  },
  playRound: () => {
    if (S.game.coach && S.game.coach.fired) return UI.toast('Você está sem clube. Escolha uma proposta.');
    playRound();
  },

  // Seleções
  nationSquad: d => UI.openModal(squadModal(S, d.id)),

  // Aparência e som
  setSetting: d => {
    S.settings[d.k] = d.v === 'true' ? true : d.v === 'false' ? false : d.v;
    saveSettings();
    if (d.k === 'crowd' && !S.settings.crowd) Sound.crowdStop();
    render(true);
    if (d.k === 'theme') UI.toast(S.settings.theme === 'club' ? '🎨 Tema nas cores do seu clube!' : 'Tema padrão aplicado.');
  },
  testSound: d => { Sound.unlock(); ({ whistle: () => Sound.whistle(2), goal: Sound.goal, ooh: Sound.ooh })[d.v](); },
  // botão de som na partida (liga/desliga tudo)
  toggleSound: () => {
    const on = !(S.settings.sfx || S.settings.crowd);
    S.settings.sfx = on; S.settings.crowd = on; saveSettings();
    if (on) { Sound.unlock(); if (S.matchRunning) Sound.crowdStart(); } else Sound.crowdStop();
    const b = document.getElementById('mx-snd'); if (b) b.innerHTML = icon(on ? 'sound' : 'mute', 20);
    UI.toast(on ? '🔊 Som ligado' : '🔇 Som desligado');
  },

  // Carreira do técnico
  acceptJob: async d => {
    const c = S.game.clubs.find(x => x.id === d.id);
    const fired = S.game.coach.fired;
    if (!await UI.confirmBox(`Assumir o <b>${c.name}</b>?${fired ? '' : '<br><span class="small warn">Você deixa o clube atual agora.</span>'}`, 'Assumir')) return;
    const r = takeJob(S.game, d.id);
    UI.toast(r.msg, 3500);
    autosave();
    go('hub');
  },
  rejectJob: d => { S.game.coach.offers = S.game.coach.offers.filter(o => o.id !== d.id); autosave(); render(true); },
  // Seleção
  acceptNation: async () => {
    const c = S.game.coach;
    if (!await UI.confirmBox(`Assumir a seleção <b>${c.natOffer.nat}</b>?<br><span class="small muted">Você continua no seu clube e acumula os dois cargos.</span>${c.nation ? `<br><span class="small warn">Você deixa a seleção ${c.nation.nat}.</span>` : ''}`, 'Assumir')) return;
    const r = NC.acceptNation(S.game);
    Sound.success(); UI.toast('🧢 ' + r.msg, 3500); autosave(); go('nations', { view: 'minha' });
  },
  rejectNation: () => { S.game.coach.natOffer = null; autosave(); render(true); },
  leaveNation: async () => {
    if (!await UI.confirmBox(`Deixar o cargo de técnico da seleção <b>${S.game.coach.nation.nat}</b>?`, 'Deixar')) return;
    NC.leaveNation(S.game, 'Saiu'); autosave(); UI.toast('Você deixou a seleção.'); go('career');
  },
  natToggle: d => { const r = NC.natToggle(S.game, d.id); UI.toast(r.msg); autosave(); render(true); },
  natAuto: () => { NC.natAuto(S.game); UI.toast('Convocação automática (os melhores do país).'); autosave(); render(true); },
  natFormation: d => { NC.natFormation(S.game, d.v); autosave(); render(true); },
  searchJobs: () => {
    if (!searchJobs(S.game)) return UI.toast('Você já procurou nesta semana. Avance uma semana para novas propostas.');
    UI.toast('Novas propostas chegaram!'); autosave(); render(true);
  },
  advanceWeek: () => busy('Simulando a semana…', () => advanceWeek()),
  advanceSeason: () => busy('Simulando até o fim da temporada…', () => {
    S.prep = null;
    // semana após semana até virar a temporada (para se você tiver jogo de copa)
    for (;;) {
      if (nextUserMatch(S.game)) { autosave(); UI.toast('Você tem um jogo de copa!'); render(true); break; }
      if (advanceWeek(true)) break;
    }
  }),

  // Jogador
  player: d => {
    // modo comparação: o segundo jogador tocado abre a comparação
    if (S.compareA && S.compareA !== d.id) {
      const a = S.compareA; endCompare();
      return UI.openModal(compareModal(S, a, d.id));
    }
    showPlayer(d.id);
  },
  compareStart: d => {
    S.compareA = d.id;
    UI.closeModal();
    document.getElementById('compare-bar')?.remove();
    const bar = document.createElement('div');
    bar.id = 'compare-bar'; bar.className = 'compare-bar';
    bar.innerHTML = `${icon('swap', 16)} <span>Comparando <b>${S.game.players[d.id].name}</b>: toque em outro jogador (Elenco, Mercado, Tabela…)</span><button class="btn-sm" data-act="compareCancel">Cancelar</button>`;
    document.body.appendChild(bar);
  },
  compareCancel: () => endCompare(),

  // Negociação
  negotiate: d => {
    const p = S.game.players[d.id], uc = userClub(S.game);
    S.nego = { id: d.id, fee: p.clubId ? askingPrice(S.game, p) : 0, wage: wageAsk(S.game, p, uc), years: p.age >= 30 ? 2 : 3 };
    UI.openModal(negotiationModal(S, d.id, S.nego));
  },
  negoYears: d => { S.nego.years = Number(d.v); S.nego.msg = null; UI.updateModal(negotiationModal(S, d.id, S.nego)); },
  negoSend: d => {
    const p = S.game.players[d.id];
    const r = negotiate(S.game, p, S.nego.fee, S.nego.wage, S.nego.years);
    if (r.status === 'accepted') { UI.closeModal(); Sound.success(); UI.toast('✍️ ' + r.msg, 3500); autosave(); render(true); return; }
    if (r.status === 'counter') { S.nego.fee = r.counterFee; S.nego.wage = r.counterWage; }
    S.nego.msg = r.msg; S.nego.ok = false; S.nego.tries = r.triesLeft;
    UI.updateModal(negotiationModal(S, d.id, S.nego));
  },

  // Treino individual
  setPTrain: d => { const p = S.game.players[d.id]; p.trainFocus = d.v || null; autosave(); UI.updateModal(SC.playerModal(S, d.id)); },

  // Olheiros
  scoutForm: d => { S.scoutForm[d.k] = d.v; render(true); },
  scoutStart: () => {
    const f = S.scoutForm;
    const r = startScouting(S.game, { region: f.region, pos: f.pos, profile: f.profile, weeks: Number(f.weeks) });
    UI.toast('🔭 ' + r.msg + ' Os relatórios chegam a cada semana.', 3500); autosave(); render(true);
  },
  scoutStop: () => { stopScouting(S.game); UI.toast('Missão do olheiro encerrada.'); autosave(); render(true); },
  toggleList: d => { const p = S.game.players[d.id]; p.listed = !p.listed; result({ ok: true, msg: p.listed ? `${p.name} está à venda.` : `${p.name} saiu da lista de venda.` }, d.id); },
  renew: async d => {
    const p = S.game.players[d.id];
    if (!await UI.confirmBox(`Renovar com ${p.name} por 3 temporadas? Ele deve pedir um aumento de salário.`)) return showPlayer(d.id);
    result(renewContract(S.game, p), d.id);
  },
  loanOut: async d => {
    const p = S.game.players[d.id];
    if (!await UI.confirmBox(`Emprestar ${p.name} até o fim da temporada?`)) return showPlayer(d.id);
    result(loanOut(S.game, p));
  },
  release: async d => {
    const p = S.game.players[d.id];
    if (!await UI.confirmBox(`Dispensar ${p.name}? Você paga uma multa de ${money(p.contract.wage * 8 * Math.max(1, p.contract.years))}.`, 'Dispensar')) return showPlayer(d.id);
    result(releasePlayer(S.game, p));
  },
  buy: d => {
    const p = S.game.players[d.id];
    const input = document.getElementById('offer');
    const offer = input ? Number(input.value) || 0 : 0;
    const r = buyPlayer(S.game, p, offer);
    result(r, d.id);
    if (r.counter) { const i = document.getElementById('offer'); if (i) i.value = r.counter; }
  },
  loanIn: d => result(loanIn(S.game, S.game.players[d.id]), d.id),
  acceptOffer: d => { UI.closeModal(); result(acceptOffer(S.game, d.id)); },
  rejectOffer: d => { UI.closeModal(); rejectOffer(S.game, d.id); UI.toast('Proposta recusada.'); autosave(); render(true); },
  editPlayer: d => UI.openModal(SC.editPlayerModal(S, d.id)),
  savePlayerEdit: d => {
    const p = S.game.players[d.id];
    const v = k => document.getElementById('ed-' + k).value;
    p.name = v('name').trim().slice(0, 40) || p.name;
    p.pos = v('pos');
    p.age = clamp(Math.round(Number(v('age')) || p.age), 15, 45);
    for (const k of ['fin', 'pas', 'def', 'for', 'res', 'gk']) p.attrs[k] = clamp(Math.round(Number(v(k)) || p.attrs[k]), 1, 99);
    p.potential = Math.max(overall(p), clamp(Math.round(Number(v('potential')) || p.potential), 1, 99));
    p.value = marketValue(p);
    p.fictional = false;
    result({ ok: true, msg: 'Jogador atualizado.' }, d.id);
  },

  // Tática
  setFormation: d => { const uc = userClub(S.game); uc.formation = d.v; autoLineup(S.game, uc); render(true); },
  setTactic: d => { userClub(S.game)[d.k] = d.v; render(true); },
  autoLineup: () => { autoLineup(S.game, userClub(S.game)); UI.toast('Escalação automática feita.'); render(true); },
  setTrain: d => { const uc = userClub(S.game); uc.training = uc.training || {}; uc.training[d.k] = d.v; render(true); },
  pickSlot: d => {
    const uc = userClub(S.game);
    const slot = FORMATIONS[uc.formation][d.i];
    S.pick = { kind: 'lineup', i: Number(d.i) };
    UI.openModal(SC.pickPlayerModal(S, slot, `Escolher ${slot} (titular)`));
  },
  pickBench: d => {
    S.pick = { kind: 'bench', i: Number(d.i) };
    UI.openModal(SC.pickPlayerModal(S, 'MEI', `Escolher reserva ${Number(d.i) + 1}`));
  },
  choosePlayer: d => {
    const uc = userClub(S.game);
    const id = d.id, { kind, i } = S.pick;
    const L = uc.lineup, B = uc.bench;
    const target = kind === 'lineup' ? L : B;
    const prev = target[i] || null;
    const inL = L.indexOf(id), inB = B.indexOf(id);
    if (inL >= 0) L[inL] = prev; else if (inB >= 0) B[inB] = prev;
    target[i] = id;
    uc.bench = B.filter(Boolean);
    UI.closeModal();
    render(true);
  },

  // Mercado
  mkFilter: d => {
    const f = S.marketFilter;
    if (d.k === 'pos') f.pos = d.v; else f[d.k] = d.v === 'true';
    render(true);
  },

  // Finanças
  ticket: d => { const uc = userClub(S.game); uc.ticketPrice = clamp(uc.ticketPrice + Number(d.d), 5, 500); render(true); },

  // Partida
  matchPause: () => { if (S.matchRunning) stopMatchLoop(); else startMatchLoop(); },
  matchSpeed: () => { S.matchSpeed = (S.matchSpeed + 1) % 3; if (S.matchRunning) startMatchLoop(); render(true); },
  matchSkip: () => { stopMatchLoop(); S.subOut = null; for (const x of S.prep.matches) x.runToEnd(); render(); },
  matchTab: d => { S.matchTab = d.v; render(true); },
  matchTactics: () => { stopMatchLoop(); UI.openModal(matchTacticsModal(S)); },
  matchTactic: d => { userClub(S.game)[d.k] = d.v; S.prep.userMatch.dirty = true; UI.updateModal(matchTacticsModal(S)); },
  pitchPick: d => {
    if (S.prep.userMatch.finished) return;
    stopMatchLoop();
    S.subOut = S.subOut === d.id ? null : d.id;
    render(true);
  },
  benchInfo: d => { const p = S.game.players[d.id]; UI.toast(`${p.name} · ${p.pos} · nota ${overall(p)} · físico ${Math.round(p.fitness)}%`); },
  subIn: d => {
    const ok = S.prep.userMatch.userSub(S.subOut, d.id);
    S.subOut = null;
    UI.toast(ok ? 'Substituição feita.' : 'Não foi possível trocar.');
    lastSig = fieldSignature(S.prep.userMatch);
    render(true);
  },
  endMatch: () => endMatch(),
  // Preleção / conversa no intervalo
  teamTalk: d => {
    const m = S.prep && S.prep.userMatch;
    if (!m) return;
    const side = m.teams.findIndex(t => t.club.id === S.game.userClubId);
    const r = m.talk(side, d.v, d.when);
    UI.closeModal();
    UI.toast(`${r.mood === 'good' ? '👍' : r.mood === 'bad' ? '👎' : '🤝'} ${r.text}`, 3500);
    if (d.when === 'pre') startMatchLoop();
    else render(true); // segue pausado: dá para fazer trocas antes do 2º tempo
  },
  skipTalk: d => { UI.closeModal(); if (d.when === 'pre') startMatchLoop(); },

  // Salvar / carregar
  saveMenu: () => UI.openModal(SC.slotsModal('save')),
  loadMenu: () => UI.openModal(SC.slotsModal('load')),
  saveSlot: async d => { UI.closeModal(); UI.toast(await saveGame(S.game, d.slot) ? 'Jogo salvo!' : 'Erro ao salvar.'); },
  loadSlot: async d => {
    UI.closeModal();
    const g = await busy('Carregando jogo…', () => loadGame(d.slot));
    if (!g) return UI.toast('Não foi possível carregar.');
    S.game = g; go('hub'); UI.toast('Jogo carregado.');
  },
  exportSave: () => {
    const uc = userClub(S.game);
    downloadFile(`jogo-${uc.short}-${S.game.season}-s${S.game.round + 1}.json`, JSON.stringify(S.game));
  },
  importSave: async () => {
    try {
      const f = await pickFile('.json,application/json');
      S.game = migrate(JSON.parse(f.text));
      autosave(); go('hub'); UI.toast('Jogo importado!');
    } catch (e) { UI.toast('Erro: ' + e.message, 4000); }
  },
  quit: async () => { if (await UI.confirmBox('Voltar ao menu? O jogo já está salvo no automático.')) { autosave(); S.game = null; go('start'); } },

  // Banco de dados
  importDB: async () => {
    try {
      const f = await pickFile('.json,.csv,text/csv,application/json');
      const db = f.name.toLowerCase().endsWith('.csv') ? importCSV(f.text) : importJSON(f.text);
      S.customDB = db; await saveCustomDB(db); await selectDB('custom');
      UI.toast(`Banco importado: ${db.clubs.length} clubes, ${Object.keys(db.players).length} jogadores.` + (db.warnings && db.warnings.length ? ' Avisos: ' + db.warnings.join(' ') : ''), 5000);
    } catch (e) { UI.toast('Erro na importação: ' + e.message, 6000); }
  },
  exportDBcsv: () => downloadFile('jogadores.csv', exportCSV(S.db), 'text/csv;charset=utf-8'),
  exportDBcsvGame: () => downloadFile(`jogadores-${S.game.season}.csv`, exportCSV(S.game), 'text/csv;charset=utf-8'),
  exportDBjson: () => downloadFile(`banco-${S.game.season}.json`, exportJSON({ name: S.game.dbName, source: S.game.dbSource, leagues: S.game.leagues, clubs: S.game.clubs, players: S.game.players }))
};

// Um único "ouvinte" de cliques para o app inteiro
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); UI.haptic(8); Sound.click(); fn(el.dataset); }
});
// "Ondinha" no ponto tocado (botões, itens de lista, chips)
document.addEventListener('pointerdown', e => {
  Sound.unlock(); // o celular só libera o som depois de um toque
  // só o elemento clicável mais próximo do dedo (nunca listas ou telas inteiras)
  const el = e.target.closest('button, .item.tap, .comp-card, .podium');
  if (el && !el.disabled && !el.classList.contains('pl')) UI.rippleAt(el, e);
});

// Campos que mudam (selects, checkbox)
document.addEventListener('change', e => {
  const k = e.target.dataset.change;
  if (k === 'mkPrice') { S.marketFilter.maxPrice = Number(e.target.value); render(true); }
  if (k === 'mkLeague') { S.marketFilter.league = e.target.value; render(true); }
  if (k === 'tableLeague') go('table', { tab: S.params.tab || 'class', league: e.target.value });
  if (k === 'tableCup') go('table', { tab: 'cups', cup: e.target.value });
  if (k === 'awardsLeague') go('awards', { ...S.params, league: e.target.value });
  if (k === 'awardsSeason') go('awards', { ...S.params, season: e.target.value });
  if (k === 'verbose') { S.matchVerbose = e.target.checked; render(true); }
  if (k === 'volume') { S.settings.volume = Number(e.target.value); saveSettings(); Sound.whistle(1);
    const v = document.getElementById('vol-v'); if (v) v.textContent = Math.round(S.settings.volume * 100) + '%'; }
});
// Buscas (com pequena espera enquanto digita)
let searchTimer;
document.addEventListener('input', e => {
  const k = e.target.dataset.change;
  // barras da negociação: atualiza a chance na hora
  if (k === 'nego' && S.nego) {
    if (e.target.id === 'ng-fee') S.nego.fee = Number(e.target.value);
    if (e.target.id === 'ng-wage') S.nego.wage = Number(e.target.value);
    S.nego.msg = null;
    updateNegotiation(S, e.target.dataset.id, S.nego);
    return;
  }
  if (k !== 'marketSearch' && k !== 'clubSearch') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (k === 'marketSearch') { S.marketFilter.q = e.target.value; render(true); }
    else { S.params = { ...S.params, q: e.target.value || undefined }; render(true); }
    const i = document.getElementById(k === 'marketSearch' ? 'mk-q' : 'club-q');
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }, 350);
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeModal(); });

// Botão "voltar" do Android fecha o modal em vez de sair do app
window.addEventListener('popstate', () => {
  if (document.getElementById('modal')) { UI.closeModal(); history.pushState(null, ''); }
});
history.pushState(null, '');

// Funciona offline: registra o service worker (só em https ou localhost)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* sem offline, segue normal */ });
}

// Modo diagnóstico (só com ?debug no endereço): permite inspecionar o estado pelo console
if (new URLSearchParams(location.search).has('debug')) window.__S = S;

// Início
render();
loadCustomDB().then(db => { S.customDB = db; if (S.screen === 'start') render(); });
selectDB('world');
