// =============================================================
// stadium.js — ESTÁDIO, TORCIDA E PATROCÍNIO (clube do usuário)
// =============================================================
// - Ampliação do estádio: paga na hora, fica pronta depois de algumas
//   semanas de obra. Só vale a pena se o estádio costuma lotar.
// - Torcida cresce com vitórias e boas campanhas, e encolhe com derrotas.
// - Patrocinador: a cada temporada você escolhe um entre 3 contratos
//   (fixo, por vitória ou por ambição/colocação).
// =============================================================
import { addTx } from './finance.js';
import { clamp } from '../util.js';

export const EXPANSIONS = [
  { seats: 2000, weeks: 4, label: 'Arquibancada extra' },
  { seats: 5000, weeks: 9, label: 'Novo setor' },
  { seats: 12000, weeks: 18, label: 'Grande reforma' }
];
export const MAX_STADIUM = 90000;

export const seatCost = club => Math.round(1200 * (1 + club.rep / 200));
export const expansionCost = (club, e) => e.seats * seatCost(club);

export function startExpansion(game, club, i) {
  const e = EXPANSIONS[i];
  if (!e) return { ok: false, msg: 'Opção inválida.' };
  if (club.build) return { ok: false, msg: 'Já existe uma obra em andamento.' };
  if (club.stadium + e.seats > MAX_STADIUM) return { ok: false, msg: 'O estádio já está no tamanho máximo.' };
  const cost = expansionCost(club, e);
  if (club.budget < cost) return { ok: false, msg: 'Dinheiro insuficiente para a obra.' };
  addTx(game, club.id, `Obra no estádio (+${e.seats.toLocaleString('pt-BR')} lugares)`, -cost);
  club.build = { seats: e.seats, weeksLeft: e.weeks, total: e.weeks };
  return { ok: true, msg: `Obra iniciada! Fica pronta em ${e.weeks} semanas.` };
}

// Toda semana: avança a obra
export function weeklyStadium(game, club) {
  const msgs = [];
  if (club.build) {
    club.build.weeksLeft--;
    if (club.build.weeksLeft <= 0) {
      club.stadium += club.build.seats;
      msgs.push(`🏟️ Obra concluída! O estádio agora tem ${club.stadium.toLocaleString('pt-BR')} lugares.`);
      delete club.build;
    }
  }
  return msgs;
}

// Ocupação média dos últimos jogos em casa (o registro é feito nas finanças)
export function occupancy(club) {
  const l = club.attLog || [];
  if (!l.length) return null;
  return l.reduce((s, x) => s + x.att / x.cap, 0) / l.length;
}

// ---------- Patrocínio ----------
const NAMES = ['Banco Horizonte', 'TecnoGol', 'Bebidas Tropical', 'Seguros Aliança', 'Rede Vitória Telecom', 'Construtora Pilar', 'Moda Arena', 'Energia Sul'];
export function sponsorOffers(game, club) {
  const s = club.sponsor || 50000;
  const r = k => Math.round(s * k / 1000) * 1000;
  const seed = (game.season * 7 + String(club.id).length) % NAMES.length;
  const n = i => NAMES[(seed + i * 3) % NAMES.length];
  return [
    { id: 'fixo', name: n(0), base: r(1.0), win: 0, top: 0, topN: 0, desc: 'Valor fixo toda semana, sem surpresas.' },
    { id: 'vitoria', name: n(1), base: r(0.65), win: r(1.0), top: 0, topN: 0, desc: 'Fixo menor + bônus a cada vitória.' },
    { id: 'ambicao', name: n(2), base: r(0.5), win: r(0.55), top: r(22), topN: 4, desc: 'Fixo baixo + bônus por vitória + prêmio grande se terminar no G4 da liga.' }
  ];
}
export function signSponsor(game, club, id) {
  const o = sponsorOffers(game, club).find(x => x.id === id);
  if (!o) return null;
  club.deal = { ...o, season: game.season };
  return o;
}
// Valor fixo semanal (usado pelas finanças)
export const weeklySponsor = club => club.deal ? club.deal.base : club.sponsor;

// Depois de cada jogo do usuário: bônus por vitória e torcida
export function afterMatchClub(game, m) {
  const msgs = [];
  const i = m.teams.findIndex(t => t.club.id === game.userClubId);
  if (i < 0) return msgs;
  const club = m.teams[i].club;
  const w = m.winnerIndex();
  if (w === i && club.deal && club.deal.win) addTx(game, club.id, `Bônus por vitória (${club.deal.name})`, club.deal.win);
  // Torcida: vitória anima, derrota afasta um pouco
  club.fans = Math.round(club.fans * (w === i ? 1.004 : w === -1 ? 1.0005 : 0.997));
  return msgs;
}

// Fim de temporada: prêmio do patrocinador, torcida pela campanha e fim do contrato
export function seasonEndClub(game, club, pos, n) {
  const msgs = [];
  if (club.deal && club.deal.top && pos <= club.deal.topN) {
    addTx(game, club.id, `Prêmio do patrocinador (${club.deal.name}) — ${pos}º lugar`, club.deal.top);
    msgs.push(`💰 ${club.deal.name} pagou o prêmio por terminar no G${club.deal.topN}!`);
  }
  const k = clamp(1.08 - (pos - 1) / Math.max(1, n - 1) * 0.14, 0.94, 1.08);
  club.fans = Math.round(club.fans * k);
  msgs.push(k >= 1 ? `📈 A boa campanha atraiu novos torcedores (+${Math.round((k - 1) * 100)}%).` : `📉 A campanha fraca afastou parte da torcida (${Math.round((k - 1) * 100)}%).`);
  if (club.deal) { delete club.deal; msgs.push('🤝 O contrato de patrocínio terminou. Escolha o novo patrocinador em Finanças.'); }
  return msgs;
}
