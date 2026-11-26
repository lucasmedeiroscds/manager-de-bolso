// =============================================================
// press.js — NOTÍCIAS E ENTREVISTAS
// =============================================================
// Depois de cada jogo do usuário:
//  - sai uma MANCHETE sobre o resultado (vai para a tela Notícias);
//  - o técnico (ou o jogador, no modo carreira) dá uma ENTREVISTA:
//    1 pergunta e 3 respostas. Cada resposta mexe na moral do elenco,
//    na diretoria, na torcida ou na confiança do técnico.
// =============================================================
import { clamp, pick } from '../util.js';

export function addPress(game, item) {
  game.press = game.press || [];
  game.press.unshift({ season: game.season, round: game.round, ...item });
  if (game.press.length > 40) game.press.length = 40;
}

function ctx(game, m) {
  const i = m.teams.findIndex(t => t.club.id === game.userClubId);
  if (i < 0) return null;
  const t = m.teams[i], o = m.teams[1 - i];
  const w = m.winnerIndex();
  const res = w === i ? 'win' : w === -1 ? 'draw' : 'loss';
  const counts = {};
  for (const s of t.scorers) counts[s.id] = (counts[s.id] || 0) + 1;
  const starId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return { i, t, o, res, diff: t.goals - o.goals, star: starId && counts[starId] >= 2 ? game.players[starId] : null, starGoals: starId ? counts[starId] : 0 };
}

// Manchete do jogo
export function matchHeadline(game, m) {
  const c = ctx(game, m);
  if (!c) return null;
  const { t, o, res, diff, star } = c;
  const us = t.club.name, them = o.club.name, sc = `${t.goals} x ${o.goals}`;
  const pens = m.pens ? ` nos pênaltis (${m.pens[c.i]} x ${m.pens[1 - c.i]})` : '';
  let title, tone;
  if (res === 'win' && diff >= 3) { title = pick([`${us} atropela o ${them}: ${sc}!`, `Show de bola! ${us} goleia o ${them}`, `Passeio: ${us} faz ${t.goals} no ${them}`]); tone = 'good'; }
  else if (res === 'win') { title = pick([`${us} vence o ${them}${pens || ` por ${sc}`}`, `Três pontos: ${us} supera o ${them}`, `${us} bate o ${them} e anima a torcida`]); tone = 'good'; }
  else if (res === 'draw') { title = pick([`${us} e ${them} ficam no ${sc}`, `Tudo igual entre ${us} e ${them}`, `Empate: ${us} não sai do ${sc} contra o ${them}`]); tone = ''; }
  else if (diff <= -3) { title = pick([`Vexame! ${us} é goleado pelo ${them}`, `Noite para esquecer: ${them} ${o.goals} x ${t.goals} ${us}`, `Crise? ${us} leva ${o.goals} do ${them}`]); tone = 'bad'; }
  else { title = pick([`${us} perde para o ${them}${pens}`, `${them} vence e complica a vida do ${us}`, `Derrota: ${us} cai diante do ${them}`]); tone = 'bad'; }
  if (m.derby) title = `${m.derby}: ${title}`;
  let text = m.cupName ? `${m.cupName} · ${m.stage}.` : 'Pela liga.';
  if (star) text += ` Destaque para ${star.name}, autor de ${c.starGoals} gols.`;
  else if (t.scorers.length) text += ` Gols de ${[...new Set(t.scorers.map(s => game.players[s.id] && game.players[s.id].name))].filter(Boolean).join(', ')}.`;
  if (t.stats.red) text += ' O time ainda teve um expulso.';
  return { title, text, tone };
}

// ---------- Perguntas da entrevista ----------
// fx: { moral (elenco), board, fans, trust (modo jogador), star (moral do destaque) }
const COACH_Q = {
  bigwin: { q: 'Goleada! O time já pode sonhar com o título?', a: [
    ['Sim, somos candidatos a tudo!', { fans: 4, moral: 3, board: -1 }],
    ['Pés no chão: é jogo a jogo.', { board: 3, moral: 1 }],
    ['O adversário facilitou bastante.', { moral: -3, fans: -1, board: 1 }]] },
  win: { q: 'Vitória importante. A que você atribui o resultado?', a: [
    ['Mérito total dos jogadores.', { moral: 4, fans: 1 }],
    ['A estratégia funcionou perfeitamente.', { board: 2, moral: -1 }],
    ['Ganhamos, mas ainda temos muito a melhorar.', { board: 1, moral: 1 }]] },
  draw: { q: 'Empate. Você acha que foi um resultado justo?', a: [
    ['Merecíamos vencer, criamos mais.', { moral: 2, fans: 1 }],
    ['Um ponto que pode fazer diferença lá na frente.', { board: 2 }],
    ['Jogamos mal e o empate saiu barato.', { moral: -3, board: 1, fans: 1 }]] },
  loss: { q: 'Derrota dura. O que faltou hoje?', a: [
    ['A culpa é minha, eu assumo.', { moral: 3, fans: 2, board: -1 }],
    ['Faltou atitude dos jogadores.', { moral: -5, board: 1, fans: 1 }],
    ['A arbitragem nos prejudicou.', { fans: 3, board: -2 }]] },
  bigloss: { q: 'Goleada sofrida. Seu cargo está em risco?', a: [
    ['Confio no trabalho, vamos reagir.', { board: 2, moral: 1 }],
    ['Os jogadores precisam responder em campo.', { moral: -4, board: 1 }],
    ['Peço desculpas à torcida.', { fans: 4, moral: -1 }]] },
  star: { q: '{star} brilhou com {g} gols. Ele é o craque do time?', a: [
    ['Sim, é o nosso grande jogador!', { star: 10, moral: -1, fans: 2 }],
    ['Todos foram bem, o mérito é do grupo.', { moral: 3 }],
    ['Ele pode render ainda mais.', { star: -3, board: 1 }]] }
};
const PLAYER_Q = {
  win: { q: 'Boa vitória! Como você viu o jogo?', a: [
    ['O grupo está de parabéns.', { trust: 3 }],
    ['Fiz a minha parte, mereço mais espaço.', { trust: -4, fans: 3 }],
    ['O técnico armou muito bem o time.', { trust: 5 }]] },
  draw: { q: 'Empate. O que faltou para vencer?', a: [
    ['Caprichar mais na finalização.', { trust: 3 }],
    ['Precisamos ser mais ousados.', { trust: -1, fans: 2 }],
    ['Prefiro não comentar.', {}]] },
  loss: { q: 'Derrota. O que deu errado?', a: [
    ['Temos que trabalhar mais nos treinos.', { trust: 4 }],
    ['Falta entrosamento no time.', { trust: -3 }],
    ['Prefiro não comentar.', {}]] },
  bench: { q: 'Você não jogou hoje. Está chateado?', a: [
    ['Respeito a decisão do técnico.', { trust: 6 }],
    ['Quero jogar, estou pronto!', { trust: -3, fans: 3 }],
    ['Vou pensar no meu futuro.', { trust: -8 }]] }
};

export function interview(game, m) {
  const c = ctx(game, m);
  if (!c) return null;
  let key, Q;
  if (game.mode === 'player') {
    Q = PLAYER_Q;
    key = !c.t.used.has(game.pc.id) ? 'bench' : c.res;
  } else {
    if (!game.coach || game.coach.fired) return null;
    Q = COACH_Q;
    key = c.star && Math.random() < 0.5 ? 'star' : c.res === 'win' ? (c.diff >= 3 ? 'bigwin' : 'win') : c.res === 'loss' ? (c.diff <= -3 ? 'bigloss' : 'loss') : 'draw';
  }
  const q = Q[key];
  return {
    key, mode: game.mode === 'player' ? 'player' : 'coach', starId: c.star && c.star.id,
    q: q.q.replace('{star}', c.star ? c.star.name : '').replace('{g}', c.starGoals),
    a: q.a.map(([text]) => text)
  };
}

export function answerInterview(game, iv, idx) {
  const Q = iv.mode === 'player' ? PLAYER_Q : COACH_Q;
  const [text, fx] = Q[iv.key].a[idx];
  const parts = [];
  if (fx.moral) {
    for (const p of Object.values(game.players)) if (p.clubId === game.userClubId) p.moral = clamp(p.moral + fx.moral, 5, 100);
    parts.push(`${fx.moral > 0 ? '😊' : '😠'} moral do elenco ${fx.moral > 0 ? '+' : ''}${fx.moral}`);
  }
  if (fx.star && iv.starId && game.players[iv.starId]) { const p = game.players[iv.starId]; p.moral = clamp(p.moral + fx.star, 5, 100); parts.push(`${p.name} ${fx.star > 0 ? '+' : ''}${fx.star} de moral`); }
  const c = game.coach;
  if (c && fx.board) { c.board = clamp(c.board + fx.board, 0, 100); parts.push(`diretoria ${fx.board > 0 ? '+' : ''}${fx.board}`); }
  if (c && fx.fans) { c.fans = clamp(c.fans + fx.fans, 0, 100); parts.push(`torcida ${fx.fans > 0 ? '+' : ''}${fx.fans}`); }
  if (game.pc && fx.trust) { game.pc.trust = clamp(game.pc.trust + fx.trust, 0, 100); parts.push(`confiança do técnico ${fx.trust > 0 ? '+' : ''}${fx.trust}`); }
  if (game.pc && fx.fans && !c) parts.push('a torcida gostou');
  const who = iv.mode === 'player' ? game.players[game.pc.id].name : (c ? c.name : 'Técnico');
  addPress(game, { title: `"${text}"`, text: `${who}, na entrevista depois do jogo.`, tone: 'quote' });
  return parts.length ? parts.join(' · ') : 'Resposta neutra.';
}
