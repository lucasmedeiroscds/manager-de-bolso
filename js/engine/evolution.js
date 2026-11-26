// =============================================================
// evolution.js — treino, recuperação, envelhecimento e base
// =============================================================
import { rnd, randInt, clamp, pick } from '../util.js';
import { overall, marketValue, wageDemand, POS_WEIGHTS } from './ratings.js';
import { youthIntake } from '../data/generator.js';
import { touchPlayers } from './tactics.js';
import { staffFx } from './staff.js';

export const TRAIN_FOCUS = {
  'Equilibrado': null, // usa os atributos mais importantes da posição
  'Físico': ['for', 'res'],
  'Técnico': ['pas', 'fin'],
  'Defensivo': ['def', 'gk'],
  'Finalização': ['fin']
};
// Modo jogador: treino da semana (escolhido na tela Carreira)
// grow: chance de evolução natural · xp: experiência · fit: físico · inj: risco de lesão · trust: confiança
export const PC_PLANS = {
  descanso: { name: 'Descanso', emoji: '🛌', grow: 0.15, xp: 0, fit: 12, inj: 0, trust: -0.5, desc: 'Recupera o físico e a moral. Quase não evolui.' },
  normal:   { name: 'Normal', emoji: '⚽', grow: 0.55, xp: 10, fit: 0, inj: 0.002, trust: 0, desc: 'Treino padrão com o grupo.' },
  intenso:  { name: 'Intenso', emoji: '🔥', grow: 0.85, xp: 18, fit: -10, inj: 0.025, trust: 0.5, desc: 'Evolui mais, mas cansa e pode machucar.' },
  tatico:   { name: 'Tático', emoji: '📋', grow: 0.35, xp: 6, fit: 0, inj: 0.002, trust: 1.5, desc: 'Vídeo e posicionamento: o técnico gosta (confiança +).' },
  focado:   { name: 'Específico', emoji: '🎯', grow: 0.55, xp: 10, fit: -4, inj: 0.008, trust: 0, desc: 'Treino extra no atributo escolhido.' }
};
export const TRAIN_INTENSITY = {
  'Leve':   { growth: 0.7, recover: 6, injury: 0.000 },
  'Normal': { growth: 1.0, recover: 0, injury: 0.002 },
  'Forte':  { growth: 1.35, recover: -6, injury: 0.006 }
};

// Escolhe qual atributo vai subir no treino
// Atributos que podem ser escolhidos no treino individual
export const INDIVIDUAL_TRAIN = { fin: 'Finalização', pas: 'Passe', def: 'Defesa', for: 'Força', res: 'Resistência', gk: 'Goleiro' };

function attrToTrain(p, focus) {
  // Treino individual: 75% das evoluções vão para o atributo escolhido
  if (p.trainFocus && INDIVIDUAL_TRAIN[p.trainFocus] && rnd() < 0.75) return p.trainFocus;
  let keys = TRAIN_FOCUS[focus];
  if (keys) {
    keys = keys.filter(k => k !== 'gk' || p.pos === 'GOL');
    if (keys.length) return pick(keys);
  }
  // Equilibrado: sorteia pelo peso do atributo na posição
  const w = POS_WEIGHTS[p.pos];
  const ks = Object.keys(w).filter(k => w[k] > 0);
  let x = rnd() * ks.reduce((s, k) => s + w[k], 0);
  for (const k of ks) { x -= w[k]; if (x <= 0) return k; }
  return ks[0];
}

// Roda toda semana (depois de cada rodada)
// Devolve mensagens para a caixa de entrada do usuário
export function weeklyEvolution(game) {
  const msgs = [];
  const clubs = new Map(game.clubs.map(c => [c.id, c]));
  for (const p of Object.values(game.players)) {
    const club = clubs.get(p.clubId);
    if (!club) continue;
    const tr = club.training || { focus: 'Equilibrado', intensity: 'Normal' };
    const it = TRAIN_INTENSITY[tr.intensity] || TRAIN_INTENSITY.Normal;
    const sf = club.id === game.userClubId ? staffFx(game, club.id) : null;
    {
      // Recuperação de lesão
      if (p.injury > 0) {
        p.injury--;
        if (sf && p.injury > 0 && rnd() < sf.healChance) p.injury--;
        if (p.injury === 0 && club.id === game.userClubId) msgs.push(`${p.name} está recuperado da lesão.`);
        p.fitness = Math.min(p.fitness, 70);
        continue; // (sai do bloco: lesionado não treina)
      }
      // Recuperação física
      // (titular que joga toda semana vai cansando: vale a pena revezar)
      p.fitness = clamp(p.fitness + 12 + p.attrs.res / 10 + it.recover + (sf ? sf.recover : 0), 10, 100);
      // Moral volta devagar para o "normal" (60)
      p.moral += (60 - p.moral) * 0.08;
      // Evolução: jovens crescem mais rápido
      const ovr = overall(p);
      if (ovr < p.potential) {
        const base = p.age <= 20 ? 0.32 : p.age <= 23 ? 0.22 : p.age <= 27 ? 0.1 : 0.03;
        // Quem joga evolui mais
        const playing = p.apps > 0 ? 1.15 : 0.9;
        const sg = sf ? sf.growth * (p.pos === 'GOL' ? sf.gkGrowth : 1) : 1;
        // jogador do usuário: depende do treino da semana (e cresce menos sozinho)
        const plan = p.isPC && game.pc ? PC_PLANS[game.pc.plan || 'normal'] || PC_PLANS.normal : null;
        if (rnd() < base * (plan ? plan.grow : it.growth * sg) * playing) {
          const k = plan && game.pc.plan === 'focado' && game.pc.focus && p.attrs[game.pc.focus] != null ? game.pc.focus : attrToTrain(p, tr.focus);
          p.attrs[k] = Math.min(99, p.attrs[k] + 1);
          if (overall(p) > p.potential) p.attrs[k]--; // não passa do potencial
        }
      }
      // Lesão no treino (treino forte é arriscado)
      if (rnd() < it.injury * (sf ? sf.injuryMult : 1)) {
        p.injury = randInt(1, 3);
        if (club.id === game.userClubId) msgs.push(`${p.name} se lesionou no treino (${p.injury} sem.).`);
      }
    }
  }
  return msgs;
}

// Fim de temporada: idade, declínio, aposentadoria e garotos da base
export function seasonAging(game) {
  const msgs = [];
  for (const p of Object.values(game.players)) {
    p.age++;
    if (p.age >= 30) {
      // Declínio: quanto mais velho, mais cai (resistência cai mais)
      const drop = p.age - 29;
      for (const k in p.attrs) {
        const d = randInt(0, Math.ceil(drop * (k === 'res' ? 1.2 : 0.7)));
        p.attrs[k] = Math.max(10, p.attrs[k] - d);
      }
    }
    p.potential = Math.max(p.potential, overall(p));
    if (p.age >= 29) p.potential = overall(p);
    // Aposentadoria
    if (!p.isPC && p.age >= 34 && rnd() < (p.age - 33) * 0.3) {
      if (p.clubId === game.userClubId) msgs.push(`${p.name} (${p.age} anos) se aposentou.`);
      delete game.players[p.id];
      continue;
    }
    p.value = marketValue(p);
    p.seasonGoals = 0;
    p.yellow = 0;
    p.suspended = 0;
    p.fitness = 100;
    p.moral = 60;
    delete p.idle; delete p.unhappy; delete p.promise; // temporada nova, conversa nova
  }
  // Base: 2 garotos por clube (FICTÍCIOS: a base real não é conhecida)
  let next = game.nextPlayerId;
  for (const club of game.clubs) {
    if (club.id === game.userClubId && game.mode !== 'player') continue;   // usuário: categorias de base (academy.js)
    const kids = youthIntake(rnd, club, 0, 2);
    for (const k of kids) {
      k.id = 'g' + (next++);
      k.contract.wage = Math.round(wageDemand(k) * 0.5 / 100) * 100;
      game.players[k.id] = k;
      if (club.id === game.userClubId) msgs.push(`Revelação da base: ${k.name} (${k.pos}, ${k.age} anos, potencial ${k.potential}).`);
    }
  }
  game.nextPlayerId = next;
  touchPlayers(game);
  return msgs;
}

// Atualiza o valor de mercado de todos (barato, roda toda semana)
export function refreshValues(game) {
  for (const p of Object.values(game.players)) p.value = marketValue(p);
}
