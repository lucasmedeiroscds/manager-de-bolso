// =============================================================
// career.js — CARREIRA DO TÉCNICO
// =============================================================
// • Reputação do técnico (0–100): sobe com metas cumpridas e títulos.
// • Diretoria e Torcida (0–100): mudam a cada jogo conforme o
//   resultado COMPARADO ao esperado (vencer um time mais forte vale
//   mais; perder para um mais fraco pesa mais).
// • Metas da temporada: posição na liga, fase nas copas, caixa.
// • Demissão: diretoria abaixo de 12 (depois da 8ª semana) ou meta
//   da liga muito longe no fim da temporada.
// • Propostas: clubes interessados no fim da temporada (e às vezes
//   no meio dela, se a reputação estiver alta); quando demitido,
//   aparecem propostas de clubes menores.
// =============================================================
import { clamp, rnd, pick, newId } from '../util.js';
import { teamStrength, autoLineup } from './tactics.js';
import { clubById } from './market.js';
import { standings } from './season.js';
import { zoneSizes } from './divisions.js';

export const LEVELS = [
  [0, 'Iniciante'], [25, 'Promissor'], [40, 'Experiente'], [55, 'Respeitado'],
  [70, 'Renomado'], [82, 'Elite'], [92, 'Lenda']
];
export function coachLevel(rep) {
  let l = LEVELS[0][1];
  for (const [min, name] of LEVELS) if (rep >= min) l = name;
  return l;
}

const STAGE_ORDER = ['Fase preliminar', 'Fase de grupos', '32-avos de final', '16-avos de final', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final', 'Campeão'];
const stageIdx = s => Math.max(0, STAGE_ORDER.indexOf(s));

function league(game, clubId) { return game.leagues.find(l => l.clubIds.includes(clubId)); }

// ---------- Criação ----------
export function initCoach(game, name) {
  const club = clubById(game, game.userClubId);
  game.coach = {
    name: (name || 'Técnico').slice(0, 30),
    rep: Math.round(clamp(30 + club.rep * 0.25, 20, 60)),
    board: 65, fans: 60,
    objectives: [],
    history: [],          // { season, club, league, pos, note }
    trophies: [],         // { season, name, club }
    offers: [],           // { id, clubId, expires }
    fired: false,
    joinedSeason: game.season, joinedRound: game.round,
    stats: { games: 0, w: 0, d: 0, l: 0 }
  };
  setObjectives(game);
}

// ---------- Metas ----------
export function setObjectives(game) {
  const c = game.coach;
  const uc = clubById(game, game.userClubId);
  const L = league(game, uc.id);
  const n = L.clubIds.length;
  const ranked = L.clubIds.slice().sort((a, b) => clubById(game, b).rep - clubById(game, a).rep);
  const rk = ranked.indexOf(uc.id) + 1;            // 1 = elenco mais forte da liga
  // zona de rebaixamento real (se a liga tiver 2ª divisão) ou o último 1/5
  const zs = zoneSizes(game, L.id);
  const bottomLine = n - (zs && zs.relegate ? zs.relegate : Math.ceil(n / 5));
  let target = Math.max(1, Math.round(rk + n * 0.12));
  if (rk === 1) target = 2;
  target = Math.min(target, bottomLine);
  const objs = [];
  let lt = target === 1 ? 'Ser campeão' : target <= 2 ? `Terminar entre os 2 primeiros` : target >= bottomLine ? `Não ficar entre os ${n - bottomLine} últimos (${bottomLine}º ou melhor)` : `Terminar entre os ${target} primeiros`;
  if (zs && zs.relegate && target >= bottomLine) lt = `Escapar do rebaixamento (${bottomLine}º ou melhor)`;
  if (zs && zs.promote) {
    // 2ª divisão: clubes fortes têm de subir
    if (rk <= zs.promote * 2) { target = zs.promote; lt = `Conseguir o acesso (terminar entre os ${zs.promote} primeiros)`; }
  }
  objs.push({ id: 'L', kind: 'league', leagueId: L.id, target, text: `${L.name}: ${lt}`, weight: 3 });
  for (const cup of game.cups || []) {
    if (!cup.teams.includes(uc.id) || cup.type === 'world') continue;
    let stage;
    if (cup.type === 'national') stage = L.tier === 2 ? (rk <= 3 ? 'Oitavas de final' : '16-avos de final')
      : rk <= Math.ceil(n * 0.2) ? 'Semifinal' : rk <= Math.ceil(n * 0.5) ? 'Quartas de final' : 'Oitavas de final';
    else {
      const strongest = cup.teams.slice().sort((a, b) => clubById(game, b).rep - clubById(game, a).rep).indexOf(uc.id) + 1;
      stage = strongest <= cup.teams.length * 0.15 ? 'Semifinal' : strongest <= cup.teams.length * 0.4 ? 'Quartas de final' : cup.groups.length ? 'Oitavas de final' : 'Quartas de final';
      if (cup.teams.length <= 16 && stage === 'Oitavas de final') stage = 'Quartas de final';
    }
    objs.push({ id: 'C' + cup.id, kind: 'cup', cupId: cup.id, stage, text: `${cup.name}: chegar ${stage === 'Semifinal' ? 'à semifinal' : stage === 'Final' ? 'à final' : 'às ' + stage.toLowerCase()}`, weight: cup.type === 'national' ? 1 : 2 });
  }
  objs.push({ id: 'F', kind: 'finance', text: 'Terminar a temporada com o caixa positivo', weight: 1 });
  c.objectives = objs;
}

// Fase mais avançada que o clube alcançou numa copa
function stageReached(cup, clubId) {
  if (cup.champion === clubId) return 'Campeão';
  let best = cup.groups.length && cup.teams.includes(clubId) ? 'Fase de grupos' : 'Fase preliminar';
  for (const r of cup.rounds) if (r.ties.some(f => f.h === clubId || f.a === clubId) && stageIdx(r.name) > stageIdx(best)) best = r.name;
  return best;
}
function eliminated(cup, clubId) {
  if (cup.champion === clubId) return false;
  if (cup.runnerUp === clubId) return true;
  if (cup.rounds.some(r => r.ties.some(f => f.r && (f.h === clubId || f.a === clubId) && f.r.winner && f.r.winner !== clubId))) return true;
  // caiu nos grupos?
  if (cup.groups.length && cup.rounds.length && !cup.rounds[0].ties.some(f => f.h === clubId || f.a === clubId)) return true;
  return false;
}

// Situação de cada meta: done (cumprida), ok (no caminho), risk, fail
export function evaluate(game, o, final = false) {
  const uc = game.userClubId;
  if (o.kind === 'league') {
    const L = game.leagues.find(l => l.id === o.leagueId);
    if (!L || !L.clubIds.includes(uc)) return { state: 'fail', detail: 'Saiu do clube' };
    const tab = standings(game, L.id);
    const pos = tab.findIndex(s => s.id === uc) + 1;
    const played = tab.find(s => s.id === uc).j;
    const over = game.round >= L.fixtures.length || final;
    if (over) return { state: pos <= o.target ? 'done' : 'fail', detail: `${pos}º lugar` };
    if (played < 3) return { state: 'ok', detail: 'Começando' };
    const slack = Math.ceil(L.clubIds.length * 0.15);
    return { state: pos <= o.target ? 'ok' : pos <= o.target + slack ? 'risk' : 'fail', detail: `${pos}º agora` };
  }
  if (o.kind === 'cup') {
    const cup = (game.cups || []).find(c => c.id === o.cupId);
    if (!cup) return { state: final ? 'fail' : 'ok', detail: '—' };
    const reached = stageReached(cup, uc);
    if (stageIdx(reached) >= stageIdx(o.stage)) return { state: 'done', detail: reached };
    if (eliminated(cup, uc)) return { state: 'fail', detail: `Caiu (${reached})` };
    return { state: final ? 'fail' : 'ok', detail: reached };
  }
  // finanças
  const club = clubById(game, uc);
  if (final) return { state: club.budget >= 0 ? 'done' : 'fail', detail: '' };
  return { state: club.budget >= 0 ? 'ok' : 'risk', detail: club.budget >= 0 ? 'Caixa positivo' : 'Caixa negativo' };
}

// ---------- Depois de cada jogo do usuário ----------
// m: partida (Match) já terminada
export function afterUserMatch(game, m) {
  const c = game.coach;
  if (!c || c.fired) return [];
  const msgs = [];
  const me = m.teams.findIndex(t => t.club.id === game.userClubId);
  if (me < 0) return msgs;
  const t = m.teams[me], o = m.teams[1 - me];
  const sMe = teamStrength(game, t.club), sOp = teamStrength(game, o.club);
  const homeBoost = t.isHome ? 2 : o.isHome ? -2 : 0;
  const expected = 1 / (1 + Math.exp(-((sMe + homeBoost) - sOp) / 4));   // chance "esperada" de vencer
  const gf = t.goals, ga = o.goals;
  let score = gf > ga ? 1 : gf < ga ? 0 : 0.45;
  if (m.knockout && gf === ga && m.pens) score = m.winnerIndex() === me ? 0.8 : 0.15;
  const diff = score - expected;                     // -1 a +1
  const isCup = m.competition !== 'league';
  let db = diff * (isCup ? 7 : 5.5), df = diff * (isCup ? 11 : 8);
  if (ga - gf >= 3) { db -= 3; df -= 5; }            // goleada sofrida
  if (gf - ga >= 3) { db += 1; df += 3; }            // goleada aplicada
  if (m.knockout && m.winnerIndex() !== me) { db -= 3; df -= 4; } // eliminação
  c.board = clamp(c.board + db, 0, 100);
  c.fans = clamp(c.fans + df, 0, 100);
  c.stats.games++;
  if (score >= 0.8) c.stats.w++; else if (score <= 0.15) c.stats.l++; else c.stats.d++;
  if (c.fans <= 20 && rnd() < 0.3) msgs.push('📣 A torcida protesta e pede a sua saída!');
  return msgs;
}

// ---------- Toda semana (depois da rodada da liga) ----------
export function weeklyCareer(game) {
  const c = game.coach;
  if (!c || c.fired) return [];
  const msgs = [];
  // Diretoria olha a meta da liga e as finanças
  const lo = c.objectives.find(o => o.kind === 'league');
  if (lo && game.round >= 6) {
    const ev = evaluate(game, lo);
    if (ev.state === 'fail') c.board = clamp(c.board - 1.0, 0, 100);
    else if (ev.state === 'risk') c.board = clamp(c.board - 0.25, 0, 100);
    else c.board = clamp(Math.max(c.board + 0.6, 30), 0, 100); // tabela em dia: a diretoria segura o técnico
  }
  if (clubById(game, game.userClubId).budget < 0) c.board = clamp(c.board - 1, 0, 100);
  // A torcida volta devagar para o "normal"
  c.fans += (55 - c.fans) * 0.03;
  // Avisos
  if (c.board < 25 && !c._warned) { msgs.push('⚠️ A diretoria está insatisfeita. Os próximos jogos podem decidir o seu futuro.'); c._warned = true; }
  if (c.board >= 35) c._warned = false;
  // Demissão
  if (game.round >= 10 && c.board <= 10) {
    fire(game, 'A diretoria perdeu a confiança no seu trabalho.');
    msgs.push(`❌ Você foi demitido do ${clubById(game, game.userClubId).name}.`);
  }
  // Proposta no meio da temporada (técnico em alta)
  if (!c.fired && c.rep >= 55 && rnd() < 0.04 && !c.offers.length) {
    const off = makeOffers(game, 1, c.rep - 8, c.rep + 6);
    if (off.length) { c.offers = off; msgs.push(`📨 O ${clubById(game, off[0].clubId).name} quer contratar você! Veja em Carreira.`); }
  }
  // Propostas vencidas
  c.offers = c.offers.filter(o => o.expires == null || o.expires >= game.round);
  return msgs;
}

// ---------- Demissão e propostas ----------
function fire(game, reason) {
  const c = game.coach;
  const uc = clubById(game, game.userClubId);
  const L = league(game, uc.id);
  const pos = standings(game, L.id).findIndex(s => s.id === uc.id) + 1;
  c.history.push({ season: game.season, club: uc.name, league: L.name, pos, note: 'Demitido' });
  c.fired = true;
  c.firedReason = reason;
  c.rep = clamp(c.rep - 6, 1, 100);
  // Clubes menores interessados
  c.offers = makeOffers(game, 3, Math.max(20, c.rep - 25), c.rep - 2, uc.id);
  if (!c.offers.length) c.offers = makeOffers(game, 3, 0, 100, uc.id);
}

// Clubes com reputação entre min e max (excluindo o atual)
// (preferência para clubes do mesmo país e continente do clube atual)
function makeOffers(game, n, minRep, maxRep, exclude = game.userClubId) {
  const pool = game.clubs.filter(cl => cl.id !== exclude && cl.id !== game.userClubId && cl.rep >= minRep && cl.rep <= maxRep);
  const cur = clubById(game, exclude) || clubById(game, game.userClubId);
  const curL = cur ? league(game, cur.id) : null;
  const weight = cl => {
    const l = league(game, cl.id);
    if (!curL || !l) return 1;
    return l.id === curL.id ? 4 : l.continent === curL.continent ? 2 : 1;
  };
  const out = [];
  const used = new Set();
  for (let i = 0; i < n && pool.length > used.size; i++) {
    const cand = pool.filter(cl => !used.has(cl.id));
    const tot = cand.reduce((s, cl) => s + weight(cl), 0);
    let x = rnd() * tot, cl = cand[0];
    for (const k of cand) { x -= weight(k); if (x <= 0) { cl = k; break; } }
    used.add(cl.id);
    out.push({ id: newId('j'), clubId: cl.id, expires: game.round + 3 });
  }
  return out;
}

// Técnico desempregado procura novas propostas (uma vez por semana)
export function searchJobs(game) {
  const c = game.coach;
  if (c._searched === `${game.season}-${game.round}`) return false;
  c._searched = `${game.season}-${game.round}`;
  c.offers = makeOffers(game, 3, Math.max(15, c.rep - 30), c.rep + 2);
  return true;
}

// Assume um novo clube (proposta aceita)
export function takeJob(game, clubId) {
  const c = game.coach;
  const old = clubById(game, game.userClubId);
  const nc = clubById(game, clubId);
  if (!nc) return { ok: false, msg: 'Clube não encontrado.' };
  if (!c.fired && old) {
    const L = league(game, old.id);
    const pos = standings(game, L.id).findIndex(s => s.id === old.id) + 1;
    c.history.push({ season: game.season, club: old.name, league: L.name, pos, note: 'Saiu para o ' + nc.name });
  }
  if (old) autoLineup(game, old);          // o clube antigo volta a ser da IA
  game.userClubId = nc.id;
  game.inbox = game.inbox.filter(m => m.type !== 'offer');
  for (const p of Object.values(game.players)) if (p.clubId === nc.id) p.listed = false;
  c.fired = false; c.firedReason = null;
  c.offers = [];
  c.board = 62; c.fans = 55;
  c.joinedSeason = game.season; c.joinedRound = game.round;
  autoLineup(game, nc);
  setObjectives(game);
  return { ok: true, msg: `Você é o novo técnico do ${nc.name}!` };
}

// ---------- Fim de temporada ----------
// summary: resumo do endSeason (campeões etc.); devolve o balanço
export function seasonReview(game, summary) {
  const c = game.coach;
  if (!c) return null;
  const uc = clubById(game, game.userClubId);
  const results = c.objectives.map(o => ({ text: o.text, weight: o.weight, ...evaluate(game, o, true) }));
  let repDelta = 0, boardDelta = 0;
  for (const r of results) {
    repDelta += r.state === 'done' ? r.weight * 1.6 : -r.weight * 1.4;
    boardDelta += r.state === 'done' ? r.weight * 4 : -r.weight * 5;
  }
  // Títulos
  const titles = [];
  if (summary.champions && summary.champions[uc.leagueId] === uc.name) titles.push({ name: summary.leagueName || 'Liga', w: 6 });
  for (const cup of game.cups || []) if (cup.champion === uc.id) titles.push({ name: cup.name, w: cup.type === 'world' ? 8 : cup.type === 'continental' ? ((cup.tier || 1) === 1 ? 7 : 4) : 3 });
  for (const t of titles) {
    repDelta += t.w; boardDelta += t.w * 2;
    c.trophies.push({ season: game.season, name: t.name, club: uc.name });
  }
  c.rep = Math.round(clamp(c.rep + repDelta, 1, 99));
  c.board = clamp(c.board + boardDelta, 0, 100);
  const L = league(game, uc.id);
  c.history.push({ season: game.season, club: uc.name, league: L.name, pos: summary.userPos, note: titles.length ? '🏆 ' + titles.map(t => t.name).join(', ') : '' });
  // Demissão no fim da temporada (meta da liga muito longe)
  const lo = results[0];
  let firedNow = false;
  // Cumpriu a meta da liga? Fica. Senão: demitido se a diretoria estiver
  // muito insatisfeita ou se a posição ficou muito longe da meta.
  const leagueOk = lo && lo.state === 'done';
  if (leagueOk) c.board = Math.max(c.board, 45);
  const miss = summary.userPos - c.objectives[0].target;   // posições abaixo da meta
  const nL = L.clubIds.length;
  if (!leagueOk && ((miss > Math.ceil(nL * 0.15) && c.board < 25) || miss > Math.ceil(nL * 0.3))) {
    c.history[c.history.length - 1].note += ' · Demitido';
    c.fired = true; c.firedReason = 'A diretoria decidiu não continuar com você após a temporada.';
    c.offers = makeOffers(game, 3, Math.max(20, c.rep - 25), c.rep - 2, uc.id);
    firedNow = true;
  } else {
    // Propostas de outros clubes (técnico valorizado)
    const n = c.rep >= 50 ? 2 : 1;
    if (rnd() < 0.4 + c.rep / 200) c.offers = makeOffers(game, n, c.rep - 10, c.rep + 8);
    c.board = clamp(55 + (c.board - 55) * 0.5, 30, 90); // nova temporada, nova chance
  }
  for (const o of c.offers) o.expires = 4; // valem até a 5ª semana da próxima temporada
  return { results, repDelta: Math.round(repDelta), titles: titles.map(t => t.name), firedNow, rep: c.rep, level: coachLevel(c.rep) };
}
