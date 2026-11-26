// =============================================================
// events.js — EVENTOS ALEATÓRIOS (tentações e trapaças)
// =============================================================
// MODO JOGADOR — "Suco milagroso" (doping):
//   Aceitar: +5 pontos de treino na hora. Mas nos próximos 10 jogos
//   pode cair no ANTIDOPING (6% por jogo). Pego: 12 semanas suspenso,
//   confiança do técnico −25, fama −20, escândalo na imprensa.
// MODO TÉCNICO — "Esquema de apostas":
//   Aceitar: o time entrega o próximo jogo (joga com ~55% da força).
//   Se perder, o dinheiro entra por fora no caixa. Investigação:
//   • pontos corridos: 5% por semana durante 8 semanas → −12 pontos;
//   • mata-mata: decidido logo após o jogo (35%) → eliminado da copa.
//   Pego: diretoria −30, torcida −30, dinheiro confiscado + multa.
// Recusar dá um pequeno bônus de imagem; denunciar, um bônus maior.
// =============================================================
import { clamp, rnd, money } from '../util.js';
import { addPress } from './press.js';
import { addTx } from './finance.js';
import { clubById } from './market.js';

const msgIn = (game, text) => game.inbox.unshift({ id: 'ev' + Date.now() + Math.floor(rnd() * 1e4), type: 'msg', text, season: game.season, round: game.round });

function evState(game) { return game.evState || (game.evState = { cool: 6 }); }

// ---------- Sorteio semanal de eventos ----------
// nextMatch: { kind, name, stage, knockout } do próximo jogo do usuário (ou null)
export function rollEvents(game, nextMatch) {
  const st = evState(game);
  if (game.pendingEvent) return;
  if (st.cool > 0) { st.cool--; return; }
  if (game.mode === 'player') {
    const pc = game.pc;
    if (pc.doping || pc.ban > 0 || rnd() > 0.035) return;
    game.pendingEvent = { kind: 'doping', season: game.season, round: game.round, expires: game.round + 2 };
  } else {
    const c = game.coach;
    if (!c || c.fired || !nextMatch || game.betRisk || rnd() > 0.03) return;
    const club = clubById(game, game.userClubId);
    const base = club.deal ? club.deal.base : club.sponsor;
    const amount = Math.round(base * (2.5 + rnd() * 2.5) / 100000) * 100000;
    game.pendingEvent = { kind: 'bet', season: game.season, round: game.round, expires: game.round + 1, amount,
      knockout: !!nextMatch.knockout, comp: nextMatch.name, stage: nextMatch.stage };
  }
  st.cool = 12;
}

// ---------- Respostas ----------
export function answerEvent(game, choice) {
  const ev = game.pendingEvent;
  if (!ev) return { msg: '' };
  game.pendingEvent = null;
  if (ev.kind === 'doping') {
    const pc = game.pc, p = game.players[pc.id];
    if (choice === 'yes') {
      pc.pts += 5;
      pc.doping = { left: 10, season: game.season };
      return { msg: '💉 Você tomou o "suco". +5 pontos de treino… e agora é torcer para não cair no antidoping.' };
    }
    if (choice === 'report') {
      pc.trust = clamp(pc.trust + 4, 0, 100);
      if (pc.life) pc.life.fame = clamp(pc.life.fame + 4, 0, 100);
      addPress(game, { title: `${p.name} denuncia oferta de doping`, text: 'O jovem foi elogiado pela atitude.', tone: 'good' });
      return { msg: '🛡️ Você denunciou. O técnico e a torcida elogiaram a atitude (confiança +4, fama +4).' };
    }
    pc.trust = clamp(pc.trust + 1, 0, 100);
    return { msg: 'Você recusou. Carreira limpa.' };
  }
  // esquema de apostas
  const c = game.coach;
  if (choice === 'yes') {
    game.betDeal = { season: game.season, amount: ev.amount, knockout: ev.knockout, comp: ev.comp };
    return { msg: `🤝 Acordo fechado. No próximo jogo o time vai "tirar o pé". Se perder, ${money(ev.amount)} entram por fora.` };
  }
  if (choice === 'report') {
    c.board = clamp(c.board + 5, 0, 100); c.fans = clamp(c.fans + 5, 0, 100);
    addPress(game, { title: 'Técnico denuncia esquema de apostas', text: `${c.name} levou o caso à polícia e foi elogiado.`, tone: 'good' });
    return { msg: '🛡️ Você denunciou o esquema. Diretoria +5, torcida +5.' };
  }
  c.board = clamp(c.board + 1, 0, 100);
  return { msg: 'Você recusou. O jogo é limpo.' };
}

// Antes do jogo: marca o time do usuário para "entregar"
export function applyFix(game, m) {
  if (!game.betDeal || game.mode === 'player') return;
  const i = m.teams.findIndex(t => t.club.id === game.userClubId);
  if (i >= 0) m.fixSide = i;
}

// ---------- Depois do jogo do usuário ----------
// fixture: o confronto (copa) para poder desclassificar
export function afterFixMatch(game, m, fixture) {
  const msgs = [];
  // doping: exame após cada jogo em que o jogador atuou
  if (game.mode === 'player' && game.pc.doping) {
    const pc = game.pc, p = game.players[pc.id];
    const t = m.teams.find(x => x.club.id === p.clubId);
    if (t && t.used.has(p.id)) {
      pc.doping.left--;
      if (rnd() < 0.06) {
        pc.doping = null;
        pc.ban = 12; p.suspended = Math.max(p.suspended, 12);
        pc.trust = clamp(pc.trust - 25, 0, 100);
        if (pc.life) pc.life.fame = clamp(pc.life.fame - 20, 0, 100);
        addPress(game, { title: `ESCÂNDALO: ${p.name} é pego no antidoping`, text: 'Suspensão de 12 semanas. Torcida e clube estão revoltados.', tone: 'bad' });
        msgs.push(`🚨 ANTIDOPING: você foi sorteado e o exame deu positivo! Suspenso por 12 semanas. Confiança do técnico −25, fama −20.`);
      } else if (pc.doping.left <= 0) { pc.doping = null; msgs.push('😮‍💨 O efeito do "suco" passou e você não foi pego. Desta vez…'); }
      else if (rnd() < 0.3) msgs.push('🧪 Você foi sorteado para o exame antidoping… e passou. Ufa!');
    }
    return msgs;
  }
  const d = game.betDeal;
  if (!d || game.mode === 'player') return msgs;
  game.betDeal = null;
  const c = game.coach;
  const i = m.teams.findIndex(t => t.club.id === game.userClubId);
  if (i < 0) return msgs;
  const lost = m.winnerIndex() === 1 - i;
  if (lost) { addTx(game, game.userClubId, 'Entrada não declarada', d.amount); msgs.push(`💰 O time perdeu e ${money(d.amount)} entraram por fora no caixa.`); }
  else msgs.push('😬 O time não perdeu. Os apostadores estão furiosos e não pagaram nada.');
  const received = lost ? d.amount : 0;
  if (m.knockout) {
    // investigação imediata
    if (rnd() < 0.35) {
      punish(game, received, `${m.cupName || d.comp}`);
      if (fixture && fixture.r && fixture.r.winner === game.userClubId) fixture.r.winner = m.teams[1 - i].club.id;
      msgs.push(`🚨 A polícia descobriu o esquema! Você foi ELIMINADO da ${m.cupName || d.comp}. Diretoria −30, torcida −30.`);
    }
  } else {
    game.betRisk = { season: game.season, leagueId: m.leagueId, weeks: 8, received };
  }
  return msgs;
}

function punish(game, received, where) {
  const c = game.coach;
  c.board = clamp(c.board - 30, 0, 100); c.fans = clamp(c.fans - 30, 0, 100);
  const club = clubById(game, game.userClubId);
  const fine = Math.round((received + (club.deal ? club.deal.base : club.sponsor) * 2) / 100000) * 100000;
  addTx(game, club.id, 'Multa e dinheiro confiscado (apostas)', -fine);
  addPress(game, { title: `ESCÂNDALO: ${club.name} envolvido em esquema de apostas`, text: `Investigação comprovou manipulação de resultado (${where}). Técnico ${c.name} sob pressão.`, tone: 'bad' });
}

// ---------- Toda semana ----------
export function weeklyEvents(game) {
  const msgs = [];
  if (game.pendingEvent && game.round > game.pendingEvent.expires) { game.pendingEvent = null; msgs.push('A proposta suspeita caducou.'); }
  // suspensão do jogador atravessa a virada de temporada
  if (game.mode === 'player' && game.pc.ban > 0) {
    const p = game.players[game.pc.id];
    game.pc.ban--;
    p.suspended = Math.max(p.suspended, game.pc.ban);
    if (game.pc.ban === 0) msgs.push('✅ Sua suspensão por doping terminou. Hora de recomeçar.');
  }
  // investigação das apostas (pontos corridos)
  const r = game.betRisk;
  if (r && game.mode !== 'player') {
    if (r.season !== game.season || r.weeks <= 0) { game.betRisk = null; msgs.push('😮‍💨 A investigação sobre as apostas foi arquivada. Ninguém descobriu… desta vez.'); }
    else {
      r.weeks--;
      if (rnd() < 0.05) {
        game.betRisk = null;
        const L = game.leagues.find(l => l.id === r.leagueId);
        if (L) {
          if (!L.penalties || L.penalties.season !== game.season) L.penalties = { season: game.season, map: {} };
          L.penalties.map[game.userClubId] = (L.penalties.map[game.userClubId] || 0) + 12;
        }
        punish(game, r.received, L ? L.name : 'liga');
        msgs.push(`🚨 A investigação descobriu o esquema de apostas! O clube perdeu 12 PONTOS na ${L ? L.name : 'liga'}. Diretoria −30, torcida −30, multa e dinheiro confiscado.`);
      }
    }
  }
  return msgs;
}

// Cartão do evento (para a tela)
export function eventView(game) {
  const ev = game.pendingEvent;
  if (!ev) return null;
  if (ev.kind === 'doping') return {
    emoji: '🧃', title: 'O "suco milagroso"',
    text: 'Um preparador de fora do clube oferece um suplemento que "faz o jogador voar". Ninguém precisa saber… mas o antidoping existe.',
    opts: [['yes', '💉 Tomar o suco', '+5 pontos de treino. Risco de ser pego: 12 semanas suspenso.'], ['no', '🙅 Recusar', 'Carreira limpa.'], ['report', '🛡️ Denunciar', 'Ganha respeito do técnico e da torcida.']] };
  return {
    emoji: '🕵️', title: 'Esquema de apostas',
    text: `Um apostador oferece ${money(ev.amount)} para o seu time perder o próximo jogo (${ev.comp}${ev.stage ? ' · ' + ev.stage : ''}). Ninguém precisa saber… mas a polícia investiga.`,
    opts: [['yes', '💰 Aceitar', ev.knockout ? 'Se for descoberto: eliminado da copa, multa, diretoria e torcida −30.' : 'Se for descoberto: −12 pontos na liga, multa, diretoria e torcida −30.'], ['no', '🙅 Recusar', 'O jogo é limpo.'], ['report', '🛡️ Denunciar à polícia', 'Diretoria e torcida +5.']] };
}
