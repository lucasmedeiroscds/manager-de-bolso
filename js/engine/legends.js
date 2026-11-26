// =============================================================
// legends.js — LENDAS DO CLUBE
// =============================================================
// Jogador que faz história no SEU clube (desde que você chegou)
// entra para o Hall das Lendas: ganha estátua, a torcida comemora
// e o nome fica guardado para sempre, mesmo depois que ele sai.
// Critérios: 150 jogos, ou 75 gols, ou 100 jogos + 40 assistências.
// =============================================================
import { clamp } from '../util.js';
import { clubRecord } from './records.js';

const isLegend = e => e[2] >= 150 || e[1] >= 75 || (e[2] >= 100 && e[3] >= 40);

export function legendsOf(game, clubId) {
  game.legends = game.legends || {};
  return game.legends[clubId] || [];
}

// Roda toda semana. Devolve mensagens.
export function checkLegends(game) {
  const cid = game.userClubId;
  const cr = clubRecord(game, cid);
  game.legends = game.legends || {};
  const list = game.legends[cid] || (game.legends[cid] = []);
  const msgs = [];
  for (const [id, e] of Object.entries(cr.players)) {
    if (list.some(l => l.id === id) || !isLegend(e)) continue;
    const p = game.players[id];
    list.push({ id, name: e[0], pos: p ? p.pos : '', season: game.season });
    if (p) p.moral = clamp(p.moral + 15, 5, 100);
    if (game.coach) game.coach.fans = clamp(game.coach.fans + 5, 0, 100);
    msgs.push(`🗿 ${e[0]} virou LENDA do clube! ${e[2]} jogos e ${e[1]} gols. A torcida fez uma estátua na frente do estádio.`);
  }
  return msgs;
}

// Estatísticas atuais (o recorde continua contando enquanto ele joga)
export function legendStats(game, clubId, id) {
  const e = clubRecord(game, clubId).players[id];
  return e ? { g: e[1], j: e[2], a: e[3] } : { g: 0, j: 0, a: 0 };
}
