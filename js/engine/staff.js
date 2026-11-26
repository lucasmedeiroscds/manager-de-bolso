// =============================================================
// staff.js — COMISSÃO TÉCNICA
// =============================================================
// 5 cargos, cada um com nível 0 (ninguém) a 3 (elite). Quanto melhor,
// mais caro o salário semanal (proporcional ao patrocínio do clube).
// =============================================================
import { addTx } from './finance.js';
import { clubById } from './market.js';

export const STAFF = [
  ['fis', '🏃', 'Preparador físico', 'Recuperação física mais rápida e menos lesões no treino.'],
  ['gol', '🧤', 'Treinador de goleiros', 'Seus goleiros evoluem mais rápido.'],
  ['med', '🩺', 'Departamento médico', 'Jogadores lesionados voltam antes.'],
  ['aux', '📋', 'Auxiliar técnico', 'Todo o elenco evolui um pouco mais rápido.'],
  ['base', '🌱', 'Coordenador da base', 'Garotos da base melhores e crescendo mais rápido.']
];
export const LEVEL_NAMES = ['Ninguém', 'Básico', 'Bom', 'Elite'];
const COST = [0, 0.025, 0.06, 0.11];   // fração do patrocínio semanal

export function staffOf(game) {
  return game.staff || (game.staff = { fis: 1, gol: 1, med: 1, aux: 0, base: 1 });
}
export function staffLevel(game, clubId, key) {
  if (clubId !== game.userClubId || game.mode === 'player') return 1;   // IA: padrão
  return staffOf(game)[key] || 0;
}
export function staffWage(game, club, lvl) {
  return Math.round((club.deal ? club.deal.base : club.sponsor) * COST[lvl] / 1000) * 1000;
}
export function staffTotal(game) {
  const club = clubById(game, game.userClubId), s = staffOf(game);
  return STAFF.reduce((t, [k]) => t + staffWage(game, club, s[k] || 0), 0);
}
export function setStaff(game, key, lvl) {
  if (lvl < 0 || lvl > 3) return { ok: false, msg: '' };
  staffOf(game)[key] = lvl;
  const name = STAFF.find(x => x[0] === key)[2];
  return { ok: true, msg: lvl ? `${name}: nível ${LEVEL_NAMES[lvl]}.` : `${name} dispensado.` };
}
export function weeklyStaff(game) {
  if (game.mode === 'player') return;
  const t = staffTotal(game);
  if (t) addTx(game, game.userClubId, 'Comissão técnica', -t);
}

// Efeitos usados pelo treino semanal (evolution.js)
export function staffFx(game, clubId) {
  const L = k => staffLevel(game, clubId, k);
  return {
    recover: (L('fis') - 1) * 2.5,
    injuryMult: 1.3 - L('fis') * 0.3,
    gkGrowth: 0.8 + L('gol') * 0.25,
    growth: 1 + (L('aux') - 1) * 0.07,
    healChance: (L('med') - 1) * 0.3     // chance extra de curar 1 semana a mais
  };
}
