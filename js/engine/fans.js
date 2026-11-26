// =============================================================
// fans.js — TORCIDA ORGANIZADA
// =============================================================
// Depois de cada jogo do usuário a torcida pode reagir:
//  • PROTESTO (torcida irritada + derrotas): moral do elenco cai,
//    diretoria pressiona.
//  • FESTA / MOSAICO (torcida feliz + vitórias ou clássico vencido):
//    moral sobe e o clube vende mais produtos.
// Cada evento tem um intervalo mínimo, para não acontecer toda semana.
// =============================================================
import { clamp, rnd, pick } from '../util.js';
import { addTx } from './finance.js';
import { clubById } from './market.js';
import { addPress } from './press.js';

export function fansAfterMatch(game, m) {
  const c = game.coach;
  if (!c || c.fired || game.mode === 'player') return [];
  const i = m.teams.findIndex(t => t.club.id === game.userClubId);
  if (i < 0) return [];
  const t = m.teams[i], o = m.teams[1 - i];
  const w = m.winnerIndex();
  const res = w === i ? 'V' : w === -1 ? 'E' : 'D';
  const f = game.fanState || (game.fanState = { form: [], cool: 0 });
  f.form = [...f.form, res].slice(-5);
  if (f.cool > 0) { f.cool--; return []; }
  const last3 = f.form.slice(-3), losses = last3.filter(x => x === 'D').length, wins = last3.filter(x => x === 'V').length;
  const club = clubById(game, game.userClubId);
  const squad = Object.values(game.players).filter(p => p.clubId === game.userClubId);
  const msgs = [];

  if (c.fans < 35 && losses >= 2 && rnd() < 0.6) {
    const what = pick(['protestou no CT e cobrou os jogadores', 'estendeu faixas pedindo raça', 'vaiou o time do começo ao fim', 'fez um protesto na porta do estádio']);
    for (const p of squad) p.moral = clamp(p.moral - 4, 5, 100);
    c.board = clamp(c.board - 3, 0, 100);
    f.cool = 4;
    msgs.push(`📢 A torcida organizada ${what}. Moral do elenco −4, diretoria pressionada.`);
    addPress(game, { title: `Protesto: torcida do ${club.name} ${what}`, text: 'O clima esquentou depois da sequência ruim.', tone: 'bad' });
  } else if (c.fans >= 65 && res === 'V' && (m.derby || wins === 3 || (m.knockout && m.stage === 'Final'))) {
    const what = m.derby ? `fez um mosaico gigante no ${m.derby}` : pick(['fez uma festa linda na arquibancada', 'cantou do começo ao fim', 'recebeu o ônibus do time com sinalizadores']);
    for (const p of squad) p.moral = clamp(p.moral + 4, 5, 100);
    c.fans = clamp(c.fans + 2, 0, 100);
    const sales = Math.round(m.attendance * club.ticketPrice * 0.15 / 1000) * 1000;
    if (sales > 0) addTx(game, club.id, 'Venda de camisas e produtos (festa da torcida)', sales);
    f.cool = 4;
    msgs.push(`🎉 A torcida ${what}! Moral do elenco +4.`);
    addPress(game, { title: `Festa: torcida do ${club.name} ${what}`, text: `Vitória sobre o ${o.club.name} e arquibancada em êxtase.`, tone: 'good' });
  }
  return msgs;
}
