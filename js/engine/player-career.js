// =============================================================
// player-career.js — MODO CARREIRA COMO JOGADOR
// =============================================================
// Você cria um garoto de 17 anos e vive a carreira dele:
//  - O técnico (IA) escala o time; a CONFIANÇA dele em você define
//    se você é titular, reserva ou fica fora.
//  - Nas partidas, o jogo para nos SEUS lances e você decide.
//  - Cada jogo dá EXPERIÊNCIA; a cada 100 você ganha 1 ponto para
//    treinar um atributo.
//  - Propostas de outros clubes chegam conforme o seu nível; você
//    também pode pedir para ser negociado.
//  - Seleção e prêmios usam o sistema normal do jogo (convocação dos
//    melhores do país, Melhor da Liga, Melhor do Mundo).
// =============================================================
import { makePlayer } from '../data/generator.js';
import { createGame, inbox } from './season.js';
import { overall, effectiveRating, wageDemand, marketValue, positionFit } from './ratings.js';
import { FORMATIONS, autoLineup, clubPlayers, touchPlayers } from './tactics.js';
import { addTx } from './finance.js';
import { windowOpen } from './market.js';
import { rnd, clamp, pick, money } from '../util.js';
import { life, perks, weeklyLife, lifeAfterMatch, signingBonus } from './life.js';
import { PC_PLANS } from './evolution.js';

// Experiência para ganhar 1 ponto: cresce com o seu nível
export const xpNeed = p => 100 + Math.max(0, overall(p) - 50) * 8;
// Custo (em pontos) para subir um atributo: atributo alto custa mais
export const attrCost = v => v >= 85 ? 3 : v >= 72 ? 2 : 1;

export const isPlayerMode = game => !!(game && game.mode === 'player' && game.pc);
export const pcPlayer = game => game.players[game.pc.id];

// Clubes para começar: os mais modestos do país escolhido (ou do mundo)
export function starterClubs(db, country) {
  const leagues = (db.leagues || []).filter(l => !country || l.country === country);
  const ids = new Set(leagues.flatMap(l => l.clubIds));
  let clubs = db.clubs.filter(c => ids.has(c.id));
  if (clubs.length < 6) clubs = db.clubs.slice();
  return clubs.sort((a, b) => a.rep - b.rep).slice(0, 12);
}

export function createPlayerGame(db, { name, pos, nat, clubId }) {
  const game = createGame(db, clubId, 'Técnico');
  game.mode = 'player';
  game.coach = null; // quem escala é a IA
  const id = 'g' + (game.nextPlayerId++);
  const club = game.clubs.find(c => c.id === clubId);
  // Garoto promissor: nível um pouco abaixo do elenco, potencial alto
  const p = makePlayer(Math.random, id, pos, 50, 17, clubId);
  p.name = name; p.nat = nat; p.fictional = true; p.isPC = true;
  p.potential = clamp(overall(p) + 30 + Math.round(rnd() * 8), 80, 92);
  p.contract = { wage: Math.max(2000, wageDemand(p)), years: 3 };
  p.value = marketValue(p);
  game.players[id] = p;
  game.pc = { id, xp: 0, pts: 2, trust: 45, role: 'Reserva', ratings: [], caps: 0, offers: [], log: [] };
  touchPlayers(game);
  autoLineup(game, club);
  pcLineup(game, club);
  game.inbox = [];
  inbox(game, `⚽ Bem-vindo ao ${club.name}, ${name}! Você começa como reserva. Jogue bem para ganhar a confiança do técnico.`);
  inbox(game, `🎯 Você tem ${game.pc.pts} pontos de treino. Use-os na tela Carreira para melhorar seus atributos.`);
  return game;
}

// Melhor vaga da formação para o jogador
function bestSlot(club, p) {
  const slots = FORMATIONS[club.formation] || FORMATIONS['4-4-2'];
  let best = -1, val = -1;
  slots.forEach((s, i) => { const v = effectiveRating(p, s) * (s === p.pos ? 1.05 : 1); if (v > val) { val = v; best = i; } });
  return best;
}

// Depois que a IA escala: aplica a confiança do técnico no jogador
export function pcLineup(game, club) {
  const pc = game.pc, p = pcPlayer(game);
  if (!p || p.clubId !== club.id) return;
  const avail = p.injury <= 0 && p.suspended <= 0;
  let inXI = club.lineup.includes(p.id);
  if (avail && !inXI && pc.trust >= 65) {
    const i = bestSlot(club, p);
    const out = club.lineup[i];
    club.lineup[i] = p.id;
    club.bench = club.bench.filter(x => x !== p.id);
    if (out) club.bench.unshift(out);
    club.bench = club.bench.slice(0, 7);
    inXI = true;
  } else if (inXI && pc.trust < 30) {
    const i = club.lineup.indexOf(p.id);
    const slot = FORMATIONS[club.formation][i];
    const sub = club.bench.map(id => game.players[id]).filter(x => x && x.id !== p.id && x.pos !== 'GOL')
      .sort((a, b) => effectiveRating(b, slot) - effectiveRating(a, slot))[0];
    if (sub) { club.lineup[i] = sub.id; club.bench = [p.id, ...club.bench.filter(x => x !== sub.id && x !== p.id)].slice(0, 7); inXI = false; }
  }
  if (avail && !inXI && !club.bench.includes(p.id) && pc.trust >= 20) club.bench = [p.id, ...club.bench].slice(0, 7);
  pc.role = !avail ? (p.injury > 0 ? 'Lesionado' : 'Suspenso') : inXI ? 'Titular' : club.bench.includes(p.id) ? 'Reserva' : 'Fora da lista';
}

// Depois de cada jogo do clube do jogador
export function afterPcMatch(game, m) {
  const pc = game.pc, p = pcPlayer(game);
  const msgs = [];
  const t = m.teams.find(x => x.club.id === p.clubId);
  if (!t) return msgs;
  lifeAfterMatch(game, m);
  if (!t.used.has(p.id)) {
    pc.trust = clamp(pc.trust + (pc.trust < 60 ? 1.5 : 0), 0, 100); // treinando forte, espera a chance
    return msgs;
  }
  const r = (m.ratings && m.ratings[p.id]) || 6;
  const g = t.scorers.filter(s => s.id === p.id).length, a = t.scorers.filter(s => s.assist === p.id).length;
  const xp = Math.round((Math.max(0, r - 4) * 6 + g * 10 + a * 5 + (m.competition !== 'league' ? 5 : 0)) * (1 + perks(game).xp));
  pc.xp += xp;
  while (pc.xp >= xpNeed(p)) { pc.xp -= xpNeed(p); pc.pts++; msgs.push('🎯 Você ganhou 1 ponto de treino! Use na tela Carreira.'); }
  const dt = (r - 6.4) * 6;
  pc.trust = clamp(pc.trust + dt, 0, 100);
  pc.ratings.unshift(r); pc.ratings.length = Math.min(pc.ratings.length, 10);
  const line = `Nota ${r.toFixed(1)}${g ? ` · ${g} gol(s)` : ''}${a ? ` · ${a} assist.` : ''} · +${xp} XP`;
  pc.log.unshift({ season: game.season, round: game.round, vs: m.teams.find(x => x !== t).club.short, r, g, a });
  pc.log.length = Math.min(pc.log.length, 30);
  msgs.push(r >= 7.5 ? `🌟 Grande atuação! ${line}. O técnico está impressionado.` : r < 5.8 ? `😬 Jogo ruim. ${line}. O técnico ficou de olho.` : `📋 ${line}.`);
  return msgs;
}

// Treinar: gasta 1 ponto em um atributo (até o potencial)
export function trainAttr(game, k) {
  const pc = game.pc, p = pcPlayer(game);
  const cost = attrCost(p.attrs[k]);
  if (pc.pts < cost) return { ok: false, msg: pc.pts <= 0 ? 'Sem pontos de treino. Jogue e treine para ganhar experiência.' : `Esse atributo já está alto: custa ${cost} pontos.` };
  if (p.attrs[k] >= 99) return { ok: false, msg: 'Esse atributo já está no máximo.' };
  p.attrs[k]++;
  if (overall(p) > p.potential) { p.attrs[k]--; return { ok: false, msg: 'Você chegou ao seu potencial nessa função. Treine outro atributo.' }; }
  pc.pts -= cost;
  p.value = marketValue(p);
  return { ok: true, msg: `+1 em ${k.toUpperCase()}!` };
}

// Propostas de clubes que combinam com o seu nível
export function makePcOffers(game, n = 2, forced = false) {
  const pc = game.pc, p = pcPlayer(game);
  const ovr = overall(p);
  const cur = game.clubs.find(c => c.id === p.clubId);
  const level = c => {
    const xi = (c.lineup || []).map(id => game.players[id]).filter(Boolean);
    return xi.length ? xi.reduce((s, x) => s + overall(x), 0) / xi.length : c.rep;
  };
  const cands = game.clubs.filter(c => c.id !== p.clubId && Math.abs(level(c) - ovr) <= (forced ? 7 : 5) && c.budget > p.value * 0.6);
  const out = [];
  for (let k = 0; k < n && cands.length; k++) {
    const c = cands.splice(Math.floor(rnd() * cands.length), 1)[0];
    const lv = level(c);
    out.push({
      clubId: c.id, wage: Math.round(wageDemand(p) * (1 + rnd() * 0.4) / 100) * 100, years: 2 + Math.floor(rnd() * 3),
      role: ovr >= lv + 2 ? 'Titular' : ovr >= lv - 2 ? 'Briga por posição' : 'Reserva', fee: Math.round(p.value * (0.9 + rnd() * 0.4) / 10000) * 10000,
      expires: game.round + 3
    });
  }
  // o clube atual também pode oferecer renovação
  if (p.contract.years <= 1 && cur) out.push({ clubId: cur.id, renew: true, wage: Math.round(wageDemand(p) * 1.1 / 100) * 100, years: 3, role: pc.role, fee: 0, expires: game.round + 4 });
  pc.offers = [...pc.offers.filter(o => o.expires >= game.round && !out.some(x => x.clubId === o.clubId)), ...out].slice(-5);
  return out;
}

// Toda semana: propostas na janela de transferências
export function weeklyPc(game) {
  const pc = game.pc, p = pcPlayer(game);
  const msgs = [];
  pc.offers = pc.offers.filter(o => o.expires >= game.round);
  const avg = pc.ratings.length ? pc.ratings.reduce((s, x) => s + x, 0) / pc.ratings.length : 6;
  msgs.push(...weeklyLife(game));
  const plan = PC_PLANS[pc.plan || 'normal'] || PC_PLANS.normal;
  if (p.injury <= 0 && !(pc.ban > 0 && plan !== PC_PLANS.descanso)) {
    p.fitness = clamp(p.fitness + plan.fit, 10, 100);
    pc.trust = clamp(pc.trust + plan.trust, 0, 100);
    if (plan.xp) { pc.xp += Math.round(plan.xp * (1 + perks(game).xp)); while (pc.xp >= xpNeed(p)) { pc.xp -= xpNeed(p); pc.pts++; msgs.push('🎯 O treino rendeu: +1 ponto de treino!'); } }
    if (plan.inj && rnd() < plan.inj) { p.injury = 1 + Math.floor(rnd() * 3); msgs.push(`🤕 Você se machucou no treino (${plan.name.toLowerCase()}): ${p.injury} semana(s) fora.`); }
  } else if (p.injury > 0 && pc.plan !== 'descanso') p.fitness = clamp(p.fitness + 4, 10, 100);
  if (windowOpen(game) && rnd() < 0.08 + Math.max(0, avg - 6.5) * 0.12 + life(game).fame / 600) {
    const o = makePcOffers(game, 1);
    if (o.length && !o[0].renew) msgs.push(`📨 O ${game.clubs.find(c => c.id === o[0].clubId).name} quer contratar você! Veja em Carreira.`);
  }
  if (p.contract.years <= 1 && !pc.offers.some(o => o.renew) && rnd() < 0.15) makePcOffers(game, 0);
  return msgs;
}

export function requestTransfer(game) {
  const pc = game.pc;
  if (pc.askedRound === game.round) return { ok: false, msg: 'Você já pediu nesta semana.' };
  pc.askedRound = game.round;
  pc.trust = clamp(pc.trust - 8, 0, 100);
  const o = makePcOffers(game, 3, true).filter(x => !x.renew);
  return o.length ? { ok: true, msg: `Seu empresário encontrou ${o.length} interessado(s)!` } : { ok: false, msg: 'Nenhum clube se interessou agora. Jogue bem e tente de novo.' };
}

export function acceptPcOffer(game, clubId) {
  const pc = game.pc, p = pcPlayer(game);
  const o = pc.offers.find(x => x.clubId === clubId);
  if (!o) return { ok: false, msg: 'Proposta expirou.' };
  if (!o.renew && !windowOpen(game)) return { ok: false, msg: 'A janela de transferências está fechada. A proposta fica valendo até abrir… ou expirar.' };
  const old = game.clubs.find(c => c.id === p.clubId), nc = game.clubs.find(c => c.id === clubId);
  p.contract = { wage: o.wage, years: o.years };
  pc.offers = [];
  const luvas = signingBonus(game, o.wage, o.renew);
  if (o.renew) { pc.trust = clamp(pc.trust + 5, 0, 100); return { ok: true, msg: `Contrato renovado com o ${nc.name} por ${o.years} anos! Luvas: ${money(luvas)}.` }; }
  if (o.fee) { addTx(game, nc.id, `Compra de ${p.name}`, -o.fee); addTx(game, old.id, `Venda de ${p.name}`, o.fee); }
  p.clubId = nc.id; p.loan = null; p.listed = false;
  game.userClubId = nc.id;
  pc.trust = o.role === 'Titular' ? 60 : o.role === 'Reserva' ? 40 : 50;
  pc.clubs = [...(pc.clubs || []), { season: game.season, club: old.name }];
  touchPlayers(game);
  autoLineup(game, old); autoLineup(game, nc); pcLineup(game, nc);
  return { ok: true, msg: `✍️ Você é o novo reforço do ${nc.name}! Salário de ${money(o.wage)}/semana e luvas de ${money(luvas)}.` };
}

export function rejectPcOffer(game, clubId) {
  game.pc.offers = game.pc.offers.filter(o => o.clubId !== clubId);
}
