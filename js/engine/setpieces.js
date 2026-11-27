// =============================================================
// setpieces.js — BOLAS PARADAS e CAPITÃO
// =============================================================
// Cada clube pode ter: capitão, cobrador de pênalti, de falta e de
// escanteio (club.captain / club.takers). Se o escolhido não estiver
// em campo, o jogo usa o melhor disponível para aquela cobrança.
//  • Pênalti: finalização + frieza (moral). Capitão bate com mais calma.
//  • Falta direta: finalização e passe (efeito na bola).
//  • Escanteio: passe de quem cobra + força de quem cabeceia.
// CAPITÃO: segura a moral do elenco na semana, dá um empurrão quando o
// time está perdendo no 2º tempo e dá exemplo (menos cartões bobos).
// =============================================================
import { overall } from './ratings.js';
import { clamp } from '../util.js';

export const KINDS = [['pen', '🎯', 'Pênalti'], ['fk', '🌀', 'Falta'], ['ck', '🚩', 'Escanteio']];

// Nota de cada jogador para cada cobrança
export function takerScore(p, kind) {
  if (!p) return 0;
  if (kind === 'pen') return p.attrs.fin * 0.75 + p.moral * 0.15 + p.attrs.for * 0.1;
  if (kind === 'fk') return p.attrs.fin * 0.5 + p.attrs.pas * 0.5;
  return p.attrs.pas;   // escanteio
}
export function headerScore(p) { return p.attrs.for * 0.6 + p.attrs.fin * 0.4; }

// Capitão automático: mais velho e mais forte do time titular
export function autoCaptain(game, club) {
  const xi = (club.lineup || []).map(id => game.players[id]).filter(Boolean);
  return xi.sort((a, b) => leadership(b) - leadership(a))[0] || null;
}
// Liderança 0–1: idade, nível e moral
export function leadership(p) {
  if (!p) return 0;
  return clamp((p.age - 19) / 14, 0, 1) * 0.45 + clamp((overall(p) - 45) / 45, 0, 1) * 0.35 + clamp(p.moral / 100, 0, 1) * 0.2;
}
export function captainOf(game, club) {
  const p = club.captain && game.players[club.captain];
  return p && p.clubId === club.id ? p : autoCaptain(game, club);
}

// Escolhe quem cobra entre os que estão em campo (ids)
export function pickTaker(game, club, kind, onFieldIds) {
  const want = club.takers && club.takers[kind];
  if (want && onFieldIds.includes(want)) return game.players[want];
  return onFieldIds.map(id => game.players[id]).filter(p => p && p.pos !== 'GOL').sort((a, b) => takerScore(b, kind) - takerScore(a, kind))[0] || null;
}

// Semana: o capitão segura a moral do elenco (só no clube do usuário)
export function weeklyCaptain(game) {
  if (game.mode === 'player') return;
  const club = game.clubs.find(c => c.id === game.userClubId);
  const cap = captainOf(game, club);
  if (!cap) return;
  const L = leadership(cap);
  for (const p of Object.values(game.players)) {
    if (p.clubId !== club.id || p === cap) continue;
    if (p.moral < 60) p.moral = clamp(p.moral + (60 - p.moral) * 0.06 * L, 5, 100);
  }
}

// Usuário troca o capitão: quem perde a faixa fica chateado
export function setCaptain(game, club, id) {
  const old = club.captain && game.players[club.captain];
  const p = game.players[id];
  if (!p || p.clubId !== club.id) return { ok: false, msg: '' };
  club.captain = id;
  p.moral = clamp(p.moral + 8, 5, 100);
  let extra = '';
  if (old && old.id !== id && old.clubId === club.id) { old.moral = clamp(old.moral - 10, 5, 100); extra = ` ${old.name} não gostou de perder a faixa (moral −10).`; }
  return { ok: true, msg: `©️ ${p.name} é o novo capitão (moral +8).${extra}` };
}
export function setTaker(club, kind, id) {
  club.takers = club.takers || {};
  if (id) club.takers[kind] = id; else delete club.takers[kind];
}
