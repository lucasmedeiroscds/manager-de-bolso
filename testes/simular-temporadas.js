// =============================================================
// Teste automático: simula temporadas inteiras sem interface e
// confere se os números ficam realistas (gols, pontos, finanças).
// Rodar com:  node testes/simular-temporadas.js [temporadas] [mundo|ficticio]
// =============================================================
import fs from 'node:fs';
import { generateDatabase } from '../js/data/generator.js';
import { expandWorld } from '../js/data/world.js';
import { createGame, prepareRound, finishRound, standings, totalRounds } from '../js/engine/season.js';
import { overall } from '../js/engine/ratings.js';
import { aiFillSquads, clubById } from '../js/engine/market.js';

const SEASONS = Number(process.argv[2] || 2);
const MODE = process.argv[3] || 'mundo';
const db = MODE === 'mundo'
  ? expandWorld(JSON.parse(fs.readFileSync(new URL('../data/mundo.json', import.meta.url))))
  : generateDatabase();
const userClub = MODE === 'mundo' ? db.leagues.find(l => l.id === 'BRA1').clubIds[0] : 'c10';
const t0 = Date.now();
const game = createGame(db, userClub);
console.log(`Jogo criado em ${Date.now() - t0} ms · ${game.leagues.length} ligas · ${game.clubs.length} clubes · ${Object.keys(game.players).length} jogadores`);

let falhas = 0;
function check(nome, ok, info) {
  console.log(`${ok ? '✔' : '✘'} ${nome}: ${info}`);
  if (!ok) falhas++;
}

for (let s = 0; s < SEASONS; s++) {
  let goals = 0, games = 0, homeWins = 0, draws = 0, shots = 0, cards = 0, tackles = 0;
  const rounds = totalRounds(game);
  let summary, slowest = 0;
  const watch = ['BRA1', 'GB1', 'ES1', 'MLS1'].filter(id => game.leagues.some(l => l.id === id));
  const before = Object.fromEntries(game.clubs.map(c => [c.id, c.budget]));
  let tables = {};
  const cupsThisSeason = game.cups.length;
  let cupGames = 0, pens = 0;
  for (let r = 0; r < rounds; r++) {
    const real = game.userClubId; game.userClubId = '-'; aiFillSquads(game); game.userClubId = real;
    const t1 = Date.now();
    let prep = prepareRound(game);
    // Fase de copa (meio de semana) antes da liga
    while (prep.phase === 'cup') {
      finishRound(game, prep);
      cupGames += prep.matches.length;
      pens += prep.matches.filter(m => m.pens).length;
      prep = prepareRound(game);
    }
    if (r === rounds - 1) for (const id of watch) tables[id] = standings(game, id); // antes de virar a temporada
    for (const m of prep.matches) m.runToEnd();
    const out = finishRound(game, prep);
    slowest = Math.max(slowest, Date.now() - t1);
    for (const m of prep.matches) {
      const [h, a] = m.teams;
      goals += h.goals + a.goals; games++;
      if (h.goals > a.goals) homeWins++; else if (h.goals === a.goals) draws++;
      shots += h.stats.shots + a.stats.shots;
      cards += h.stats.yellow + a.stats.yellow;
      tackles += h.stats.tackles + a.stats.tackles;
    }
    if (out.seasonEnd) summary = out.seasonEnd;
  }
  console.log(`\n=== Temporada ${summary.season} · semana mais lenta: ${slowest} ms`);
  for (const id of watch) console.log(`  ${id}: campeão ${summary.champions[id]}`);
  const aw = game.awards[0];
  for (const id of watch) { const a = aw.leagues[id]; if (a) console.log(`  🏅 ${id}: MVP ${a.mvp.name} (${a.mvp.club}, nota ${a.mvp.avg}) · artilheiro ${a.top.name} ${a.top.lg} · jovem ${a.young ? a.young.name : '-'} · goleiro ${a.gk ? a.gk.name : '-'}`); }
  console.log('  🌍 Melhor do Mundo:', aw.world.slice(0, 5).map((e, i) => `${i + 1}º ${e.name} (${e.club}, ${e.avg})`).join(' · '));
  check('Premiação gerada para todas as ligas', Object.keys(aw.leagues).length === game.leagues.length && aw.world.length === 10, `${Object.keys(aw.leagues).length} ligas`);
  const cc = Object.values(summary.cupChampions);
  console.log('  Copas:', cc.filter(c => !c.name.startsWith('Copa nacional')).map(c => `${c.name}: ${c.club}`).join(' · '));
  check('Todas as copas terminaram com campeão', cc.length === cupsThisSeason + (cc.some(c => c.name === 'Mundial de Clubes') ? 1 : 0), `${cc.length} campeões · ${cupGames} jogos de copa · ${pens} nos pênaltis`);
  const gpg = goals / games;
  check('Gols por jogo (real ~2,4–2,9)', gpg > 2.1 && gpg < 3.2, gpg.toFixed(2));
  check('Vitórias do mandante (~40–50%)', homeWins / games > 0.36 && homeWins / games < 0.56, (100 * homeWins / games).toFixed(0) + '%');
  check('Empates (~22–30%)', draws / games > 0.17 && draws / games < 0.34, (100 * draws / games).toFixed(0) + '%');
  check('Finalizações por jogo (~20–28)', shots / games > 16 && shots / games < 32, (shots / games).toFixed(1));
  check('Desarmes por jogo (~15–40)', tackles / games > 10 && tackles / games < 45, (tackles / games).toFixed(1));
  check('Amarelos por jogo (~3–5)', cards / games > 2.5 && cards / games < 6, (cards / games).toFixed(1));
  check('Semana simulada em menos de 2,5 s', slowest < 2500, slowest + ' ms');
  const broke = game.clubs.filter(c => c.budget < -Math.abs(before[c.id]) - 5e6).length;
  check('Poucos clubes quebrados (<15%)', broke / game.clubs.length < 0.15, `${broke} de ${game.clubs.length}`);
  const rich = game.clubs.slice().sort((a, b) => b.budget - a.budget).slice(0, 3).map(c => `${c.name} ${(c.budget / 1e6).toFixed(0)}mi`);
  console.log('  Mais ricos:', rich.join(', '));
}

const ps = Object.values(game.players).filter(p => p.clubId);
const avg = ps.reduce((s, p) => s + overall(p), 0) / ps.length;
console.log(`Overall médio: ${avg.toFixed(1)} · jogadores: ${Object.keys(game.players).length} · fictícios gerados: ${ps.filter(p => p.fictional).length}`);
const sizes = game.clubs.filter(c => c.id !== game.userClubId).map(c => ps.filter(p => p.clubId === c.id).length);
check('Elencos da IA com 20–34 jogadores', sizes.every(n => n >= 20 && n <= 34), `${Math.min(...sizes)}–${Math.max(...sizes)}`);
const save = JSON.stringify(game).length / 1024 / 1024;
check('Jogo salvo com menos de 15 MB', save < 15, save.toFixed(1) + ' MB');
console.log(falhas ? `\n${falhas} verificação(ões) fora do esperado.` : '\nTudo dentro do esperado!');
process.exit(falhas ? 1 : 0);
