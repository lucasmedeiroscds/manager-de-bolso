// =============================================================
// academy.js — CATEGORIAS DE BASE
// =============================================================
// O clube do usuário tem uma base (nível 1 a 5). Todo começo de
// temporada chegam garotos (FICTÍCIOS) de 15–17 anos. Eles crescem
// na base toda semana; você promove ao time principal ou dispensa.
// Quem faz 19 anos na base precisa ser promovido, senão vai embora.
// =============================================================
import { rnd, randInt } from '../util.js';
import { overall, marketValue, wageDemand } from './ratings.js';
import { youthIntake } from '../data/generator.js';
import { addTx } from './finance.js';
import { clubById } from './market.js';
import { staffLevel } from './staff.js';
import { touchPlayers } from './tactics.js';

export const ACAD_MAX = 5;
export function academyOf(game) {
  return game.academy || (game.academy = { level: 1, kids: [], promoted: [] });
}
// Primeira turma (jogo novo ou save antigo)
export function ensureAcademy(game) {
  const a = academyOf(game);
  if (!a.started && game.mode !== 'player') { a.started = true; newIntake(game); }
  return a;
}
// custo para subir de nível (fração do patrocínio semanal × semanas)
export function upgradeCost(game) {
  const a = academyOf(game), club = clubById(game, game.userClubId);
  const weekly = club.deal ? club.deal.base : club.sponsor;
  return Math.round(weekly * [0, 6, 12, 20, 32][a.level] / 10000) * 10000;
}
export function upgradeAcademy(game) {
  const a = academyOf(game), club = clubById(game, game.userClubId);
  if (a.level >= ACAD_MAX) return { ok: false, msg: 'A base já está no nível máximo.' };
  const cost = upgradeCost(game);
  if (club.budget < cost) return { ok: false, msg: 'Dinheiro insuficiente para a obra.' };
  addTx(game, club.id, `Obras na base (nível ${a.level + 1})`, -cost);
  a.level++;
  return { ok: true, msg: `Base melhorada para o nível ${a.level}! Os próximos garotos vão chegar melhores.` };
}

// Nova turma (chamada no fim de temporada, no lugar da base padrão)
export function newIntake(game) {
  const a = academyOf(game), club = clubById(game, game.userClubId);
  const coord = staffLevel(game, club.id, 'base');
  const n = 3 + Math.floor(a.level / 2);
  const fake = { ...club, rep: club.rep + a.level * 6 + coord * 4 };
  const kids = youthIntake(rnd, fake, 0, n);
  for (const k of kids) {
    k.id = 'g' + (game.nextPlayerId++);
    k.age = randInt(15, 17);
    k.clubId = null;
    k.potential = Math.min(94, k.potential + randInt(0, a.level * 2));
    for (const key in k.attrs) k.attrs[key] = Math.max(15, k.attrs[key] - 6);   // ainda crus
    k.value = marketValue(k);
    a.kids.push(k);
  }
  return kids;
}

// Crescimento semanal dos garotos
export function weeklyAcademy(game) {
  if (game.mode === 'player') return;
  const a = ensureAcademy(game);
  const coord = staffLevel(game, game.userClubId, 'base');
  const ch = 0.28 + a.level * 0.04 + coord * 0.05;
  for (const k of a.kids) {
    if (overall(k) >= k.potential || rnd() > ch) continue;
    const keys = Object.keys(k.attrs).filter(x => x !== 'gk' || k.pos === 'GOL');
    const key = keys[Math.floor(rnd() * keys.length)];
    k.attrs[key] = Math.min(99, k.attrs[key] + 1);
    if (overall(k) > k.potential) k.attrs[key]--;
  }
}

// Fim de temporada: idade, saídas e nova turma. Devolve mensagens.
export function seasonAcademy(game) {
  const a = academyOf(game), msgs = [];
  a.started = true;
  for (const k of a.kids) k.age++;
  const gone = a.kids.filter(k => k.age >= 19);
  if (gone.length) msgs.push(`🌱 Deixaram a base sem chance no time principal: ${gone.map(k => k.name).join(', ')}.`);
  a.kids = a.kids.filter(k => k.age < 19);
  const fresh = newIntake(game);
  const best = fresh.slice().sort((x, y) => y.potential - x.potential)[0];
  msgs.push(`🌱 Nova turma na base: ${fresh.length} garotos.${best ? ` Destaque: ${best.name} (${best.pos}, potencial ${best.potential}).` : ''} Veja em Elenco → Base e comissão.`);
  return msgs;
}

export function promoteKid(game, id) {
  const a = academyOf(game);
  const k = a.kids.find(x => x.id === id);
  if (!k) return { ok: false, msg: '' };
  a.kids = a.kids.filter(x => x !== k);
  k.clubId = game.userClubId;
  k.contract = { wage: Math.round(wageDemand(k) * 0.5 / 100) * 100, years: 3 };
  k.fromAcademy = true;
  game.players[k.id] = k;
  a.promoted.push({ id: k.id, season: game.season });
  touchPlayers(game);
  return { ok: true, msg: `⬆️ ${k.name} foi promovido ao time principal!` };
}
export function releaseKid(game, id) {
  const a = academyOf(game);
  const k = a.kids.find(x => x.id === id);
  a.kids = a.kids.filter(x => x.id !== id);
  return { ok: !!k, msg: k ? `${k.name} foi dispensado da base.` : '' };
}
