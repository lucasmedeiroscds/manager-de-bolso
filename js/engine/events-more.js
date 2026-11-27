// =============================================================
// events-more.js — MAIS EVENTOS ALEATÓRIOS (vida de vestiário)
// =============================================================
// Cada evento: quando pode acontecer (when), o texto e as opções.
// O efeito real só aparece depois da escolha, e algumas opções
// dependem da sorte. Usado por events.js (sorteio e cartão no Início).
// Clubes/jogadores citados são os do próprio jogo; nada inventado
// sobre pessoas reais além do que o jogo já simula.
// =============================================================
import { clamp, rnd, pick, money, newId } from '../util.js';
import { overall, wageDemand } from './ratings.js';
import { clubById, windowOpen, acceptOffer } from './market.js';
import { addTx } from './finance.js';
import { addPress } from './press.js';

const squadOf = g => Object.values(g.players).filter(p => p.clubId === g.userClubId && !p.loan);
const mood = (p, v) => { p.moral = clamp(p.moral + v, 5, 100); };
const coachFx = (g, board = 0, fans = 0) => { const c = g.coach; if (c) { c.board = clamp(c.board + board, 0, 100); c.fans = clamp(c.fans + fans, 0, 100); } };
const sign = v => (v > 0 ? '+' : '') + v;
const weekly = g => { const c = clubById(g, g.userClubId); return c.deal ? c.deal.base : c.sponsor; };
const richForeign = g => {
  const L = g.leagues.find(l => l.country === 'Arábia Saudita');
  const pool = L ? L.clubIds.map(id => clubById(g, id)).filter(Boolean) : g.clubs.filter(c => c.country !== clubById(g, g.userClubId).country);
  return pool.filter(c => c.id !== g.userClubId).sort((a, b) => b.budget - a.budget)[0] || null;
};
const life = g => g.pc && g.pc.life;

// ---------------- MODO TÉCNICO ----------------
const COACH = [
  { id: 'balada', w: 3, when: g => squadOf(g).some(p => p.age <= 30),
    make: g => { const p = pick(squadOf(g).filter(x => x.age <= 30).sort((a, b) => overall(b) - overall(a)).slice(0, 14)); return { p: p.id }; },
    view: (g, e) => ({ emoji: '🍾', title: 'Flagrado na balada', text: `${g.players[e.p].name} foi fotografado numa festa até de madrugada, dois dias antes do jogo. As fotos estão nas redes.` }),
    opts: [
      ['Multar o jogador', 'Ele fica chateado, mas o grupo vê que tem regra.', (g, e) => { const p = g.players[e.p]; mood(p, -12); coachFx(g, 2, 1); addTx(g, g.userClubId, `Multa de ${p.name}`, Math.round(p.contract.wage * 0.3)); return `${p.name} −12 de moral · diretoria +2 · multa no caixa.`; }],
      ['Afastar por 1 jogo', 'Punição dura. O elenco aprova; ele não.', (g, e) => { const p = g.players[e.p]; mood(p, -8); p.suspended = Math.max(p.suspended, 1); for (const x of squadOf(g)) if (x !== p) mood(x, 2); coachFx(g, 3, 0); return `${p.name} fora do próximo jogo · elenco +2 · diretoria +3.`; }],
      ['Deixar passar', 'Ele agradece; os outros percebem.', (g, e) => { const p = g.players[e.p]; mood(p, 4); for (const x of squadOf(g)) if (x !== p) mood(x, -2); coachFx(g, -3, -1); return `${p.name} +4 · resto do elenco −2 · diretoria −3.`; }]] },

  { id: 'briga', w: 3, when: g => squadOf(g).length >= 12,
    make: g => { const s = squadOf(g).sort((a, b) => overall(b) - overall(a)).slice(0, 16); const a = pick(s); const b = pick(s.filter(x => x !== a)); return { a: a.id, b: b.id }; },
    view: (g, e) => ({ emoji: '🥊', title: 'Briga no vestiário', text: `${g.players[e.a].name} e ${g.players[e.b].name} discutiram feio depois do treino e quase saíram no braço.` }),
    opts: [
      ['Punir os dois', 'Regra é regra.', (g, e) => { mood(g.players[e.a], -8); mood(g.players[e.b], -8); coachFx(g, 2, 0); return 'Os dois −8 de moral · diretoria +2.'; }],
      ['Tomar o lado do mais experiente', 'Hierarquia no grupo.', (g, e) => { let [x, y] = [g.players[e.a], g.players[e.b]]; if (y.age > x.age) [x, y] = [y, x]; mood(x, 6); mood(y, -15); y.unhappy = true; return `${x.name} +6 · ${y.name} −15 e insatisfeito.`; }],
      ['Reunir os dois para conversar', 'Pode resolver… ou piorar.', (g, e) => { if (rnd() < 0.55) { mood(g.players[e.a], 4); mood(g.players[e.b], 4); for (const x of squadOf(g)) mood(x, 1); return '🤝 Deu certo! Os dois fizeram as pazes (+4) e o grupo se uniu (+1).'; } mood(g.players[e.a], -6); mood(g.players[e.b], -6); return '😤 Não deu certo: a discussão voltou (os dois −6).'; }]] },

  { id: 'aumento', w: 2, when: g => squadOf(g).length > 0,
    make: g => ({ p: squadOf(g).sort((a, b) => overall(b) - overall(a))[0].id }),
    view: (g, e) => { const p = g.players[e.p]; return { emoji: '💼', title: 'O craque quer aumento', text: `${p.name}, o melhor do elenco, pede aumento de 30% (de ${money(p.contract.wage)} para ${money(Math.round(p.contract.wage * 1.3))}/semana). O empresário dele está "ouvindo propostas".` }; },
    opts: [
      ['Dar o aumento', 'Ele fica feliz; a folha sobe.', (g, e) => { const p = g.players[e.p]; p.contract.wage = Math.round(p.contract.wage * 1.3 / 100) * 100; mood(p, 12); delete p.unhappy; return `${p.name} +12 de moral · salário agora ${money(p.contract.wage)}/semana.`; }],
      ['Negar', 'A folha agradece. Ele, não.', (g, e) => { const p = g.players[e.p]; mood(p, -15); p.unhappy = true; if (rnd() < 0.4) { coachFx(g, 0, -3); addPress(g, { title: `${p.name} reclama publicamente do salário`, text: 'O jogador deu a entender que pode sair.', tone: 'bad' }); return `${p.name} −15 e foi reclamar na imprensa (torcida −3).`; } return `${p.name} −15 de moral e ficou insatisfeito.`; }],
      ['Prometer renovar no fim da temporada', 'Ganha tempo.', (g, e) => { const p = g.players[e.p]; mood(p, 3); p.raisePromise = g.season; return `${p.name} +3. Ele vai lembrar da promessa.`; }]] },

  { id: 'arabe', w: 2, when: g => windowOpen(g) && !!richForeign(g) && squadOf(g).length > 18,
    make: g => { const p = squadOf(g).sort((a, b) => overall(b) - overall(a))[Math.floor(rnd() * 3)]; const c = richForeign(g); return { p: p.id, c: c.id, fee: Math.round(p.value * (2.2 + rnd() * 0.8) / 100000) * 100000 }; },
    view: (g, e) => ({ emoji: '🛢️', title: 'Proposta milionária do exterior', text: `O ${clubById(g, e.c).name} oferece ${money(e.fee)} por ${g.players[e.p].name} (valor de mercado: ${money(g.players[e.p].value)}). Ele ganharia três vezes mais.` }),
    opts: [
      ['Vender', 'Dinheiro no caixa; a torcida vai sentir.', (g, e) => { const id = newId('o'); g.inbox.unshift({ id, type: 'offer', playerId: e.p, clubId: e.c, fee: e.fee, expires: g.round + 1 }); const r = acceptOffer(g, id); if (r.ok) coachFx(g, 4, -5); return r.ok ? `${r.msg} Diretoria +4, torcida −5.` : r.msg; }],
      ['Recusar', 'Mantém o craque… que sonhava com a fortuna.', (g, e) => { const p = g.players[e.p]; coachFx(g, -1, 4); if (rnd() < 0.6) { mood(p, -12); p.unhappy = true; return `Torcida +4. Mas ${p.name} queria ir: moral −12 e insatisfeito.`; } return `Torcida +4. ${p.name} entendeu e ficou.`; }]] },

  { id: 'empresario', w: 2, when: g => squadOf(g).some(p => p.age <= 20),
    make: g => ({ p: squadOf(g).filter(p => p.age <= 20).sort((a, b) => b.potential - a.potential)[0].id }),
    view: (g, e) => { const p = g.players[e.p]; return { emoji: '🕴️', title: 'Empresário rondando a joia', text: `Um empresário está assediando ${p.name} (${p.age} anos, potencial ${p.potential}) e prometendo levá-lo para a Europa.` }; },
    opts: [
      ['Renovar por 5 anos com aumento', 'Blinda a joia.', (g, e) => { const p = g.players[e.p]; p.contract = { wage: Math.round(Math.max(p.contract.wage * 1.6, wageDemand(p)) / 100) * 100, years: 5 }; mood(p, 8); return `${p.name} renovou até ${g.season + 5} (+8 de moral) por ${money(p.contract.wage)}/semana.`; }],
      ['Conversar com a família', 'Sem custo… sem garantia.', (g, e) => { const p = g.players[e.p]; if (rnd() < 0.6) { mood(p, 5); return `A família confia no clube. ${p.name} +5.`; } mood(p, -10); p.unhappy = true; return `O empresário venceu a conversa: ${p.name} −10 e de cabeça na Europa.`; }],
      ['Ignorar', 'Talvez nem seja sério.', (g, e) => { const p = g.players[e.p]; mood(p, -4); return `${p.name} −4. O empresário continua por perto.`; }]] },

  { id: 'campanha', w: 2, when: g => squadOf(g).length > 0,
    make: g => ({ p: squadOf(g).sort((a, b) => overall(b) - overall(a))[0].id, v: Math.round(weekly(g) * (0.4 + rnd() * 0.4) / 10000) * 10000 }),
    view: (g, e) => ({ emoji: '📸', title: 'Campanha publicitária', text: `Uma marca quer ${g.players[e.p].name} numa gravação de comercial no meio da semana e paga ${money(e.v)} ao clube.` }),
    opts: [
      ['Liberar', 'Dinheiro, mas ele perde treino.', (g, e) => { const p = g.players[e.p]; addTx(g, g.userClubId, 'Campanha publicitária', e.v); p.fitness = clamp(p.fitness - 12, 10, 100); mood(p, 5); return `+${money(e.v)} no caixa · ${p.name} físico −12, moral +5.`; }],
      ['Não liberar', 'Foco total no jogo.', (g, e) => { mood(g.players[e.p], -3); coachFx(g, -1, 0); return `${g.players[e.p].name} −3 · diretoria −1.`; }]] },

  { id: 'beneficente', w: 2, when: () => true, make: () => ({}),
    view: () => ({ emoji: '💚', title: 'Jogo beneficente', text: 'Uma ONG convida o elenco para um jogo beneficente no meio da semana, em hospital infantil.' }),
    opts: [
      ['Aceitar com o elenco todo', 'A cidade adora; as pernas sentem.', g => { for (const p of squadOf(g)) { p.fitness = clamp(p.fitness - 7, 10, 100); mood(p, 3); } coachFx(g, 1, 5); return 'Torcida +5, diretoria +1, elenco +3 de moral · físico −7.'; }],
      ['Mandar só os reservas', 'Meio-termo.', g => { const xi = new Set(clubById(g, g.userClubId).lineup); for (const p of squadOf(g)) if (!xi.has(p.id)) mood(p, 4); coachFx(g, 0, 2); return 'Torcida +2 · reservas +4 de moral.'; }],
      ['Recusar', 'Calendário apertado.', g => { coachFx(g, 0, -3); return 'Torcida −3.'; }]] },

  { id: 'lesaoFinal', w: 3, when: g => squadOf(g).some(p => p.injury === 1 && overall(p) >= 60),
    make: g => ({ p: squadOf(g).filter(p => p.injury === 1).sort((a, b) => overall(b) - overall(a))[0].id }),
    view: (g, e) => ({ emoji: '💉', title: 'Infiltração?', text: `O médico diz que ${g.players[e.p].name} pode jogar o próximo jogo com uma infiltração, mas corre risco de a lesão piorar.` }),
    opts: [
      ['Infiltrar e escalar', 'Ele joga… com risco.', (g, e) => { const p = g.players[e.p]; p.injury = 0; p.fitness = Math.min(p.fitness, 80); if (rnd() < 0.3) { p.injuryRisk = true; p.fitness = 60; return `${p.name} liberado, mas sentindo dores (físico 60).`; } return `${p.name} liberado para o jogo!`; }],
      ['Poupar', 'Saúde primeiro.', (g, e) => { mood(g.players[e.p], 2); return `${g.players[e.p].name} fica fora e agradece (+2).`; }]] }
];

// ---------------- MODO JOGADOR ----------------
const PLAYER = [
  { id: 'pBalada', w: 3, when: () => true, make: () => ({}),
    view: () => ({ emoji: '🎉', title: 'Convite para a balada', text: 'Seus amigos chamaram para uma festa hoje à noite. O jogo é daqui a dois dias…' }),
    opts: [
      ['Ir para a festa', 'Diversão garantida. Fotos também.', g => { const p = g.players[g.pc.id]; mood(p, 8); p.fitness = clamp(p.fitness - 15, 10, 100); if (rnd() < 0.35) { g.pc.trust = clamp(g.pc.trust - 8, 0, 100); if (life(g)) life(g).fame = clamp(life(g).fame - 3, 0, 100); addPress(g, { title: `${p.name} é flagrado em festa antes do jogo`, text: 'O técnico não gostou nada.', tone: 'bad' }); return '📸 Vazaram fotos! Confiança do técnico −8, fama −3. (moral +8, físico −15)'; } return 'Noite ótima e ninguém viu. Moral +8, físico −15.'; }],
      ['Ficar em casa descansando', 'Profissional.', g => { const p = g.players[g.pc.id]; p.fitness = clamp(p.fitness + 5, 10, 100); g.pc.trust = clamp(g.pc.trust + 1, 0, 100); return 'Físico +5, confiança +1.'; }]] },

  { id: 'pProvoca', w: 2, when: () => true, make: () => ({}),
    view: () => ({ emoji: '😠', title: 'Provocação no treino', text: 'Um veterano do elenco vive pegando no seu pé no treino e hoje passou do limite na frente de todo mundo.' }),
    opts: [
      ['Responder à altura', 'Mostrar que não leva desaforo.', g => { if (rnd() < 0.5) { if (life(g)) life(g).fame = clamp(life(g).fame + 2, 0, 100); g.pc.trust = clamp(g.pc.trust - 2, 0, 100); return 'O grupo te respeitou mais (fama +2), mas o técnico não gostou (−2).'; } g.pc.trust = clamp(g.pc.trust - 7, 0, 100); return 'Virou confusão e o técnico tomou o lado do veterano (confiança −7).'; }],
      ['Ignorar e treinar', 'Responde em campo.', g => { g.pc.trust = clamp(g.pc.trust + 2, 0, 100); g.pc.xp += 5; return 'Confiança +2 e +5 de experiência.'; }],
      ['Conversar com o técnico', 'Resolver do jeito certo.', g => { g.pc.trust = clamp(g.pc.trust + 3, 0, 100); return 'O técnico conversou com o veterano. Confiança +3.'; }]] },

  { id: 'pCampanha', w: 2, when: g => !!life(g) && life(g).fame >= 15, make: g => ({ v: Math.round(life(g).fame * 1500 / 1000) * 1000 }),
    view: (g, e) => ({ emoji: '📸', title: 'Comercial de TV', text: `Uma marca quer você num comercial e paga ${money(e.v)}. A gravação é no dia de folga.` }),
    opts: [
      ['Fazer o comercial', 'Dinheiro e fama.', (g, e) => { const L = life(g); L.cash += e.v; L.fame = clamp(L.fame + 3, 0, 100); g.players[g.pc.id].fitness -= 6; return `+${money(e.v)} na conta, fama +3, físico −6.`; }],
      ['Recusar e descansar', 'Foco no futebol.', g => { g.players[g.pc.id].fitness = clamp(g.players[g.pc.id].fitness + 4, 10, 100); return 'Físico +4.'; }]] },

  { id: 'pCaridade', w: 1, when: g => !!life(g) && life(g).cash > 20000, make: g => ({ v: Math.round(life(g).cash * 0.1 / 1000) * 1000 }),
    view: (g, e) => ({ emoji: '💚', title: 'Projeto social', text: `O projeto social do bairro onde você cresceu precisa de ajuda. Doar ${money(e.v)}?` }),
    opts: [
      ['Doar', 'Fazer a diferença.', (g, e) => { const L = life(g); L.cash -= e.v; L.fame = clamp(L.fame + 5, 0, 100); mood(g.players[g.pc.id], 6); addPress(g, { title: `${g.players[g.pc.id].name} ajuda projeto social onde cresceu`, text: 'O gesto foi muito elogiado.', tone: 'good' }); return `Fama +5, moral +6 (−${money(e.v)}).`; }],
      ['Agora não', 'Fica para depois.', () => 'Tudo bem.']] },

  { id: 'pArabe', w: 2, when: g => windowOpen(g) && !!richForeign(g) && overall(g.players[g.pc.id]) >= 62,
    make: g => { const c = richForeign(g), p = g.players[g.pc.id]; return { c: c.id, wage: Math.round(Math.max(p.contract.wage, wageDemand(p)) * 3 / 100) * 100 }; },
    view: (g, e) => ({ emoji: '🛢️', title: 'Proposta milionária', text: `O ${clubById(g, e.c).name} quer você ganhando ${money(e.wage)} por semana (três vezes mais). Mas é longe dos holofotes do futebol europeu e da seleção.` }),
    opts: [
      ['Ouvir a proposta', 'Ela vai para a sua lista de propostas.', (g, e) => { const p = g.players[g.pc.id]; g.pc.offers.push({ clubId: e.c, wage: e.wage, years: 3, role: 'Titular', fee: Math.round(p.value * 1.2 / 10000) * 10000, expires: g.round + 3 }); return 'A proposta está na tela Carreira. Você tem 3 semanas para decidir.'; }],
      ['Recusar: meu sonho é outro', 'A torcida adora.', g => { if (life(g)) life(g).fame = clamp(life(g).fame + 3, 0, 100); g.pc.trust = clamp(g.pc.trust + 2, 0, 100); return 'Fama +3, confiança +2.'; }]] }
];

// ---------- API usada por events.js ----------
export function rollGeneric(game) {
  const pool = (game.mode === 'player' ? PLAYER : COACH).filter(d => { try { return d.when(game); } catch { return false; } });
  const recent = (game.evState && game.evState.recent) || [];
  const fresh = pool.filter(d => !recent.includes(d.id));
  const list = fresh.length ? fresh : pool;
  if (!list.length) return null;
  let x = rnd() * list.reduce((s, d) => s + d.w, 0);
  const d = list.find(z => (x -= z.w) <= 0) || list[0];
  let data;
  try { data = d.make(game); } catch { return null; }
  if (game.evState) game.evState.recent = [...recent, d.id].slice(-4);
  return { kind: 'gen', id: d.id, season: game.season, round: game.round, expires: game.round + 2, ...data };
}
const defOf = (game, ev) => ev.id === 'medico' ? MEDICO : (game.mode === 'player' ? PLAYER : COACH).find(d => d.id === ev.id);
export function genView(game, ev) {
  const d = defOf(game, ev);
  if (!d) return null;
  try { const v = d.view(game, ev); return { ...v, opts: d.opts.map(([l, desc], i) => [String(i), l, desc]) }; } catch { return null; }
}
export function genAnswer(game, ev, choice) {
  const d = defOf(game, ev);
  const o = d && d.opts[Number(choice)];
  if (!o) return { msg: '' };
  try { return { msg: o[2](game, ev) }; } catch { return { msg: 'O caso se resolveu sozinho.' }; }
}

// ---------- Lesão grave no seu time: o médico pede uma decisão ----------
const MEDICO = {
  view: (g, e) => { const p = g.players[e.p]; return { emoji: '🩺', title: 'Decisão do departamento médico', text: `${p.name} se machucou e deve ficar ${e.w} semanas fora. O médico apresenta três caminhos.` }; },
  opts: [
    ['Tratamento normal', 'Prazo do médico, sem risco.', (g, e) => `${g.players[e.p].name} volta em ${g.players[e.p].injury} semana(s).`],
    ['Clínica especializada', 'Volta antes, mas custa caro.', (g, e) => { const p = g.players[e.p], w = Math.max(1, Math.ceil(p.injury * 0.6)); const c = clubById(g, g.userClubId); const cost = Math.round((c.deal ? c.deal.base : c.sponsor) * 0.35 / 10000) * 10000; addTx(g, c.id, `Clínica para ${p.name}`, -cost); p.injury = w; return `${p.name} volta em ${w} semana(s) (custo ${money(cost)}).`; }],
    ['Acelerar com infiltração', 'Volta bem antes… se o corpo aguentar.', (g, e) => { const p = g.players[e.p], w = Math.max(1, Math.ceil(p.injury * 0.4)); p.injury = w; p.relapseRisk = true; mood(p, -3); return `${p.name} volta em ${w} semana(s). Torça para a lesão não voltar.`; }]
  ]
};
export function triggerMedical(game, m) {
  if (game.mode === 'player' || game.pendingEvent) return false;
  const t = m.teams.find(x => x.club.id === game.userClubId);
  if (!t) return false;
  const hurt = [...t.used].map(id => game.players[id]).filter(p => p && p.injury >= 3).sort((a, b) => overall(b) - overall(a))[0];
  if (!hurt || hurt.medDone === g_key(game)) return false;
  hurt.medDone = g_key(game);
  game.pendingEvent = { kind: 'gen', id: 'medico', p: hurt.id, w: hurt.injury, season: game.season, round: game.round, expires: game.round + 1 };
  return true;
}
const g_key = g => g.season + ':' + g.round;
// Recaída de quem acelerou a volta
export function relapseCheck(game) {
  const msgs = [];
  for (const p of Object.values(game.players)) {
    if (!p.relapseRisk || p.injury > 0) continue;
    delete p.relapseRisk;
    if (p.clubId === game.userClubId && rnd() < 0.35) { p.injury = 3 + Math.floor(rnd() * 4); msgs.push(`🚑 Recaída! A lesão de ${p.name} voltou: mais ${p.injury} semanas fora.`); }
  }
  return msgs;
}
