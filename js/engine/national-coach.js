// =============================================================
// national-coach.js — o técnico do usuário na SELEÇÃO
// =============================================================
// • Convite: técnicos com reputação 55+ podem ser convidados por uma
//   seleção (no fim da temporada ou, mais raro, no meio dela). Quanto
//   maior a reputação, mais forte a seleção que chama.
// • O cargo é acumulado com o clube (como na vida real em jogos de
//   técnico): você faz a convocação e escolhe a formação.
// • Nos torneios (Copa do Mundo, Eurocopa, Copa América) o resultado
//   é comparado com o esperado: sobe ou cai a reputação; título vai
//   para a sala de troféus; campanha muito ruim = demissão.
// =============================================================
import { rnd, clamp, pick } from '../util.js';
import { nationRanking } from './nations.js';
import { FORMATIONS } from './tactics.js';

const ORDER = ['Fase de grupos', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final', 'Campeão'];

function userCountry(game) {
  const l = game.leagues.find(x => x.clubIds.includes(game.userClubId));
  return l ? l.country : null;
}

// Tenta gerar um convite de seleção. mid = no meio da temporada
export function nationOffer(game, mid = false) {
  const c = game.coach;
  if (!c || c.nation || c.natOffer || c.fired || c.rep < 55) return null;
  if (rnd() > (mid ? 0.012 : 0.3 + (c.rep - 55) / 80)) return null;
  const rk = nationRanking(game);
  const [a, b] = c.rep >= 85 ? [0, 8] : c.rep >= 75 ? [3, 16] : c.rep >= 65 ? [8, 26] : [15, 40];
  const banned = new Set((c.natPast || []).filter(p => p.note === 'Demitido').map(p => p.nat));
  const pool = rk.slice(a, b).filter(x => !banned.has(x.nat));
  if (!pool.length) return null;
  const local = pool.find(x => x.nat === userCountry(game));
  const ch = local && rnd() < 0.5 ? local : pick(pool);
  c.natOffer = { nat: ch.nat, rank: rk.indexOf(ch) + 1, expires: mid ? game.round + 3 : 4 };
  return c.natOffer;
}

export function acceptNation(game) {
  const c = game.coach;
  if (!c || !c.natOffer) return { ok: false, msg: 'Convite não encontrado.' };
  if (c.nation) leaveNation(game, 'Saiu');
  c.nation = { nat: c.natOffer.nat, since: game.season, formation: '4-3-3', squad: [], history: [] };
  c.natOffer = null;
  return { ok: true, msg: `Você é o novo técnico da seleção: ${c.nation.nat}!` };
}

export function leaveNation(game, note = 'Saiu') {
  const c = game.coach;
  if (!c || !c.nation) return;
  (c.natPast = c.natPast || []).push({ nat: c.nation.nat, from: c.nation.since, to: game.season, note, history: c.nation.history });
  c.nation = null;
}

// Convocação manual
export function natToggle(game, playerId) {
  const n = game.coach && game.coach.nation;
  const p = game.players[playerId];
  if (!n || !p || p.nat !== n.nat) return { ok: false, msg: 'Jogador não pode ser convocado.' };
  if (!n.squad.length) n.squad = currentSquad(game).map(x => x.id); // começa da convocação atual
  const i = n.squad.indexOf(playerId);
  if (i >= 0) { n.squad.splice(i, 1); return { ok: true, msg: `${p.name} foi desconvocado.` }; }
  if (n.squad.length >= 26) return { ok: false, msg: 'Máximo de 26 convocados. Tire alguém antes.' };
  n.squad.push(playerId);
  return { ok: true, msg: `${p.name} convocado!` };
}
export function natAuto(game) { const n = game.coach && game.coach.nation; if (n) n.squad = []; }
export function natFormation(game, f) { const n = game.coach && game.coach.nation; if (n && FORMATIONS[f]) n.formation = f; }

// Convocação que vale agora (manual ou automática)
export function currentSquad(game) {
  const n = game.coach && game.coach.nation;
  if (!n) return [];
  const e = nationRanking(game).find(x => x.nat === n.nat);
  return e ? e.squad : [];
}

// Fase alcançada por uma seleção num torneio já jogado
export function nationStage(t, nat) {
  if (t.champion === nat) return 'Campeão';
  if (!t.teams.some(x => x.nat === nat)) return null;
  let st = 'Fase de grupos';
  for (const r of t.rounds) if (r.ties.some(x => x.h === nat || x.a === nat)) st = r.name;
  if (st === 'Final') st = 'Final';
  return st;
}

// Depois de cada torneio: avalia a campanha da seleção do usuário
export function nationResult(game, t) {
  const c = game.coach, n = c && c.nation;
  if (!n) return null;
  const stage = nationStage(t, n.nat);
  if (!stage) {
    n.history.push({ year: t.year, name: t.name, stage: 'Não se classificou' });
    c.rep = Math.round(clamp(c.rep - 2, 1, 99));
    return { nat: n.nat, name: t.name, stage: 'Não se classificou', delta: -2, fired: false };
  }
  const seed = t.teams.findIndex(x => x.nat === n.nat), size = t.teams.length;
  const expected = seed < size * 0.125 ? 'Semifinal' : seed < size * 0.25 ? 'Quartas de final' : seed < size * 0.5 ? 'Oitavas de final' : 'Fase de grupos';
  let ri = ORDER.indexOf(stage), ei = ORDER.indexOf(expected);
  if (size <= 16 && ei === 1) ei = 2;     // torneio de 16: depois dos grupos já são as quartas
  const delta = clamp((ri - ei) * 2 + (stage === 'Campeão' ? 6 : 0), -8, 14);
  c.rep = Math.round(clamp(c.rep + delta, 1, 99));
  n.history.push({ year: t.year, name: t.name, stage });
  if (stage === 'Campeão') c.trophies.push({ season: t.year, name: t.name, club: n.nat });
  let fired = false;
  if (ri < ei - 1 || (ri < ei && rnd() < 0.35)) { fired = true; leaveNation(game, 'Demitido'); }
  return { nat: n.nat, name: t.name, stage, expected, delta, fired };
}
