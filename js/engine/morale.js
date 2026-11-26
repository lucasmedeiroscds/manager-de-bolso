// =============================================================
// morale.js — MORAL E MINUTOS EM CAMPO (só o elenco do usuário)
// =============================================================
// Cada jogador espera jogar conforme o "papel" no elenco:
//  - Titular (os 11 melhores): quer jogar quase sempre
//  - Rodízio (12º ao 16º): aceita ficar de fora algumas vezes
//  - Reserva/jovem: paciente
// Ficar muitos jogos sem entrar derruba a moral e gera reclamações.
// O técnico pode conversar e PROMETER minutos: a moral sobe na hora,
// mas se a promessa não for cumprida em 4 jogos, cai muito.
// =============================================================
import { overall } from './ratings.js';
import { clamp } from '../util.js';

const PATIENCE = { titular: 2, rodizio: 4, reserva: 8, goleiro: 14 };
export const ROLE_LABEL = { titular: 'Titular', rodizio: 'Rodízio', reserva: 'Reserva', goleiro: 'Goleiro reserva' };

// Papel de cada jogador do clube (pelo nível)
export function squadRoles(game, clubId) {
  const ps = Object.values(game.players).filter(p => p.clubId === clubId).sort((a, b) => overall(b) - overall(a));
  const roles = {};
  // Goleiros: só o melhor joga; os outros sabem que são reservas
  ps.filter(p => p.pos === 'GOL').forEach((p, i) => { roles[p.id] = i === 0 ? 'titular' : 'goleiro'; });
  ps.filter(p => p.pos !== 'GOL').forEach((p, i) => { roles[p.id] = i < 10 ? 'titular' : i < 15 && p.age > 19 ? 'rodizio' : 'reserva'; });
  return roles;
}

// Humor em palavras (para a tela)
export function moodOf(p) {
  if (p.unhappy) return { k: 'bad', t: '😠 Insatisfeito' };
  if (p.moral >= 75) return { k: 'good', t: '😄 Motivado' };
  if (p.moral < 40) return { k: 'warn', t: '😕 Desanimado' };
  return { k: '', t: '🙂 Tranquilo' };
}

// Depois de cada jogo do usuário
export function afterMatchMorale(game, m) {
  const msgs = [];
  const t = m.teams.find(x => x.club.id === game.userClubId);
  if (!t) return msgs;
  const roles = squadRoles(game, game.userClubId);
  for (const id of Object.keys(roles)) {
    const p = game.players[id];
    if (!p || p.injury > 0 || p.suspended > 0) continue;
    if (t.used.has(id)) {
      p.idle = 0;
      if (p.promise) { delete p.promise; p.moral = clamp(p.moral + 4, 5, 100); }
      if (p.unhappy) { p.unhappy = false; msgs.push(`${p.name} voltou a jogar e ficou satisfeito.`); }
      continue;
    }
    p.idle = (p.idle || 0) + 1;
    // Promessa de minutos
    if (p.promise) {
      p.promise--;
      if (p.promise <= 0) {
        delete p.promise;
        p.moral = clamp(p.moral - 20, 5, 100);
        p.unhappy = true;
        msgs.push(`😠 ${p.name} diz que você não cumpriu a promessa de dar minutos a ele.`);
      }
      continue;
    }
    const lim = PATIENCE[roles[id]];
    if (p.idle > lim) {
      p.moral = clamp(p.moral - (roles[id] === 'titular' ? 5 : 3), 5, 100);
      if (!p.unhappy && p.idle === lim + 1) {
        p.unhappy = true;
        msgs.push(`😠 ${p.name} está insatisfeito: ${p.idle} jogos sem entrar em campo. Converse com ele na ficha do jogador.`);
      }
      // Muito tempo encostado: pede para sair
      if (p.idle === lim + 5 && !p.listed) msgs.push(`📢 ${p.name} pediu para ser negociado. Sem jogar, ele não quer ficar.`);
    }
  }
  return msgs;
}

// Conversa individual: 'prometer' (minutos) ou 'paciencia' (pedir calma)
export function talkToPlayer(game, id, kind) {
  const p = game.players[id];
  if (p.talkedRound === game.round) return { ok: false, text: 'Você já conversou com ele nesta semana.' };
  p.talkedRound = game.round;
  if (kind === 'prometer') {
    p.promise = 4;
    p.moral = clamp(p.moral + 12, 5, 100);
    p.unhappy = false;
    return { ok: true, text: `${p.name} ficou animado com a promessa. Coloque-o em campo nos próximos 4 jogos!` };
  }
  // Pedir paciência: funciona melhor com jovens e com quem não está muito irritado
  const chance = (p.age <= 23 ? 0.7 : 0.45) + (p.moral - 40) / 200;
  if (Math.random() < chance) {
    p.idle = Math.max(0, (p.idle || 0) - 3);
    p.unhappy = false;
    p.moral = clamp(p.moral + 5, 5, 100);
    return { ok: true, text: `${p.name} entendeu e vai esperar a chance dele.` };
  }
  p.moral = clamp(p.moral - 6, 5, 100);
  return { ok: false, text: `${p.name} não gostou da conversa e saiu irritado.` };
}
