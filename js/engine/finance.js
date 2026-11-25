// =============================================================
// finance.js — receitas e despesas dos clubes
// =============================================================
import { clamp, rnd } from '../util.js';
import { clubPlayers } from './tactics.js';
import { clubById } from './market.js';

// Folha salarial semanal do clube (emprestados: quem paga é o clube onde estão jogando)
export function weeklyWages(game, clubId) {
  return clubPlayers(game, clubId).reduce((s, p) => s + p.contract.wage, 0);
}

// Público de um jogo em casa: depende de torcida, preço, fase do time e rival
export function attendance(home, away, homePos, nClubs) {
  const form = 1.15 - (homePos - 1) / (nClubs - 1) * 0.4;          // time bem colocado lota mais
  const rival = 0.9 + away.rep / 500;                                // rival grande atrai público
  const priceRef = 30 + home.rep * 0.5;
  const priceEffect = clamp(Math.pow(priceRef / Math.max(home.ticketPrice, 5), 1.2), 0.2, 1.6);
  const demand = home.fans * 0.38 * form * rival * priceEffect * (0.9 + rnd() * 0.2);
  return Math.round(clamp(demand, home.stadium * 0.08, home.stadium));
}

// Registra um lançamento no extrato do clube
export function addTx(game, clubId, label, value) {
  const club = clubById(game, clubId);
  club.budget += value;
  if (clubId === game.userClubId) {
    game.ledger.unshift({ season: game.season, round: game.round, label, value });
    if (game.ledger.length > 200) game.ledger.length = 200;
  }
}

// Fecha as contas da semana (chamada a cada rodada)
// homeGames: lista de { home, away, att } dos jogos em casa nesta rodada
export function weeklyFinances(game, homeGames) {
  for (const club of game.clubs) {
    addTx(game, club.id, 'Salários', -weeklyWages(game, club.id));
    addTx(game, club.id, 'Patrocínio', club.sponsor);
  }
  for (const g of homeGames) {
    const club = clubById(game, g.home);
    addTx(game, club.id, `Bilheteria (${g.att.toLocaleString('pt-BR')} pagantes)`, g.att * club.ticketPrice);
  }
}

// Premiação de fim de temporada por posição na tabela
// scale: prêmio do campeão (ligas ricas pagam mais)
export function seasonPrize(pos, n, scale = 30e6) {
  return Math.round((scale * Math.pow((n - pos + 1) / n, 2.2) + scale * 0.07) / 100000) * 100000;
}
