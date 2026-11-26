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

// As entrevistas ficam em interviews.js
