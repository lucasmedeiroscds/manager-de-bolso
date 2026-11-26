// =============================================================
// achievements.js — CONQUISTAS
// =============================================================
// Medalhas desbloqueadas ao longo da carreira (técnico ou jogador).
// checkAchievements() é chamado depois de cada semana e devolve as
// conquistas novas, para o aviso na tela.
// =============================================================
import { coachRecord } from './records.js';
import { overall } from './ratings.js';
import { callUp } from './nations.js';

const h2hWins = g => Object.values(g.h2h || {}).reduce((s, r) => s + r.w, 0);
const titles = g => (g.coach && g.coach.trophies ? g.coach.trophies.length : 0);
const hist = g => g.history || [];
const pcP = g => g.pc && g.players[g.pc.id];

// [id, emoji, nome, descrição, modo ('coach'|'player'), teste]
export const LIST = [
  ['firstWin', '✅', 'Primeira vitória', 'Vença o primeiro jogo no comando.', 'coach', g => coachRecord(g).w >= 1],
  ['games100', '📋', 'Centenário', 'Comande 100 jogos.', 'coach', g => coachRecord(g).games >= 100],
  ['wins50', '💪', 'Vencedor', 'Some 50 vitórias como técnico.', 'coach', g => coachRecord(g).w >= 50],
  ['wins200', '🦁', 'Lenda do banco', 'Some 200 vitórias como técnico.', 'coach', g => coachRecord(g).w >= 200],
  ['rout', '🔥', 'Atropelo', 'Vença um jogo por 5 gols de diferença.', 'coach', g => { const b = coachRecord(g).bestWin; return !!b && b.gf - b.ga >= 5; }],
  ['streak5', '📈', 'Embalado', 'Vença 5 jogos seguidos.', 'coach', g => coachRecord(g).winsBest >= 5],
  ['unb15', '🛡️', 'Muralha', 'Fique 15 jogos sem perder.', 'coach', g => coachRecord(g).unbBest >= 15],
  ['derby', '⚔️', 'Dono do clássico', 'Vença um clássico.', 'coach', g => h2hWins(g) >= 1],
  ['derby10', '👑', 'Rei dos clássicos', 'Vença 10 clássicos.', 'coach', g => h2hWins(g) >= 10],
  ['title1', '🏆', 'Primeiro título', 'Ganhe o primeiro troféu.', 'coach', g => titles(g) >= 1],
  ['title5', '🏆', 'Colecionador', 'Ganhe 5 troféus.', 'coach', g => titles(g) >= 5],
  ['title10', '💎', 'Dinastia', 'Ganhe 10 troféus.', 'coach', g => titles(g) >= 10],
  ['league', '🥇', 'Campeão da liga', 'Termine a liga em 1º lugar.', 'coach', g => hist(g).some(h => h.userPos === 1)],
  ['leagueB', '🚀', 'Campeão da Série B', 'Seja campeão de uma segunda divisão.', 'coach', g => hist(g).some(h => h.userPos === 1 && h.tier === 2)],
  ['unbeaten', '🧱', 'Invicto na temporada', 'Termine uma liga sem nenhuma derrota.', 'coach', g => hist(g).some(h => h.userLost === 0)],
  ['double', '✌️', 'Dobradinha', 'Ganhe a liga e uma copa na mesma temporada.', 'coach', g => hist(g).some(h => h.userPos === 1 && h.userCups && h.userCups.length)],
  ['legend', '🗿', 'Ídolo eterno', 'Tenha um jogador eleito lenda do clube.', 'coach', g => Object.values(g.legends || {}).some(l => l.length)],
  ['academy', '🌱', 'Cria da casa', 'Promova um garoto da base.', 'coach', g => !!(g.academy && g.academy.promoted.length)],
  ['seasons5', '📅', 'Veterano', 'Complete 5 temporadas.', 'coach', g => hist(g).length >= 5],
  // modo jogador
  ['pcDebut', '👟', 'Estreia', 'Entre em campo pela primeira vez.', 'player', g => pcP(g).apps >= 1],
  ['pcGoal', '⚽', 'Primeiro gol', 'Marque o primeiro gol como profissional.', 'player', g => pcP(g).goals >= 1],
  ['pcGoals50', '🎯', 'Goleador', 'Marque 50 gols na carreira.', 'player', g => pcP(g).goals >= 50],
  ['pcGoals100', '💯', 'Cem gols', 'Marque 100 gols na carreira.', 'player', g => pcP(g).goals >= 100],
  ['pcApps100', '📋', '100 jogos', 'Chegue a 100 jogos na carreira.', 'player', g => pcP(g).apps >= 100],
  ['pcStarter', '🧑‍✈️', 'Titular absoluto', 'Ganhe a vaga de titular.', 'player', g => g.pc.role === 'Titular'],
  ['pcOvr75', '⭐', 'Craque em formação', 'Chegue a força 75.', 'player', g => overall(pcP(g)) >= 75],
  ['pcOvr85', '🌟', 'Estrela', 'Chegue a força 85.', 'player', g => overall(pcP(g)) >= 85],
  ['pcMove', '✈️', 'Transferência', 'Troque de clube.', 'player', g => g.pc.startClub && pcP(g).clubId !== g.pc.startClub],
  ['pcNation', '🧢', 'Convocado', 'Seja convocado pela seleção.', 'player', g => { const p = pcP(g); return !!p.nat && callUp(g, p.nat).some(x => x.id === p.id); }],
  ['pcTrophy', '🏅', 'Premiado', 'Ganhe um título ou prêmio.', 'player', g => (pcP(g).trophies || []).length >= 1]
];

const modeOf = g => g.mode === 'player' ? 'player' : 'coach';

export function achList(game) {
  const got = game.ach || {};
  return LIST.filter(a => a[4] === modeOf(game)).map(([id, emoji, name, desc]) => ({ id, emoji, name, desc, got: got[id] || null }));
}

// Confere e marca as novas. Devolve [{ emoji, name }]
export function checkAchievements(game) {
  game.ach = game.ach || {};
  if (game.mode === 'player' && game.pc && !game.pc.startClub) game.pc.startClub = pcP(game).clubId;
  const fresh = [];
  for (const [id, emoji, name, , mode, test] of LIST) {
    if (mode !== modeOf(game) || game.ach[id]) continue;
    let ok = false;
    try { ok = test(game); } catch { ok = false; }
    if (ok) { game.ach[id] = { season: game.season }; fresh.push({ emoji, name }); }
  }
  return fresh;
}
