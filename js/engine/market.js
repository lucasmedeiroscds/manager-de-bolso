// =============================================================
// market.js — compras, vendas, empréstimos e propostas da IA
// =============================================================
import { rnd, randInt, pick, clamp, newId, money } from '../util.js';
import { overall, wageDemand } from './ratings.js';
import { clubPlayers, touchPlayers, setClub } from './tactics.js';

// Muda o jogador de clube (e avisa o índice clube → jogadores)
function move(game, p, clubId) { setClub(game, p, clubId); }
import { addTx } from './finance.js';
import { makePlayer } from '../data/generator.js';

export const MAX_SQUAD = 32;
export const MIN_SQUAD = 16;

// Janelas de transferência: antes da rodada 6 e entre as rodadas 19 e 24
export function windowOpen(game) {
  return game.round < 5 || (game.round >= 18 && game.round < 23);
}

// Busca rápida de clube pelo id (com ~500 clubes, "find" toda hora fica lento)
const CLUB_MAP = new WeakMap();
export function clubById(game, id) {
  let m = CLUB_MAP.get(game.clubs);
  if (!m || m.size !== game.clubs.length) { m = new Map(game.clubs.map(c => [c.id, c])); CLUB_MAP.set(game.clubs, m); }
  return m.get(id);
}

// O jogador é peça importante no clube? (está entre os 13 melhores)
function isKeyPlayer(game, p) {
  if (!p.clubId) return false;
  const sorted = clubPlayers(game, p.clubId).sort((a, b) => overall(b) - overall(a));
  return sorted.indexOf(p) < 13;
}

// Preço que o clube dono pede
export function askingPrice(game, p) {
  if (!p.clubId) return 0;                          // agente livre: sem taxa
  let v = p.value * (isKeyPlayer(game, p) ? 1.35 : 1.05);
  if (p.contract.years <= 1) v *= 0.75;             // contrato acabando: mais barato
  if (p.listed) v *= 0.9;
  return Math.round(v / 10000) * 10000;
}

// Salário que o jogador pede para assinar com o clube
export function wageAsk(game, p, club) {
  const base = Math.max(wageDemand(p), p.contract.wage);
  const from = p.clubId ? clubById(game, p.clubId) : null;
  const factor = from && club.rep < from.rep ? 1.25 : 1.1; // ir para clube menor custa mais
  return Math.round(base * factor / 100) * 100;
}

// ---------- Ações do usuário ----------
// Todas devolvem { ok: true/false, msg: 'texto' }

export function buyPlayer(game, p, offer) {
  const user = clubById(game, game.userClubId);
  if (!windowOpen(game)) return { ok: false, msg: 'A janela de transferências está fechada.' };
  if (clubPlayers(game, user.id).length >= MAX_SQUAD) return { ok: false, msg: `Elenco cheio (máx. ${MAX_SQUAD}).` };
  if (p.loan) return { ok: false, msg: 'Jogador emprestado não pode ser negociado agora.' };
  const ask = askingPrice(game, p);
  const wage = wageAsk(game, p, user);
  const signing = p.clubId ? 0 : wage * 4; // luvas para agente livre
  const total = (p.clubId ? offer : 0) + signing;
  if (user.budget < total) return { ok: false, msg: `Dinheiro insuficiente. Você precisa de ${money(total)}.` };
  if (p.clubId && offer < ask) {
    if (offer >= ask * 0.85) return { ok: false, msg: `O ${clubById(game, p.clubId).name} recusou, mas aceitaria ${money(ask)}.`, counter: ask };
    return { ok: false, msg: `Proposta recusada. O clube pede cerca de ${money(ask)}.` };
  }
  // Jogador recusa clube com reputação muito menor (às vezes)
  const from = p.clubId ? clubById(game, p.clubId) : null;
  if (from && from.rep - user.rep > 12 && rnd() < 0.6) {
    return { ok: false, msg: `${p.name} não quer se transferir para um clube menor.` };
  }
  if (from) {
    addTx(game, user.id, `Compra de ${p.name}`, -offer);
    addTx(game, from.id, `Venda de ${p.name}`, offer);
  }
  if (signing) addTx(game, user.id, `Luvas de ${p.name}`, -signing);
  move(game, p, user.id);
  p.contract = { wage, years: 3 };
  p.listed = false;
  p.moral = 75;
  news(game, `${user.name} contrata ${p.name}${from ? ` do ${from.name} por ${money(offer)}` : ' (estava sem clube)'}.`);
  return { ok: true, msg: `${p.name} é o novo reforço! Salário: ${money(wage)}/sem.` };
}

export function loanIn(game, p) {
  const user = clubById(game, game.userClubId);
  if (!windowOpen(game)) return { ok: false, msg: 'A janela de transferências está fechada.' };
  if (!p.clubId || p.loan) return { ok: false, msg: 'Este jogador não está disponível para empréstimo.' };
  if (isKeyPlayer(game, p)) return { ok: false, msg: 'O clube não empresta titulares.' };
  if (clubPlayers(game, user.id).length >= MAX_SQUAD) return { ok: false, msg: 'Elenco cheio.' };
  const fee = Math.round(p.value * 0.08 / 10000) * 10000;
  if (user.budget < fee) return { ok: false, msg: `Taxa de empréstimo: ${money(fee)}. Dinheiro insuficiente.` };
  addTx(game, user.id, `Empréstimo de ${p.name}`, -fee);
  addTx(game, p.clubId, `Empréstimo de ${p.name}`, fee);
  p.loan = { from: p.clubId };
  move(game, p, user.id);
  return { ok: true, msg: `${p.name} chega emprestado até o fim da temporada (taxa ${money(fee)}).` };
}

export function loanOut(game, p) {
  if (!windowOpen(game)) return { ok: false, msg: 'A janela de transferências está fechada.' };
  if (p.loan) return { ok: false, msg: 'Ele já é um jogador emprestado.' };
  if (clubPlayers(game, game.userClubId).length <= MIN_SQUAD) return { ok: false, msg: `Elenco mínimo é ${MIN_SQUAD}.` };
  const user = clubById(game, game.userClubId);
  // Algum clube menor aceita
  const cands = game.clubs.filter(c => c.id !== user.id && clubPlayers(game, c.id).length < MAX_SQUAD);
  if (!cands.length) return { ok: false, msg: 'Nenhum clube interessado.' };
  const to = pick(cands);
  p.loan = { from: user.id };
  move(game, p, to.id);
  p.listed = false;
  return { ok: true, msg: `${p.name} foi emprestado ao ${to.name} até o fim da temporada. Eles pagam o salário.` };
}

export function renewContract(game, p) {
  const user = clubById(game, game.userClubId);
  const wage = Math.round(Math.max(wageDemand(p), p.contract.wage) * 1.1 / 100) * 100;
  if (p.moral < 30) return { ok: false, msg: `${p.name} está insatisfeito e não quer renovar.` };
  p.contract = { wage, years: 3 };
  return { ok: true, msg: `${p.name} renovou por 3 temporadas. Novo salário: ${money(wage)}/sem.` };
}

export function releasePlayer(game, p) {
  if (clubPlayers(game, game.userClubId).length <= MIN_SQUAD) return { ok: false, msg: `Elenco mínimo é ${MIN_SQUAD}.` };
  if (p.loan) return { ok: false, msg: 'Não dá para dispensar um emprestado.' };
  const cost = p.contract.wage * 8 * Math.max(1, p.contract.years);
  addTx(game, game.userClubId, `Rescisão de ${p.name}`, -cost);
  move(game, p, null); p.listed = false; p.contract.years = 0;
  return { ok: true, msg: `${p.name} foi dispensado. Multa paga: ${money(cost)}.` };
}

// Aceitar uma proposta recebida (venda)
export function acceptOffer(game, offerId) {
  const o = game.inbox.find(m => m.id === offerId && m.type === 'offer');
  if (!o) return { ok: false, msg: 'Proposta não encontrada.' };
  const p = game.players[o.playerId];
  const buyer = clubById(game, o.clubId);
  game.inbox = game.inbox.filter(m => m.id !== offerId);
  if (!p || p.clubId !== game.userClubId) return { ok: false, msg: 'Jogador não está mais no clube.' };
  if (!windowOpen(game)) return { ok: false, msg: 'A janela fechou antes da conclusão.' };
  if (clubPlayers(game, game.userClubId).length <= MIN_SQUAD) return { ok: false, msg: `Elenco mínimo é ${MIN_SQUAD}.` };
  addTx(game, game.userClubId, `Venda de ${p.name}`, o.fee);
  addTx(game, buyer.id, `Compra de ${p.name}`, -o.fee);
  move(game, p, buyer.id); p.listed = false;
  p.contract = { wage: wageAsk(game, p, buyer), years: 3 };
  // Tira da escalação
  const user = clubById(game, game.userClubId);
  user.lineup = user.lineup.map(id => id === p.id ? null : id);
  user.bench = user.bench.filter(id => id !== p.id);
  news(game, `${buyer.name} compra ${p.name} do ${user.name} por ${money(o.fee)}.`);
  return { ok: true, msg: `${p.name} vendido ao ${buyer.name} por ${money(o.fee)}.` };
}

export function rejectOffer(game, offerId) {
  game.inbox = game.inbox.filter(m => m.id !== offerId);
}

// ---------- IA do mercado (roda a cada rodada) ----------
export function aiMarket(game) {
  // Propostas vencidas somem
  game.inbox = game.inbox.filter(m => m.type !== 'offer' || m.expires >= game.round);
  if (!windowOpen(game)) return;

  // 1) Propostas pelos jogadores do usuário
  for (const p of clubPlayers(game, game.userClubId)) {
    if (p.loan) continue;
    const chance = p.listed ? 0.35 : (overall(p) >= 70 ? 0.025 : 0.008);
    if (rnd() > chance) continue;
    const buyers = game.clubs.filter(c => c.id !== game.userClubId && c.budget > p.value * 0.8);
    if (!buyers.length) continue;
    const b = pick(buyers);
    const fee = Math.round(p.value * (p.listed ? 0.7 + rnd() * 0.4 : 1.1 + rnd() * 0.35) / 10000) * 10000;
    if (game.inbox.some(m => m.type === 'offer' && m.playerId === p.id)) continue;
    game.inbox.unshift({ id: newId('o'), type: 'offer', playerId: p.id, clubId: b.id, fee, expires: game.round + 2 });
  }

  // 2) Clubes da IA com elenco curto contratam agentes livres
  aiFillSquads(game);

  // 3) Clubes da IA compram de outros clubes da IA (algumas por rodada)
  const tries = Math.max(1, Math.round(game.clubs.length / 60));
  for (let k = 0; k < tries; k++) {
    if (rnd() > 0.5) continue;
    const buyer = pick(game.clubs.filter(c => c.id !== game.userClubId));
    const targets = Object.values(game.players).filter(p =>
      p.clubId && p.clubId !== buyer.id && p.clubId !== game.userClubId && !p.loan &&
      p.value < buyer.budget * 0.4 && clubById(game, p.clubId).rep <= buyer.rep + 5 && clubById(game, p.clubId).rep >= buyer.rep - 25);
    if (targets.length && clubPlayers(game, buyer.id).length < MAX_SQUAD - 2) {
      const p = targets.sort((a, b) => overall(b) - overall(a))[randInt(0, Math.min(15, targets.length - 1))];
      const seller = clubById(game, p.clubId);
      if (clubPlayers(game, seller.id).length > 20) {
        const fee = askingPrice(game, p);
        addTx(game, buyer.id, `Compra de ${p.name}`, -fee);
        addTx(game, seller.id, `Venda de ${p.name}`, fee);
        move(game, p, buyer.id);
        p.contract = { wage: wageAsk(game, p, buyer), years: 3 };
        news(game, `${buyer.name} contrata ${p.name} (ex-${seller.name}) por ${money(fee)}.`);
      }
    }
  }
}

// Mínimo de jogadores por SETOR que a IA mantém (setores, e não posições
// exatas, porque bases reais têm poucos "volantes" puros, por exemplo)
const MIN_BY_GROUP = [
  { pos: ['GOL'], min: 2, make: 'GOL' },
  { pos: ['ZAG', 'LAT'], min: 7, make: 'ZAG' },
  { pos: ['VOL', 'MEI'], min: 6, make: 'MEI' },
  { pos: ['ATA'], min: 4, make: 'ATA' }
];
const MIN_TOTAL = 22;

// A IA completa setores que estão faltando no elenco.
// Primeiro tenta agentes livres; se não houver, surge um jogador
// genérico da "base" (FICTÍCIO, marcado como tal).
export function aiFillSquads(game) {
  // Agentes livres agrupados por posição, melhores primeiro
  const free = {};
  for (const p of Object.values(game.players)) if (!p.clubId) (free[p.pos] = free[p.pos] || []).push(p);
  for (const k in free) free[k].sort((a, b) => overall(b) - overall(a));
  const takeFree = (posList, maxOvr) => {
    for (const pos of posList) {
      const l = free[pos] || [];
      const i = l.findIndex(p => overall(p) <= maxOvr);
      if (i >= 0) return l.splice(i, 1)[0];
    }
    return null;
  };

  for (const c of game.clubs) {
    if (c.id === game.userClubId) continue;
    const squad = clubPlayers(game, c.id);
    if (squad.length >= MIN_TOTAL + 4 && MIN_BY_GROUP.every(g => squad.filter(p => g.pos.includes(p.pos)).length >= g.min)) continue;
    const level = squad.length ? overall({ attrs: avgAttrs(squad), pos: 'MEI' }) : 55; // nível do elenco
    const sign = (posList, make) => {
      let p = takeFree(posList, level + 4);
      if (!p) {
        p = makePlayer(rnd, 'g' + (game.nextPlayerId++), make, level - 8 + rnd() * 8, randInt(18, 24), null);
        game.players[p.id] = p;
      }
      move(game, p, c.id);
      p.contract = { wage: wageDemand(p), years: randInt(1, 3) };
      squad.push(p);
    };
    for (const g of MIN_BY_GROUP) {
      let have = squad.filter(p => g.pos.includes(p.pos)).length;
      while (have < g.min) { sign(g.pos, g.make); have++; }
    }
    while (squad.length < MIN_TOTAL) sign(['MEI', 'ZAG', 'ATA', 'LAT', 'VOL'], 'MEI');
  }
}

function avgAttrs(list) {
  const a = { fin: 0, pas: 0, def: 0, for: 0, res: 0, gk: 0 };
  if (!list.length) return { fin: 55, pas: 55, def: 55, for: 55, res: 55, gk: 55 };
  // Usa a média dos 11 melhores atributos de cada tipo para estimar o nível
  for (const k in a) {
    const vals = list.map(p => p.attrs[k]).sort((x, y) => y - x).slice(0, 11);
    a[k] = vals.reduce((s, v) => s + v, 0) / vals.length;
  }
  return a;
}

export function news(game, text) {
  game.news.unshift({ season: game.season, round: game.round, text });
  if (game.news.length > 60) game.news.length = 60;
}

// Fim de temporada: empréstimos voltam e contratos vencem
export function seasonContracts(game) {
  const msgs = [];
  // Tamanho dos elencos (contado uma vez só: mais rápido)
  const size = {};
  for (const p of Object.values(game.players)) if (p.clubId) size[p.clubId] = (size[p.clubId] || 0) + 1;
  for (const p of Object.values(game.players)) {
    if (p.loan) {
      move(game, p, p.loan.from); p.loan = null;
      if (p.clubId === game.userClubId) msgs.push(`${p.name} voltou de empréstimo.`);
      continue;
    }
    if (!p.clubId) continue;
    p.contract.years--;
    if (p.contract.years > 0) continue;
    if (p.clubId === game.userClubId) {
      msgs.push(`O contrato de ${p.name} acabou e ele deixou o clube.`);
      size[p.clubId]--; move(game, p, null);
    } else if (rnd() < 0.75 && size[p.clubId] < 30) {
      p.contract = { wage: wageDemand(p), years: randInt(1, 3) };    // IA renova
    } else {
      size[p.clubId]--; move(game, p, null);
    }
  }
  // Clubes da IA com elenco inchado dispensam os piores
  for (const c of game.clubs) {
    if (c.id === game.userClubId) continue;
    const sq = clubPlayers(game, c.id).sort((a, b) => overall(a) - overall(b));
    while (sq.length > 30) { const p = sq.shift(); move(game, p, null); p.contract.years = 0; }
  }
  // Agentes livres velhos e fracos saem do jogo (evita o arquivo crescer sem parar)
  for (const p of Object.values(game.players)) {
    if (!p.clubId && (p.age >= 33 || overall(p) < 45)) delete game.players[p.id];
  }
  touchPlayers(game);
  return msgs;
}
