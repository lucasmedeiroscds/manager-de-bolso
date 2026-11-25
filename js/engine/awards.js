// =============================================================
// awards.js — PREMIAÇÕES da temporada
// =============================================================
// Por liga: Melhor jogador, Artilheiro, Melhor jovem (até 21 anos),
//           Melhor goleiro e Seleção do campeonato (4-3-3).
// Mundo:    Melhor do Mundo (top 10, com pódio).
//
// Critério (pontuação):
//  • nota média nos jogos (o principal)
//  • gols e assistências
//  • títulos (liga, copas continentais, Mundial, copa nacional)
//  • nível do jogador (overall) — no prêmio mundial pesa a força
//    da liga, para um craque de liga fraca não ganhar fácil
// Só concorre quem jogou um mínimo de partidas.
// =============================================================
import { overall } from './ratings.js';
import { clubById } from './market.js';

const avgL = s => s.lj ? s.lr / s.lj : 0;   // nota média na liga
const avgA = s => s.j ? s.r / s.j : 0;      // nota média em todos os jogos

function entry(game, p, extra = {}) {
  const c = p.clubId ? clubById(game, p.clubId) : null;
  return { id: p.id, name: p.name, pos: p.pos, age: p.age, clubId: p.clubId, club: c ? c.name : 'Sem clube',
    nat: p.nat || '', g: p.ss ? p.ss.g : 0, a: p.ss ? p.ss.a : 0, lg: p.ss ? p.ss.lg : 0,
    avg: p.ss ? Math.round((extra.world ? avgA(p.ss) : avgL(p.ss)) * 100) / 100 : 0, ...extra };
}

// Pontuação para os prêmios da liga
function leagueScore(p, posInTable) {
  const s = p.ss;
  let v = avgL(s) + s.lg * 0.05 + s.la * 0.03;
  if (posInTable === 1) v += 0.35; else if (posInTable <= 4) v += 0.15;
  if (p.pos === 'GOL') v += s.cs * 0.02;
  return v;
}

// table: lista de ids na ordem da classificação; rounds: jogos da liga até agora
export function leagueAwards(game, league, table, roundsPlayed) {
  const ids = new Set(league.clubIds);
  const minApps = Math.max(1, Math.ceil(roundsPlayed * 0.4));
  const posOf = {};
  table.forEach((id, i) => { posOf[id] = i + 1; });
  const pool = Object.values(game.players).filter(p => ids.has(p.clubId) && p.ss && p.ss.lj >= minApps);
  if (!pool.length) return null;
  const sc = p => leagueScore(p, posOf[p.clubId] || 99);
  const byScore = pool.slice().sort((a, b) => sc(b) - sc(a));
  const mvp = byScore[0];
  const top = pool.slice().sort((a, b) => b.ss.lg - a.ss.lg || avgL(b.ss) - avgL(a.ss))[0];
  const young = byScore.find(p => p.age <= 21);
  const gk = pool.filter(p => p.pos === 'GOL').sort((a, b) => sc(b) - sc(a))[0];
  // Seleção 4-3-3
  const pickN = (pos, n, used) => byScore.filter(p => pos.includes(p.pos) && !used.has(p.id)).slice(0, n);
  const used = new Set();
  const team = [];
  for (const [pos, n] of [[['GOL'], 1], [['LAT'], 2], [['ZAG'], 2], [['VOL', 'MEI'], 3], [['ATA'], 3]]) {
    for (const p of pickN(pos, n, used)) { used.add(p.id); team.push(entry(game, p)); }
  }
  return {
    leagueId: league.id, leagueName: league.name, country: league.country,
    mvp: entry(game, mvp), top: top ? entry(game, top) : null,
    young: young ? entry(game, young) : null, gk: gk ? entry(game, gk) : null, team
  };
}

// Força da liga (para o prêmio mundial): média dos 5 clubes mais fortes
function leagueStrength(game, leagueId) {
  const l = game.leagues.find(x => x.id === leagueId);
  if (!l) return 50;
  const reps = l.clubIds.map(id => clubById(game, id).rep).sort((a, b) => b - a).slice(0, 5);
  return reps.reduce((s, v) => s + v, 0) / reps.length;
}

// titles: { clubId: bônus } (calculado a partir dos campeões da temporada)
export function worldAwards(game, titles, weeksPlayed) {
  const minApps = Math.max(1, Math.ceil(weeksPlayed * 0.45));
  const str = {};
  const pool = Object.values(game.players).filter(p => p.clubId && p.ss && p.ss.j >= minApps);
  const score = p => {
    const c = clubById(game, p.clubId);
    const ls = str[c.leagueId] ?? (str[c.leagueId] = leagueStrength(game, c.leagueId));
    return avgA(p.ss) + p.ss.g * 0.025 + p.ss.a * 0.015 + (overall(p) - 70) * 0.06 + (ls - 70) * 0.035 + (titles[p.clubId] || 0);
  };
  return pool.map(p => ({ p, s: score(p) })).sort((a, b) => b.s - a.s).slice(0, 10)
    .map(({ p, s }) => entry(game, p, { world: true, score: Math.round(s * 100) / 100 }));
}

// Bônus de títulos por clube (a partir das copas e ligas da temporada)
export function titleBonus(game, leagueChampions) {
  const t = {};
  const add = (id, v) => { if (id) t[id] = (t[id] || 0) + v; };
  for (const id of Object.values(leagueChampions)) add(id, 0.3);
  for (const c of game.cups || []) {
    if (!c.champion) continue;
    if (c.type === 'world') add(c.champion, 0.2);
    else if (c.type === 'continental') add(c.champion, (c.tier || 1) === 1 ? 0.45 : 0.15);
    else add(c.champion, 0.1);
  }
  return t;
}

// Entrega os prêmios: troféus na ficha do jogador e moral alta
export function grantAwards(game, season, byLeague, world) {
  const give = (e, label) => {
    const p = e && game.players[e.id];
    if (!p) return;
    (p.trophies = p.trophies || []).push(`${label} ${season}`);
    p.moral = Math.min(100, p.moral + 15);
  };
  for (const a of Object.values(byLeague)) {
    give(a.mvp, `🏅 Melhor jogador — ${a.leagueName}`);
    give(a.top, `👟 Artilheiro — ${a.leagueName}`);
    give(a.young, `🌟 Melhor jovem — ${a.leagueName}`);
    give(a.gk, `🧤 Melhor goleiro — ${a.leagueName}`);
  }
  if (world[0]) give(world[0], '🌍 MELHOR DO MUNDO');
  if (world[1]) give(world[1], '🥈 2º no Melhor do Mundo');
  if (world[2]) give(world[2], '🥉 3º no Melhor do Mundo');
}

// "Corrida" ao vivo durante a temporada (para a tela de prêmios)
export function awardsRace(game, leagueId, tableIds, roundsPlayed) {
  const l = game.leagues.find(x => x.id === leagueId);
  const league = leagueAwards(game, l, tableIds, roundsPlayed);
  const champs = {};
  const world = worldAwards(game, titleBonus(game, champs), game.round + 1);
  return { league, world };
}
