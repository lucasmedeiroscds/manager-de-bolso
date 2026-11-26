// =============================================================
// ranking.js — RANKING MUNDIAL DE TÉCNICOS
// =============================================================
// Os técnicos da IA não têm nome no banco (não inventamos), então
// aparecem como "Técnico do <clube>". Você aparece com o seu nome.
// Pontos por temporada: posição na liga (pesada pela força da liga)
// e títulos. Os pontos antigos valem menos a cada ano (×0,6).
// =============================================================
import { clubById } from './market.js';

function leagueWeight(game, L) {
  const reps = L.clubIds.map(id => clubById(game, id)).filter(Boolean).map(c => c.rep).sort((a, b) => b - a).slice(0, 6);
  const avg = reps.reduce((s, x) => s + x, 0) / (reps.length || 1);
  return Math.max(0.2, (avg - 40) / 35) * (L.tier === 2 ? 0.5 : 1);
}

export function rankingOf(game) {
  if (!game.coachRank) {
    // ponto de partida: força dos clubes (até a 1ª temporada terminar)
    const r = {};
    for (const c of game.clubs) if (c.rep >= 60 && c.id !== game.userClubId) r['c:' + c.id] = Math.round((c.rep - 55) * 1.2);
    r.me = game.coach ? Math.round(game.coach.rep / 4) : 0;
    game.coachRank = r;
  }
  return game.coachRank;
}

// Chamado no fim da temporada (antes de as tabelas zerarem)
export function updateRanking(game) {
  const r = rankingOf(game);
  for (const k in r) r[k] = Math.round(r[k] * 0.6 * 10) / 10;
  const meClub = game.coach && !game.coach.fired ? game.userClubId : null;
  const add = (clubId, pts) => { const k = clubId === meClub ? 'me' : 'c:' + clubId; r[k] = Math.round(((r[k] || 0) + pts) * 10) / 10; };
  for (const L of game.leagues) {
    const tab = game.lastTables && game.lastTables[L.id];
    if (!tab) continue;
    const n = tab.length, wgt = leagueWeight(game, L);
    tab.forEach((id, i) => { const pts = wgt * ((n - 1 - i) / (n - 1) * 10 + (i === 0 ? 8 : 0)); if (pts >= 0.5) add(id, pts); });
  }
  for (const cup of game.cups || []) {
    if (!cup.champion) continue;
    add(cup.champion, cup.type === 'world' ? 18 : cup.type === 'continental' ? ((cup.tier || 1) === 1 ? 14 : 7) : 5);
  }
  // corta a cauda (só os 300 melhores ficam guardados)
  const keep = Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 300);
  if (!keep.some(([k]) => k === 'me')) keep.push(['me', r.me || 0]);
  game.coachRank = Object.fromEntries(keep);
}

export function rankingList(game) {
  const r = rankingOf(game);
  return Object.entries(r).sort((a, b) => b[1] - a[1]).map(([k, pts], i) => {
    if (k === 'me') return { pos: i + 1, me: true, pts, name: game.coach ? game.coach.name : 'Você', club: game.coach && !game.coach.fired ? clubById(game, game.userClubId) : null };
    const club = clubById(game, k.slice(2));
    return club ? { pos: i + 1, pts, name: `Técnico do ${club.name}`, club } : null;
  }).filter(Boolean);
}
