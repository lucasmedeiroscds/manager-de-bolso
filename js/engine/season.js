// =============================================================
// season.js — criação do jogo, ligas, calendário, tabela e rodadas
// =============================================================
// O jogo tem várias LIGAS (uma por país). Todas jogam ao mesmo tempo:
// a "rodada" (game.round) é uma semana do calendário mundial.
// Ligas com até 22 clubes jogam turno e returno; maiores, turno único.
// =============================================================
import { shuffle, pick, newId, money } from '../util.js';
import { FORMATIONS, MARKING, FOCUS, autoLineup, fixLineup, clubPlayers, touchPlayers } from './tactics.js';
import { Match } from './match.js';
import { weeklyFinances, attendance, seasonPrize, addTx, weeklyWages } from './finance.js';
import { weeklyEvolution, seasonAging, refreshValues } from './evolution.js';
import { aiMarket, aiFillSquads, seasonContracts, news, windowOpen, clubById } from './market.js';
import { createCups, cupFixturesForWeek, processCups } from './cups.js';
import { leagueAwards, worldAwards, titleBonus, grantAwards } from './awards.js';
import { addSecondDivisions, promoteRelegate } from './divisions.js';
import { runTournament, tournamentsAfter } from './nations.js';
import { nationResult, nationOffer } from './national-coach.js';
import { weeklyScouting } from './scouting.js';
import { initCoach, setObjectives, afterUserMatch, weeklyCareer, seasonReview } from './career.js';
import { afterMatchMorale } from './morale.js';
import { afterMatchClub, weeklyStadium, seasonEndClub } from './stadium.js';
import { recordMatch } from './records.js';
import { derbyName, recordH2H } from './derbies.js';
import { weeklyAcademy, seasonAcademy } from './academy.js';
import { weeklyStaff } from './staff.js';
import { checkLegends } from './legends.js';
import { fansAfterMatch } from './fans.js';
import { updateRanking } from './ranking.js';
import { rollEvents, applyFix, afterFixMatch, weeklyEvents } from './events.js';
import { isPlayerMode, pcLineup, afterPcMatch, weeklyPc } from './player-career.js';

export const SAVE_VERSION = 2;

// Cria um jogo novo a partir de um banco de dados (mundo real, fictício ou importado)
export function createGame(db, userClubId, coachName = 'Técnico') {
  const game = {
    version: SAVE_VERSION,
    dbName: db.name,
    dbSource: db.source || '',
    season: 2026,
    round: 0,                // semana atual da temporada (0 = primeira)
    userClubId,
    leagues: JSON.parse(JSON.stringify(db.leagues || [])),
    clubs: JSON.parse(JSON.stringify(db.clubs)),
    players: JSON.parse(JSON.stringify(db.players)),
    inbox: [], news: [], ledger: [], history: [],
    nextPlayerId: 1
  };
  // Banco antigo (uma liga só, sem "leagues"): cria a liga
  if (!game.leagues.length) {
    game.leagues = [{ id: 'L1', name: db.name || 'Liga', country: 'Brasil', continent: 'América do Sul', clubIds: game.clubs.map(c => c.id) }];
  }
  for (const l of game.leagues) for (const id of l.clubIds) {
    const c = game.clubs.find(x => x.id === id);
    if (c) { c.leagueId = l.id; c.country = c.country || l.country; }
  }
  // Clubes sem liga não entram
  game.clubs = game.clubs.filter(c => c.leagueId);
  for (const c of game.clubs) { c.marking = c.marking || 'Média'; c.focus = c.focus || 'Geral'; }
  // ids dos jogadores gerados ("g123") continuam de onde o banco parou
  game.nextPlayerId = 1 + Math.max(0, ...Object.keys(game.players).filter(k => k[0] === 'g').map(k => Number(k.slice(1)) || 0));
  addSecondDivisions(game); // 2ªs divisões (nomes reais, elencos gerados) nos 8 principais países
  touchPlayers(game);
  aiFillSquads(game); // garante elencos completos
  // A IA escolhe formação e estilo
  const forms = Object.keys(FORMATIONS);
  const styles = ['Equilibrado', 'Equilibrado', 'Ofensivo', 'Defensivo', 'Contra-ataque', 'Toque de bola'];
  for (const c of game.clubs) {
    if (c.id !== userClubId) {
      c.formation = pick(forms); c.style = pick(styles);
      c.marking = pick(Object.keys(MARKING)); c.focus = pick(Object.keys(FOCUS));
    }
    autoLineup(game, c);
  }
  refreshValues(game);
  makeAllFixtures(game);
  createCups(game);
  initCoach(game, coachName); // carreira do técnico (metas, diretoria, torcida)
  const uc = userClub(game);
  inbox(game, `Bem-vindo ao ${uc.name}! A diretoria espera uma boa campanha (${userLeague(game).name}). Caixa inicial: ${money(uc.budget)}.`);
  return game;
}

export function userClub(game) { return game.clubs.find(c => c.id === game.userClubId); }
export function leagueOf(game, clubId) { return game.leagues.find(l => l.clubIds.includes(clubId)); }
export function userLeague(game) { return leagueOf(game, game.userClubId); }
export { clubById };

export function inbox(game, text) {
  game.inbox.unshift({ id: newId('m'), type: 'msg', text, season: game.season, round: game.round });
  const msgs = game.inbox.filter(m => m.type === 'msg');
  if (msgs.length > 40) game.inbox = game.inbox.filter(m => m.type !== 'msg' || msgs.indexOf(m) < 40);
}

function makeAllFixtures(game) {
  for (const l of game.leagues) l.fixtures = makeFixtures(l.clubIds, l.clubIds.length <= 22);
}

// Calendário pelo método do "círculo"; returno opcional (mandos invertidos)
export function makeFixtures(ids, doubleRound = true) {
  const teams = shuffle(ids);
  if (teams.length % 2) teams.push(null); // folga se número ímpar
  const n = teams.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i], b = teams[n - 1 - i];
      if (a && b) games.push((r + i) % 2 === 0 ? { h: a, a: b } : { h: b, a: a });
    }
    rounds.push(games);
    teams.splice(1, 0, teams.pop()); // gira mantendo o primeiro fixo
  }
  if (!doubleRound) return rounds;
  return rounds.concat(rounds.map(g => g.map(x => ({ h: x.a, a: x.h }))));
}

// Tabela de classificação de uma liga
export function standings(game, leagueId = userLeague(game).id) {
  const l = game.leagues.find(x => x.id === leagueId);
  const t = {};
  for (const id of l.clubIds) t[id] = { id, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, form: [] };
  for (const round of l.fixtures) {
    for (const f of round) {
      if (!f.r) continue;
      const h = t[f.h], a = t[f.a];
      if (!h || !a) continue;
      h.j++; a.j++;
      h.gp += f.r.hg; h.gc += f.r.ag; a.gp += f.r.ag; a.gc += f.r.hg;
      if (f.r.hg > f.r.ag) { h.v++; h.pts += 3; a.d++; h.form.push('V'); a.form.push('D'); }
      else if (f.r.hg < f.r.ag) { a.v++; a.pts += 3; h.d++; h.form.push('D'); a.form.push('V'); }
      else { h.e++; a.e++; h.pts++; a.pts++; h.form.push('E'); a.form.push('E'); }
    }
  }
  // pontos tirados como punição (esquema de apostas)
  if (l.penalties && l.penalties.season === game.season) for (const [id, n] of Object.entries(l.penalties.map)) if (t[id]) { t[id].pts -= n; t[id].pen = n; }
  return Object.values(t).sort((x, y) =>
    y.pts - x.pts || y.v - x.v || (y.gp - y.gc) - (x.gp - x.gc) || y.gp - x.gp);
}

export function positionOf(game, clubId) {
  const l = leagueOf(game, clubId);
  return standings(game, l.id).findIndex(s => s.id === clubId) + 1;
}

// Semanas da temporada = a liga mais longa
export function totalRounds(game) { return Math.max(...game.leagues.map(l => l.fixtures.length)); }
export function leagueRounds(game, leagueId) { return game.leagues.find(l => l.id === leagueId).fixtures.length; }

// Jogo do usuário na semana atual na LIGA (pode não ter: liga já terminou)
export function userFixture(game) {
  const l = userLeague(game);
  const round = l.fixtures[game.round] || [];
  return round.find(f => f.h === game.userClubId || f.a === game.userClubId);
}

// Há jogos de copa pendentes nesta semana? (fase de meio de semana)
export function cupPhasePending(game) {
  return game.cupWeekDone !== game.round && cupFixturesForWeek(game, game.round).length > 0;
}

// Próximo jogo do usuário nesta semana: copa (meio de semana) ou liga
export function nextUserMatch(game) {
  if (cupPhasePending(game)) {
    const c = cupFixturesForWeek(game, game.round).find(x => x.f.h === game.userClubId || x.f.a === game.userClubId);
    if (c) return { kind: 'cup', f: c.f, name: c.cup.name, stage: c.stage, neutral: c.neutral };
  }
  const f = userFixture(game);
  if (f) return { kind: 'league', f, name: userLeague(game).name, stage: `Rodada ${game.round + 1} de ${leagueRounds(game, userLeague(game).id)}` };
  return null;
}

// Prepara a próxima fase da semana: primeiro as copas (se houver), depois a liga
export function prepareRound(game) {
  touchPlayers(game);
  if (cupPhasePending(game)) return prepareCupPhase(game);
  const warnings = [];
  const matches = [];
  const fixtures = [];
  for (const l of game.leagues) {
    const round = l.fixtures[game.round];
    if (!round) continue;
    const table = standings(game, l.id);
    for (const f of round) {
      const h = clubById(game, f.h), a = clubById(game, f.a);
      for (const c of [h, a]) {
        if (c.id === game.userClubId && !isPlayerMode(game)) warnings.push(...fixLineup(game, c));
        else { autoLineup(game, c); if (c.id === game.userClubId) pcLineup(game, c); }
      }
      const m = new Match(game, h, a, { userClubId: game.userClubId, pcId: game.pc && game.pc.id });
      // Público e renda já definidos antes do jogo (aparecem na tela da partida)
      const pos = table.findIndex(s => s.id === h.id) + 1;
      m.attendance = attendance(h, a, pos, l.clubIds.length);
      m.derby = derbyName(h, a);
      if (m.derby) m.attendance = Math.min(h.stadium, Math.round(m.attendance * 1.3)); // clássico lota
      m.income = m.attendance * h.ticketPrice;
      m.leagueId = l.id;
      matches.push(m);
      fixtures.push(f);
    }
  }
  const suspendedNow = Object.values(game.players).filter(p => p.suspended > 0).map(p => p.id);
  const userMatch = matches.find(m => m.teams.some(t => t.club.id === game.userClubId));
  if (userMatch) applyFix(game, userMatch);
  return { phase: 'league', matches, fixtures, userMatch, warnings, suspendedNow };
}

// Fase de copa (meio de semana)
function prepareCupPhase(game) {
  const warnings = [];
  const matches = [];
  const fixtures = [];
  const playing = new Set();
  const tables = {};
  for (const c of cupFixturesForWeek(game, game.round)) {
    const h = clubById(game, c.f.h), a = clubById(game, c.f.a);
    for (const club of [h, a]) {
      playing.add(club.id);
      if (club.id === game.userClubId && !isPlayerMode(game)) warnings.push(...fixLineup(game, club));
      else { autoLineup(game, club); if (club.id === game.userClubId) pcLineup(game, club); }
    }
    const m = new Match(game, h, a, { userClubId: game.userClubId, pcId: game.pc && game.pc.id, competition: c.cup.id, knockout: c.knockout, neutral: c.neutral });
    const lid = h.leagueId;
    const table = tables[lid] || (tables[lid] = standings(game, lid));
    const pos = Math.max(1, table.findIndex(s => s.id === h.id) + 1);
    // Copa atrai mais público nas fases finais
    const boost = c.knockout ? (c.stage === 'Final' ? 1.6 : c.stage === 'Semifinal' ? 1.35 : 1.15) : 1.1;
    m.derby = derbyName(h, a);
    m.attendance = Math.min(h.stadium, Math.round(attendance(h, a, pos, table.length || 20) * boost * (m.derby ? 1.3 : 1)));
    m.income = m.attendance * h.ticketPrice;
    m.leagueId = c.cup.id;          // "outros jogos" da mesma copa
    m.cupName = c.cup.name; m.stage = c.stage;
    matches.push(m);
    fixtures.push(c.f);
  }
  const suspendedNow = Object.values(game.players).filter(p => p.suspended > 0 && playing.has(p.clubId)).map(p => p.id);
  const userMatch = matches.find(m => m.teams.some(t => t.club.id === game.userClubId));
  if (userMatch) applyFix(game, userMatch);
  return { phase: 'cup', matches, fixtures, userMatch, warnings, suspendedNow };
}

function finishCupPhase(game, prep) {
  const homeGames = [];
  prep.matches.forEach((m, i) => {
    m.runToEnd();
    const r = m.finish();
    const f = prep.fixtures[i];
    f.r = { hg: r.hg, ag: r.ag, scorers: r.scorers, att: m.attendance, pens: r.pens };
    if (m.knockout) f.r.winner = m.teams[m.winnerIndex()].club.id;
    homeGames.push({ home: m.teams[0].club.id, away: m.teams[1].club.id, att: m.attendance, label: m.cupName });
  });
  for (const id of prep.suspendedNow) { const p = game.players[id]; if (p) p.suspended = Math.max(0, p.suspended - 1); }
  if (prep.userMatch) afterFixMatch(game, prep.userMatch, prep.fixtures[prep.matches.indexOf(prep.userMatch)]).forEach(msg => inbox(game, msg));
  // Renda das copas fica com o mandante
  for (const g of homeGames) {
    const c = clubById(game, g.home);
    addTx(game, g.home, `Bilheteria ${g.label} (${g.att.toLocaleString('pt-BR')} pagantes)`, g.att * c.ticketPrice);
  }
  // Recuperação parcial entre o jogo de meio de semana e o da liga
  for (const m of prep.matches) for (const t of m.teams) for (const id of t.used) {
    const p = game.players[id]; if (p) p.fitness = Math.min(100, p.fitness + 6 + p.attrs.res / 20);
  }
  processCups(game).forEach(msg => inbox(game, msg));
  if (prep.userMatch) afterUserMatch(game, prep.userMatch).forEach(msg => inbox(game, msg));
  if (prep.userMatch && isPlayerMode(game)) afterPcMatch(game, prep.userMatch).forEach(msg => inbox(game, msg));
  else if (prep.userMatch) { afterMatchMorale(game, prep.userMatch).forEach(msg => inbox(game, msg)); afterMatchClub(game, prep.userMatch); fansAfterMatch(game, prep.userMatch).forEach(m => inbox(game, m)); }
  if (prep.userMatch) { recordMatch(game, prep.userMatch); recordH2H(game, prep.userMatch); }
  game.cupWeekDone = game.round;
  return { phase: 'cup', seasonEnd: null };
}

// Termina a fase: simula o que falta, aplica resultados, finanças,
// evolução e mercado. Devolve um resumo para mostrar na tela.
export function finishRound(game, prep) {
  if (prep.phase === 'cup') return finishCupPhase(game, prep);
  const homeGames = [];
  prep.matches.forEach((m, i) => {
    m.runToEnd();
    const r = m.finish();
    prep.fixtures[i].r = { hg: r.hg, ag: r.ag, scorers: r.scorers, att: m.attendance };
    homeGames.push({ home: m.teams[0].club.id, away: m.teams[1].club.id, att: m.attendance });
  });
  for (const id of prep.suspendedNow) { const p = game.players[id]; if (p) p.suspended = Math.max(0, p.suspended - 1); }

  if (prep.userMatch) afterFixMatch(game, prep.userMatch, null).forEach(m => inbox(game, m));
  weeklyFinances(game, homeGames);
  weeklyEvents(game).forEach(m => inbox(game, m));
  weeklyEvolution(game).forEach(m => inbox(game, m));
  refreshValues(game);
  // Carreira: reação da diretoria/torcida ao jogo e avaliação semanal
  if (prep.userMatch) afterUserMatch(game, prep.userMatch).forEach(m => inbox(game, m));
  if (prep.userMatch && isPlayerMode(game)) afterPcMatch(game, prep.userMatch).forEach(m => inbox(game, m));
  else if (prep.userMatch) { afterMatchMorale(game, prep.userMatch).forEach(m => inbox(game, m)); afterMatchClub(game, prep.userMatch); fansAfterMatch(game, prep.userMatch).forEach(m => inbox(game, m)); }
  if (prep.userMatch) { recordMatch(game, prep.userMatch); recordH2H(game, prep.userMatch); }
  if (isPlayerMode(game)) weeklyPc(game).forEach(m => inbox(game, m));
  else { weeklyStadium(game, userClub(game)).forEach(m => inbox(game, m)); weeklyStaff(game); weeklyAcademy(game); }
  checkLegends(game).forEach(m => inbox(game, m));
  const wasOpen = windowOpen(game);
  game.round++;
  aiMarket(game);
  weeklyCareer(game).forEach(m => inbox(game, m));
  weeklyScouting(game).forEach(m => inbox(game, m));
  { const nm = nextUserMatch(game); rollEvents(game, nm && { kind: nm.kind, name: nm.name, stage: nm.stage, knockout: nm.kind === 'cup' && !/grupo/i.test(nm.stage || '') }); }

  const uc = userClub(game);
  if (uc.budget < 0 && !isPlayerMode(game)) inbox(game, `⚠️ O caixa está negativo (${money(uc.budget)}). Venda jogadores ou reduza a folha.`);
  if (wasOpen && !windowOpen(game)) inbox(game, 'A janela de transferências fechou.');
  if (!wasOpen && windowOpen(game)) inbox(game, 'A janela de transferências abriu! Até a rodada 23.');
  if (game.round === leagueRounds(game, uc.leagueId) - 8) {
    const exp = clubPlayers(game, uc.id).filter(p => p.contract.years <= 1 && !p.loan);
    if (exp.length) inbox(game, `Contratos acabando no fim da temporada: ${exp.map(p => p.name).join(', ')}. Renove pela tela do jogador.`);
  }
  if (game.round === leagueRounds(game, uc.leagueId) && game.round < totalRounds(game)) {
    const pos = positionOf(game, uc.id);
    inbox(game, `Sua liga terminou: você ficou em ${pos}º. As outras ligas ainda jogam; avance as semanas para começar a próxima temporada.`);
  }

  let seasonEnd = null;
  if (game.round >= totalRounds(game)) seasonEnd = endSeason(game);
  return { seasonEnd };
}

// Fim de temporada: premiação, histórico, contratos, idade e novo calendário
export function endSeason(game) {
  const champions = {};
  let userPos = 0;
  game.lastTables = {};   // classificação final: usada para as vagas nas copas
  for (const l of game.leagues) {
    const table = standings(game, l.id);
    game.lastTables[l.id] = table.map(s => s.id);
    const n = table.length;
    // Prêmio proporcional à riqueza da liga (folha salarial média dos clubes)
    const avgWages = l.clubIds.reduce((s, id) => s + weeklyWages(game, id), 0) / n;
    const scale = Math.max(3e6, avgWages * 30);
    table.forEach((s, i) => {
      addTx(game, s.id, `Premiação (${i + 1}º lugar)`, seasonPrize(i + 1, n, scale));
      const c = clubById(game, s.id);
      if (i < Math.ceil(n / 5)) c.rep = Math.min(99, c.rep + 1);
      if (i >= n - Math.ceil(n / 5)) c.rep = Math.max(20, c.rep - 1);
    });
    champions[l.id] = clubById(game, table[0].id).name;
    if (l.clubIds.includes(game.userClubId)) userPos = table.findIndex(s => s.id === game.userClubId) + 1;
  }
  const ul = userLeague(game);
  const leaguePlayers = Object.values(game.players).filter(p => p.clubId && ul.clubIds.includes(p.clubId));
  const top = leaguePlayers.sort((a, b) => b.seasonGoals - a.seasonGoals)[0];
  const cupChampions = {};
  const userCups = [];
  for (const c of game.cups || []) {
    if (c.champion) cupChampions[c.id] = { name: c.name, club: clubById(game, c.champion).name };
    if (c.champion === game.userClubId) userCups.push(c.name);
  }
  const summary = {
    season: game.season, leagueId: ul.id, champion: champions[ul.id], champions, userPos,
    topScorer: top ? `${top.name} (${top.seasonGoals} gols)` : '-',
    cupChampions, userCups,
    tier: ul.tier || 1, userLost: (standings(game, ul.id).find(x => x.id === game.userClubId) || {}).d
  };
  game.history.unshift(summary);
  if (game.history.length > 30) game.history.length = 30;
  inbox(game, `🏆 ${summary.champion} é o campeão da ${ul.name} ${game.season}! Você terminou em ${userPos}º.`);
  if (!isPlayerMode(game)) seasonEndClub(game, userClub(game), userPos, ul.clubIds.length).forEach(msg => inbox(game, msg));

  // ---- Premiação da temporada ----
  const champIds = Object.fromEntries(game.leagues.map(l => [l.id, game.lastTables[l.id][0]]));
  const byLeague = {};
  for (const l of game.leagues) {
    const a = leagueAwards(game, l, game.lastTables[l.id], l.fixtures.length);
    if (a) byLeague[l.id] = a;
  }
  const world = worldAwards(game, titleBonus(game, champIds), totalRounds(game));
  grantAwards(game, game.season, byLeague, world);
  game.awards = [{ season: game.season, leagues: byLeague, world }, ...(game.awards || [])].slice(0, 10);
  summary.awards = { league: byLeague[ul.id] || null, world: world.slice(0, 3) };
  const la = byLeague[ul.id];
  if (la) inbox(game, `🏅 Melhor jogador da ${ul.name}: ${la.mvp.name} (${la.mvp.club}). Artilheiro: ${la.top ? la.top.name + ' (' + la.top.lg + ' gols)' : '-'}.`);
  if (world[0]) inbox(game, `🌍 MELHOR DO MUNDO ${game.season}: ${world[0].name} (${world[0].club})!`);
  const mineWon = [la && la.mvp, la && la.top, la && la.young, la && la.gk, world[0]].filter(e => e && e.clubId === game.userClubId);
  if (mineWon.length) inbox(game, `🎉 Seus jogadores premiados: ${[...new Set(mineWon.map(e => e.name))].join(', ')}!`);
  for (const p of Object.values(game.players)) p.ss = null; // zera estatísticas para a nova temporada

  // ---- Torneios de seleções nas férias (Copa do Mundo, Eurocopa, Copa América) ----
  summary.nationals = [];
  for (const def of tournamentsAfter(game.season)) {
    const t = runTournament(game, def, game.season + 1);
    if (!t) continue;
    game.nationalCups = [t, ...(game.nationalCups || [])].slice(0, 12);
    summary.nationals.push({ name: t.name, year: t.year, champion: t.champion, runnerUp: t.runnerUp, best: t.best, userCalled: t.userCalled.length });
    inbox(game, `🌍 ${t.name} ${t.year}: ${t.champion} é campeão! (vice: ${t.runnerUp})${t.best ? ` · Craque: ${t.best.name}` : ''}`);
    const nr = nationResult(game, t);
    if (nr) {
      summary.nationals[summary.nationals.length - 1].userNation = nr;
      inbox(game, `🧢 Sua seleção (${nr.nat}) na ${t.name}: ${nr.stage}. Reputação ${nr.delta >= 0 ? '+' : ''}${nr.delta}.`);
      if (nr.fired) inbox(game, `❌ A federação de ${nr.nat} demitiu você depois da ${t.name}.`);
    }
    if (t.userCalled.length) inbox(game, `📣 ${t.userCalled.length} jogador(es) do seu clube foram convocados para a ${t.name}: ${t.userCalled.map(u => `${u.name} (${u.nat})`).join(', ')}.`);
  }

  // ---- Balanço da carreira do técnico (metas, títulos, reputação) ----
  if (game.coach) {
    summary.career = seasonReview(game, { ...summary, leagueName: ul.name });
    const cr = summary.career;
    inbox(game, `📋 Balanço da temporada: ${cr.results.filter(r => r.state === 'done').length} de ${cr.results.length} metas cumpridas. Reputação ${cr.repDelta >= 0 ? '+' : ''}${cr.repDelta} (${cr.rep}, ${cr.level}).`);
    if (cr.firedNow) inbox(game, '❌ A diretoria não vai renovar com você. Escolha uma nova proposta em Carreira.');
    else if (game.coach.offers.length) inbox(game, `📨 ${game.coach.offers.length} clube(s) querem contratar você. Veja em Carreira.`);
    const no = nationOffer(game);
    if (no) inbox(game, `🧢 CONVITE: a seleção ${no.nat} (${no.rank}ª do ranking) quer você como técnico! Veja em Carreira.`);
  }

  updateRanking(game);
  const msgs = [...seasonContracts(game), ...seasonAging(game), ...(isPlayerMode(game) ? [] : seasonAcademy(game))];
  msgs.forEach(m => inbox(game, m));
  aiFillSquads(game);
  const n2 = clubPlayers(game, game.userClubId).length;
  if (n2 < 18) inbox(game, `⚠️ Seu elenco tem só ${n2} jogadores. Contrate no Mercado (agentes livres não custam taxa).`);

  game.season++;
  game.round = 0;
  // Acesso e rebaixamento (e cria as 2ªs divisões em jogos salvos antigos)
  promoteRelegate(game, game.lastTables).forEach(m => inbox(game, m));
  addSecondDivisions(game);
  makeAllFixtures(game);
  createCups(game);
  if (game.coach && !game.coach.fired) setObjectives(game); // novas metas
  for (const c of game.clubs) autoLineup(game, c);
  news(game, `Começa a temporada ${game.season}!`);
  const mine = game.cups.filter(c => c.teams.includes(game.userClubId)).map(c => c.name);
  if (mine.length) inbox(game, `Nesta temporada você disputa: ${mine.join(', ')}.`);
  return summary;
}
