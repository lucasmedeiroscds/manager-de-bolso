// =============================================================
// modes.js — DIFICULDADE e MODO DESAFIO
// =============================================================
import { clamp } from '../util.js';
import { clubById } from './market.js';
import { zoneSizes } from './divisions.js';

// ---------- Dificuldade ----------
export const DIFFS = {
  facil:   { name: 'Fácil',   budget: 1.6, gain: 1.25, pain: 0.7,  price: 0.9,  desc: 'Mais dinheiro, diretoria paciente, reforços mais baratos.' },
  normal:  { name: 'Normal',  budget: 1.0, gain: 1.0,  pain: 1.0,  price: 1.0,  desc: 'O jogo como foi pensado.' },
  dificil: { name: 'Difícil', budget: 0.6, gain: 0.8,  pain: 1.35, price: 1.12, desc: 'Pouco dinheiro, diretoria exigente, mercado caro.' }
};
export const diffOf = game => DIFFS[(game && game.difficulty) || 'normal'] || DIFFS.normal;

export function applyDifficulty(game, key) {
  game.difficulty = DIFFS[key] ? key : 'normal';
  const uc = clubById(game, game.userClubId);
  uc.budget = Math.round(uc.budget * diffOf(game).budget / 10000) * 10000;
}

// ---------- Desafios ----------
// pick(db) devolve o clube; setup(game) ajusta; goal(game) define a meta
const BR = db => db.leagues.find(l => l.country === 'Brasil');
const ENG = db => db.leagues.find(l => l.country === 'Inglaterra');
const byRep = (db, L) => L.clubIds.map(id => db.clubs.find(c => c.id === id)).filter(Boolean).sort((a, b) => a.rep - b.rep);
const leagueOf = (game, id) => game.leagues.find(l => l.clubIds.includes(id));

export const CHALLENGES = [
  { id: 'fuga', emoji: '🆘', name: 'Fuga do rebaixamento', desc: 'Assuma o time mais fraco do Brasileirão, com metade do dinheiro, e escape da degola.',
    pick: db => { const L = BR(db); return L && byRep(db, L)[0]; },
    setup: g => { const c = clubById(g, g.userClubId); c.budget = Math.round(c.budget * 0.5); },
    goal: g => { const L = leagueOf(g, g.userClubId), zs = zoneSizes(g, L.id), n = L.clubIds.length; const max = n - (zs && zs.relegate ? zs.relegate : Math.ceil(n / 5)); return { type: 'pos', max, text: `Terminar em ${max}º ou melhor (${L.name})` }; } },
  { id: 'gigante', emoji: '🔥', name: 'Gigante em crise', desc: 'O maior clube do Brasil está endividado e a torcida, revoltada. Só o título salva.',
    pick: db => { const L = BR(db); return L && byRep(db, L).pop(); },
    setup: g => { const c = clubById(g, g.userClubId); c.budget = -Math.round(Math.abs(c.budget) * 0.4); g.coach.board = 40; g.coach.fans = 30; },
    goal: g => ({ type: 'pos', max: 1, text: `Ser campeão (${leagueOf(g, g.userClubId).name})` }) },
  { id: 'davi', emoji: '🪨', name: 'Davi contra Golias', desc: 'O time mais modesto da Premier League. Termine na metade de cima da tabela.',
    pick: db => { const L = ENG(db); return L && byRep(db, L)[0]; },
    setup: () => {},
    goal: g => { const L = leagueOf(g, g.userClubId), max = Math.floor(L.clubIds.length / 2); return { type: 'pos', max, text: `Terminar em ${max}º ou melhor (${L.name})` }; } },
  { id: 'cofre', emoji: '💸', name: 'Cofre vazio', desc: 'Um time do meio da tabela do Brasileirão sem nenhum dinheiro em caixa. Termine no G6 sem fechar no vermelho.',
    pick: db => { const L = BR(db); if (!L) return null; const r = byRep(db, L); return r[Math.floor(r.length / 2)]; },
    setup: g => { clubById(g, g.userClubId).budget = 0; },
    goal: () => ({ type: 'pos', max: 6, cash: true, text: 'Terminar entre os 6 primeiros com o caixa positivo' }) }
];

export function challengeClub(db, id) {
  const ch = CHALLENGES.find(c => c.id === id);
  return ch && db && db.leagues ? ch.pick(db) : null;
}

export function applyChallenge(game, id) {
  const ch = CHALLENGES.find(c => c.id === id);
  ch.setup(game);
  const goal = ch.goal(game);
  game.challenge = { id, name: ch.name, emoji: ch.emoji, goal, season: game.season, result: null };
  game.coach.board = clamp(game.coach.board, 0, 100);
}

// Fim de temporada: confere a meta. Devolve mensagem (ou null)
export function checkChallenge(game, summary) {
  const ch = game.challenge;
  if (!ch || ch.result || !summary || summary.season !== ch.season) return null;
  const club = clubById(game, game.userClubId);
  const fired = game.coach && game.coach.fired;
  const ok = !fired && summary.userPos <= ch.goal.max && (!ch.goal.cash || club.budget >= 0);
  ch.result = ok ? 'win' : 'fail';
  return ok ? `🏆 DESAFIO CUMPRIDO: ${ch.name}! Você terminou em ${summary.userPos}º.` : `❌ Desafio perdido: ${ch.name}. Você terminou em ${summary.userPos}º (meta: ${ch.goal.max}º ou melhor${ch.goal.cash ? ' com caixa positivo' : ''}).`;
}
export function failChallengeIfFired(game) {
  const ch = game.challenge;
  if (ch && !ch.result && game.coach && game.coach.fired) { ch.result = 'fail'; return `❌ Desafio perdido: ${ch.name}. Você foi demitido.`; }
  return null;
}
