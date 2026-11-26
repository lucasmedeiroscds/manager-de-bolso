// =============================================================
// life.js — VIDA PESSOAL DO JOGADOR (modo carreira)
// =============================================================
// • Carteira: salário toda semana (menos impostos e empresário),
//   bicho por vitória, prêmio por gol, luvas na assinatura e
//   patrocínio pessoal (depende da sua FAMA).
// • Loja: casas, carros, luxo e equipe pessoal. Cada compra tem
//   manutenção semanal e dá vantagens (descanso, fama, experiência...).
//   Dá para vender de volta (por menos do que pagou).
// • Investimentos: rendem um pouco por semana; dá para sacar.
// • Ostentar demais jogando mal vira notícia e irrita o técnico.
// Os itens são genéricos (sem marcas reais).
// =============================================================
import { clamp, rnd, money } from '../util.js';
import { addPress } from './press.js';

// [id, categoria, emoji, nome, preço, manutenção/semana (fração do preço), vantagem]
export const ITEMS = [
  // Moradia (fica só a melhor): descanso → recuperação física e moral
  ['kitnet', 'casa', '🛏️', 'Kitnet perto do CT', 90e3, 0.002, { rest: 0.5 }, 'Primeiro cantinho seu. Um pouco mais de descanso.'],
  ['apto', 'casa', '🏢', 'Apartamento de 2 quartos', 300e3, 0.0015, { rest: 1 }, 'Recupera um pouco melhor entre os jogos.'],
  ['casa', 'casa', '🏡', 'Casa com quintal', 1.2e6, 0.0015, { rest: 2 }, 'Mais descanso: recuperação física +.'],
  ['cobertura', 'casa', '🌆', 'Cobertura com vista para o mar', 4.5e6, 0.0015, { rest: 3, fame: 1 }, 'Ótimo descanso e um pouco de fama.'],
  ['mansao', 'casa', '🏰', 'Mansão com piscina', 15e6, 0.0015, { rest: 4, fame: 2 }, 'Descanso de craque. Mais fama.'],
  ['mansaoCampo', 'casa', '🏟️', 'Mansão com campo de futebol', 60e6, 0.0015, { rest: 5, fame: 3, xp: 0.1 }, 'Treina em casa: +10% de experiência.'],
  // Carros (fama; ficam todos na garagem)
  ['moto', 'carro', '🛵', 'Moto', 18e3, 0.003, { fame: 0 }, 'Chega ao treino sem atraso.'],
  ['popular', 'carro', '🚗', 'Carro popular', 70e3, 0.002, { fame: 0 }, 'Para ir ao treino sem depender de carona.'],
  ['suv', 'carro', '🚙', 'SUV importado', 350e3, 0.002, { fame: 1 }, 'Chega ao CT com estilo.'],
  ['esportivo', 'carro', '🏎️', 'Esportivo de luxo', 1.8e6, 0.002, { fame: 2, flash: 1 }, 'Chama atenção (fama +).'],
  ['super', 'carro', '🚀', 'Superesportivo de colecionador', 8e6, 0.002, { fame: 3, flash: 2 }, 'Capa de revista. Muita fama.'],
  // Luxo
  ['games', 'luxo', '🎮', 'Videogame e TV gigante', 12e3, 0, { rest: 0.5 }, 'Diversão nas folgas: um pouco mais de descanso.'],
  ['relogio', 'luxo', '⌚', 'Relógio de ouro', 150e3, 0, { fame: 1, flash: 1 }, 'Brilha nas fotos.'],
  ['festa', 'luxo', '🎉', 'Festa de aniversário para 500 convidados', 800e3, 0, { once: true, fame: 4, flash: 3 }, 'Uma vez só: muita fama… e muito comentário.'],
  ['lancha', 'luxo', '🛥️', 'Lancha', 6e6, 0.003, { fame: 2, flash: 2, rest: 1 }, 'Descanso nas folgas e fama.'],
  ['iate', 'luxo', '⛵', 'Iate', 25e6, 0.003, { fame: 4, flash: 3, rest: 1 }, 'Vida de estrela.'],
  ['jatinho', 'luxo', '🛩️', 'Jatinho particular', 120e6, 0.002, { fame: 5, flash: 3, rest: 2 }, 'Chega descansado de qualquer viagem.'],
  ['instituto', 'luxo', '💚', 'Instituto social com seu nome', 2e6, 0.002, { fame: 3, trust: 1 }, 'Ajuda crianças da sua cidade. Fama e respeito.']
];
// Equipe pessoal (assinatura semanal)
export const SERVICES = [
  ['trainer', '🏋️', 'Personal trainer', 1500, 'Experiência +20% em cada jogo.'],
  ['nutri', '🥗', 'Nutricionista', 900, 'Recuperação física melhor e menos lesões.'],
  ['physio', '🩺', 'Fisioterapeuta particular', 1200, 'Volta mais rápido de lesões.'],
  ['assessor', '📣', 'Assessor de imprensa', 1000, 'Fama +1 por semana e menos notícias ruins.']
];
// custo da equipe: valor base + 4% do seu salário (craque paga mais)
export const serviceCost = (game, base) => Math.round((base + game.players[game.pc.id].contract.wage * 0.04) / 100) * 100;
const TAX = 0.27;        // impostos + empresário
const YIELD = 0.0015;    // rendimento semanal dos investimentos (~8% ao ano)

export function life(game) {
  const pc = game.pc;
  if (!pc.life) pc.life = { cash: 15000, invest: 0, owned: [], services: {}, fame: 5, log: [] };
  return pc.life;
}
const item = id => ITEMS.find(x => x[0] === id);
function logMoney(L, label, v) { L.log.unshift({ label, v }); L.log.length = Math.min(L.log.length, 25); }

// Vantagens somadas do que você tem
export function perks(game) {
  const L = life(game), s = { rest: 0, fame: 0, xp: 0, flash: 0, trust: 0 };
  const homes = L.owned.map(o => item(o.id)).filter(x => x && x[1] === 'casa');
  const best = homes.sort((a, b) => b[4] - a[4])[0];
  for (const o of L.owned) {
    const it = item(o.id);
    if (!it || it[6].once || (it[1] === 'casa' && it !== best)) continue;
    for (const k in it[6]) if (k in s) s[k] += it[6][k];
  }
  if (L.services.trainer) s.xp += 0.2;
  return s;
}
export function upkeep(game) {
  const L = life(game);
  let u = L.owned.reduce((t, o) => { const it = item(o.id); return t + (it ? it[4] * it[5] : 0); }, 0);
  for (const [k, , , cost] of SERVICES) if (L.services[k]) u += serviceCost(game, cost);
  return Math.round(u);
}
export const sponsorIncome = L => Math.round(Math.pow(L.fame, 2) * 25 / 100) * 100;
export const netWorth = game => { const L = life(game); return L.cash + L.invest + L.owned.reduce((t, o) => { const it = item(o.id); return t + (it && !it[6].once ? Math.round(it[4] * 0.6) : 0); }, 0); };

// Toda semana (modo jogador)
export function weeklyLife(game) {
  const L = life(game), pc = game.pc, p = game.players[pc.id];
  const msgs = [];
  const net = Math.round(p.contract.wage * (1 - TAX));
  L.cash += net;
  const sp = sponsorIncome(L);
  if (sp) L.cash += sp;
  const up = upkeep(game);
  L.cash -= up;
  if (L.invest > 0) { const y = Math.round(L.invest * YIELD); L.invest += y; }
  logMoney(L, `Semana: salário ${money(net)}${sp ? ` + patrocínio ${money(sp)}` : ''}${up ? ` − gastos ${money(up)}` : ''}`, net + sp - up);
  const pk = perks(game);
  // descanso e equipe
  p.fitness = clamp(p.fitness + pk.rest * 1.5 + (L.services.nutri ? 3 : 0), 0, 100);
  p.moral = clamp(p.moral + pk.rest * 0.4, 5, 100);
  if (p.injury > 1 && L.services.physio && rnd() < 0.5) p.injury--;
  // fama: cai devagar, sobe com o que você tem e com o assessor
  L.fame = clamp(L.fame - 0.4 + pk.fame * 0.15 + (L.services.assessor ? 1 : 0), 0, 100);
  // dívida: o banco cobra
  if (L.cash < 0) {
    if (L.invest > 0) { const take = Math.min(L.invest, -L.cash); L.invest -= take; L.cash += take; msgs.push(`🏦 Seu saldo ficou negativo: ${money(take)} foram tirados dos investimentos.`); }
    else { L.cash = Math.round(L.cash * 1.02); msgs.push(`⚠️ Você está devendo ${money(-L.cash)}. Venda algo ou corte gastos (juros de 2% por semana).`); }
  }
  // ostentação jogando mal
  const avg = pc.ratings.length ? pc.ratings.slice(0, 4).reduce((s, x) => s + x, 0) / Math.min(4, pc.ratings.length) : 6.5;
  if (pk.flash >= 3 && avg < 6.2 && rnd() < (L.services.assessor ? 0.06 : 0.15)) {
    pc.trust = clamp(pc.trust - 4, 0, 100);
    L.fame = clamp(L.fame - 2, 0, 100);
    addPress(game, { title: `${p.name} ostenta nas redes enquanto vai mal em campo`, text: 'A torcida cobrou nas redes sociais. O técnico não gostou.', tone: 'bad' });
    msgs.push('📸 Suas fotos de luxo viralizaram na fase ruim. A torcida reclamou e o técnico não gostou (confiança −4).');
  }
  return msgs;
}

// Depois de cada jogo seu: bicho por vitória, prêmio por gol e fama
export function lifeAfterMatch(game, m) {
  const L = life(game), pc = game.pc, p = game.players[pc.id];
  const t = m.teams.find(x => x.club.id === p.clubId);
  if (!t || !t.used.has(p.id)) return;
  const won = m.winnerIndex() === m.teams.indexOf(t);
  const goals = t.scorers.filter(s => s.id === p.id).length;
  const bonus = Math.round(p.contract.wage * ((won ? 0.25 : 0) + goals * 0.15) / 100) * 100;
  if (bonus > 0) { L.cash += bonus; logMoney(L, `${won ? 'Bicho da vitória' : ''}${won && goals ? ' + ' : ''}${goals ? `prêmio por ${goals} gol(s)` : ''}`, bonus); }
  const r = (m.ratings && m.ratings[p.id]) || 6;
  L.fame = clamp(L.fame + goals * 0.8 + (r >= 7.5 ? 1 : 0) + (m.derby && won ? 1 : 0) - (r < 5.5 ? 0.5 : 0), 0, 100);
}

// Luvas ao assinar contrato (chamada pela proposta aceita)
export function signingBonus(game, wage, renew) {
  const L = life(game);
  const v = Math.round(wage * (renew ? 3 : 6) / 100) * 100;
  L.cash += v; logMoney(L, renew ? 'Luvas da renovação' : 'Luvas da assinatura', v);
  return v;
}

// ---------- Ações ----------
export function buyItem(game, id) {
  const L = life(game), it = item(id);
  if (!it) return { ok: false, msg: '' };
  if (!it[6].once && L.owned.some(o => o.id === id)) return { ok: false, msg: 'Você já tem isso.' };
  if (L.cash < it[4]) return { ok: false, msg: `Falta dinheiro: você tem ${money(L.cash)}.` };
  L.cash -= it[4];
  logMoney(L, `Compra: ${it[3]}`, -it[4]);
  const p = game.players[game.pc.id];
  if (it[6].once) {
    L.fame = clamp(L.fame + it[6].fame * 2, 0, 100);
    p.moral = clamp(p.moral + 10, 5, 100);
    addPress(game, { title: `${p.name} dá festa de arromba e vira assunto`, text: 'Famosos, música até de manhã e fotos para todo lado.', tone: '' });
    return { ok: true, msg: `${it[2]} Festa histórica! Fama +${it[6].fame * 2}, moral +10.` };
  }
  L.owned.push({ id, season: game.season });
  if (it[6].fame >= 3) addPress(game, { title: `${p.name} compra ${it[3].toLowerCase()}`, text: 'O jogador mostrou a novidade nas redes sociais.', tone: '' });
  if (it[6].trust) game.pc.trust = clamp(game.pc.trust + 3, 0, 100);
  return { ok: true, msg: `${it[2]} Comprado: ${it[3]}!` };
}
export function sellItem(game, id) {
  const L = life(game), it = item(id);
  if (!it || !L.owned.some(o => o.id === id)) return { ok: false, msg: '' };
  const v = Math.round(it[4] * 0.6);
  L.owned = L.owned.filter(o => o.id !== id);
  L.cash += v; logMoney(L, `Venda: ${it[3]}`, v);
  return { ok: true, msg: `Vendido por ${money(v)} (60% do que você pagou).` };
}
export function toggleService(game, k) {
  const L = life(game);
  L.services[k] = !L.services[k];
  const s = SERVICES.find(x => x[0] === k);
  return { ok: true, msg: L.services[k] ? `${s[1]} ${s[2]} contratado (${money(serviceCost(game, s[3]))}/semana).` : `${s[2]} dispensado.` };
}
export function invest(game, v) {
  const L = life(game);
  v = Math.round(v);
  if (v > 0 && v > L.cash) v = L.cash;
  if (v < 0 && -v > L.invest) v = -L.invest;
  if (!v) return { ok: false, msg: 'Nada para movimentar.' };
  L.cash -= v; L.invest += v;
  return { ok: true, msg: v > 0 ? `${money(v)} investidos (rende ~8% ao ano).` : `${money(-v)} sacados.` };
}
