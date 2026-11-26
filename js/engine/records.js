// =============================================================
// records.js — HISTÓRICO E RECORDES
// =============================================================
// Guarda só o que acontece nos jogos do USUÁRIO (para o save não
// crescer): artilheiros de todos os tempos do clube, maior goleada,
// pior derrota, sequências e os recordes pessoais do técnico.
// =============================================================

const blank = () => ({ games: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, players: {}, bestWin: null, worstLoss: null, unb: 0, unbBest: 0, wins: 0, winsBest: 0 });

export function clubRecord(game, clubId) {
  game.records = game.records || {};
  return game.records[clubId] || (game.records[clubId] = blank());
}
export function coachRecord(game) {
  return game.coachRec || (game.coachRec = blank());
}

function apply(r, game, gf, ga, opp, comp) {
  r.games++; r.gf += gf; r.ga += ga;
  if (gf > ga) r.w++; else if (gf === ga) r.d++; else r.l++;
  const tag = { gf, ga, opp, season: game.season, comp };
  if (gf > ga && (!r.bestWin || gf - ga > r.bestWin.gf - r.bestWin.ga || (gf - ga === r.bestWin.gf - r.bestWin.ga && gf > r.bestWin.gf))) r.bestWin = tag;
  if (gf < ga && (!r.worstLoss || ga - gf > r.worstLoss.ga - r.worstLoss.gf)) r.worstLoss = tag;
  r.unb = gf >= ga ? r.unb + 1 : 0; r.unbBest = Math.max(r.unbBest, r.unb);
  r.wins = gf > ga ? r.wins + 1 : 0; r.winsBest = Math.max(r.winsBest, r.wins);
}

// Chamado depois de cada jogo do usuário
export function recordMatch(game, m) {
  const i = m.teams.findIndex(t => t.club.id === game.userClubId);
  if (i < 0) return;
  const t = m.teams[i], o = m.teams[1 - i];
  const comp = m.cupName || 'Liga';
  const cr = clubRecord(game, t.club.id);
  apply(cr, game, t.goals, o.goals, o.club.name, comp);
  if (game.coach && !game.coach.fired) apply(coachRecord(game), game, t.goals, o.goals, o.club.name, comp);
  // Jogadores: [nome, gols, jogos, assistências]
  for (const id of t.used) {
    const p = game.players[id];
    if (!p) continue;
    const e = cr.players[id] || (cr.players[id] = [p.name, 0, 0, 0]);
    e[0] = p.name; e[2]++;
  }
  for (const s of t.scorers) {
    if (cr.players[s.id]) cr.players[s.id][1]++;
    if (s.assist && cr.players[s.assist]) cr.players[s.assist][3]++;
  }
}

// Listas ordenadas para a tela
export function topList(r, idx, n = 10) {
  return Object.entries(r.players).map(([id, e]) => ({ id, name: e[0], g: e[1], j: e[2], a: e[3] }))
    .filter(x => (idx === 1 ? x.g : idx === 3 ? x.a : x.j) > 0)
    .sort((a, b) => (idx === 1 ? b.g - a.g || a.j - b.j : idx === 3 ? b.a - a.a : b.j - a.j)).slice(0, n);
}
