// =============================================================
// interviews.js — ENTREVISTAS DEPOIS DO JOGO
// =============================================================
// • Muitas perguntas, escolhidas pelo CONTEXTO: resultado, clássico,
//   sequência de vitórias/derrotas, posição na tabela, craque do jogo,
//   expulsão, pênaltis, eliminação, ultimato, diretoria/torcida...
// • Cada resposta tem um TOM (humilde, confiante, crítico, polêmico,
//   evasivo, elogio). Repetir o mesmo tom em seguida perde efeito e
//   pode até sair pela culatra ("discurso batido").
// • Os efeitos variam (sorte + contexto) e só aparecem DEPOIS da
//   escolha. A ordem das respostas muda a cada entrevista.
// • PROMESSAS: prometer vitória cobra no jogo seguinte (bônus se
//   cumprir, vexame se não cumprir).
// =============================================================
import { clamp, pick, rnd } from '../util.js';
import { addPress } from './press.js';
import { clubById } from './market.js';
import { standings } from './season.js';

const TONES = {
  humilde: 'humilde', confiante: 'confiante', critico: 'crítico', polemico: 'polêmico', evasivo: 'evasivo', elogio: 'elogio', promessa: 'promessa'
};

function state(game) {
  return game.pressState || (game.pressState = { form: [], tones: [], lastQ: [], promise: null });
}

// ---------- Contexto do jogo ----------
function buildCtx(game, m) {
  const i = m.teams.findIndex(t => t.club.id === game.userClubId);
  if (i < 0) return null;
  const t = m.teams[i], o = m.teams[1 - i];
  const w = m.winnerIndex();
  const res = w === i ? 'win' : w === -1 ? 'draw' : 'loss';
  const st = state(game);
  st.form = [...st.form, res].slice(-6);
  const counts = {};
  for (const s of t.scorers) counts[s.id] = (counts[s.id] || 0) + 1;
  const starId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const star = starId && counts[starId] >= 2 ? game.players[starId] : null;
  let streakW = 0, streakL = 0, unbeaten = 0;
  for (const r of st.form.slice().reverse()) { if (r === 'win') streakW++; else break; }
  for (const r of st.form.slice().reverse()) { if (r === 'loss') streakL++; else break; }
  for (const r of st.form.slice().reverse()) { if (r !== 'loss') unbeaten++; else break; }
  let pos = 0, n = 0;
  try { const L = game.leagues.find(l => l.clubIds.includes(game.userClubId)); const tab = standings(game, L.id); n = tab.length; pos = tab.findIndex(s => s.id === game.userClubId) + 1; } catch { /* */ }
  const c = game.coach;
  const squad = Object.values(game.players).filter(p => p.clubId === game.userClubId);
  const moral = squad.length ? squad.reduce((s, p) => s + p.moral, 0) / squad.length : 60;
  const young = squad.filter(p => p.age <= 20 && t.used.has(p.id)).sort((a, b) => b.potential - a.potential)[0] || null;
  const pc = game.pc ? game.players[game.pc.id] : null;
  const pcGoals = pc ? t.scorers.filter(s => s.id === pc.id).length : 0;
  const pcAssists = pc ? t.scorers.filter(s => s.assist === pc.id).length : 0;
  const pcRating = pc && m.ratings && m.ratings[pc.id] != null ? m.ratings[pc.id] : null;
  return {
    m, i, t, o, res, diff: t.goals - o.goals, gf: t.goals, ga: o.goals, us: t.club.name, them: o.club.name,
    star, starGoals: star ? counts[star.id] : 0, derby: m.derby, cup: m.cupName, stage: m.stage, knockout: m.knockout,
    out: m.knockout && w !== i, pens: !!m.pens, red: t.stats && t.stats.red, oppRed: o.stats && o.stats.red,
    streakW, streakL, unbeaten, pos, n, top: pos && pos <= Math.max(2, Math.ceil(n * 0.15)), bottom: pos && n && pos > n - Math.ceil(n * 0.2),
    round: game.round, early: game.round <= 4, late: n && game.round >= (n - 1) * 2 - 6,
    board: c ? c.board : 60, fans: c ? c.fans : 60, ultimatum: !!(c && c.ultimatum), moral, young,
    stronger: (o.club.rep || 0) - (t.club.rep || 0) >= 8, weaker: (t.club.rep || 0) - (o.club.rep || 0) >= 8,
    pc, pcUsed: pc ? t.used.has(pc.id) : false, pcGoals, pcAssists, pcRating, pcRole: game.pc ? game.pc.role : '', trust: game.pc ? game.pc.trust : 0
  };
}

// ---------- Perguntas do TÉCNICO ----------
// fx: moral (elenco), board, fans, star (moral do craque), young (moral do garoto)
// gamble: [fxBom, fxRuim] — 50% de chance para cada
const COACH = [
  // ---- vitórias
  { id: 'win1', w: 1, when: c => c.res === 'win' && c.diff < 3, q: c => `Vitória sobre o ${c.them}. A que você atribui o resultado?`, a: [
    ['Mérito total dos jogadores. Eles merecem.', 'elogio', { moral: 4, fans: 1 }],
    ['A estratégia funcionou exatamente como planejamos.', 'confiante', { board: 3, moral: -1 }],
    ['Ganhamos, mas ainda temos muito a melhorar.', 'humilde', { board: 2, moral: 1 }],
    ['Foi sofrido. Sorte que o goleiro deles não estava num bom dia.', 'evasivo', { moral: -1, fans: 1 }]] },
  { id: 'win2', w: 1, when: c => c.res === 'win' && c.ga > 0, q: c => `O time venceu, mas sofreu ${c.ga} gol(s). A defesa preocupa?`, a: [
    ['Preocupa, sim. Vamos trabalhar isso a semana toda.', 'humilde', { board: 2, moral: -1 }],
    ['Quem faz mais gols ganha. Estou tranquilo.', 'confiante', { fans: 2, board: -1 }],
    ['Os defensores sabem que erraram. Não vou expor ninguém.', 'evasivo', { moral: 2 }]] },
  { id: 'bigwin', w: 2, when: c => c.res === 'win' && c.diff >= 3, q: c => `${c.gf} x ${c.ga}! O time já pode sonhar alto?`, a: [
    ['Sim, somos candidatos a tudo nesta temporada!', 'confiante', { fans: 5, moral: 3, board: -1 }],
    ['Pés no chão. Goleada não ganha campeonato.', 'humilde', { board: 3, moral: 1 }],
    ['O adversário facilitou muito. Não dá para se iludir.', 'critico', { moral: -3, board: 1 }],
    ['Quero ver a mesma fome no próximo jogo. Isso eu prometo.', 'promessa', { fans: 3, moral: 2 }, 'promise']] },
  { id: 'upset', w: 3, when: c => c.res === 'win' && c.stronger, q: c => `Vencer o ${c.them}, que tem um elenco bem mais caro, foi uma zebra?`, a: [
    ['Zebra nada. Merecemos e jogamos melhor.', 'confiante', { fans: 4, moral: 3 }],
    ['Respeitamos muito o adversário. Foi um dia especial.', 'humilde', { board: 3, fans: 1 }],
    ['Dinheiro não entra em campo. Isso aqui é trabalho.', 'polemico', null, null, [{ fans: 6, board: 1 }, { fans: 2, board: -3 }]]] },
  { id: 'streakW', w: 3, when: c => c.res === 'win' && c.streakW >= 3, q: c => `${c.streakW} vitórias seguidas. Qual é o segredo?`, a: [
    ['O grupo está fechado e confiante. Mérito deles.', 'elogio', { moral: 3, fans: 2 }],
    ['Trabalho. Não tem segredo, tem treino.', 'humilde', { board: 3 }],
    ['Agora ninguém segura a gente. Pode escrever.', 'promessa', { fans: 4, moral: 2 }, 'promise'],
    ['Prefiro não falar de sequência para não dar azar.', 'evasivo', { moral: 1 }]] },
  // ---- empates
  { id: 'draw1', w: 1, when: c => c.res === 'draw', q: c => `Empate com o ${c.them}. Foi um resultado justo?`, a: [
    ['Merecíamos vencer. Criamos mais.', 'confiante', { moral: 2, fans: 1 }],
    ['Um ponto que pode fazer diferença lá na frente.', 'humilde', { board: 2 }],
    ['Jogamos mal. O empate saiu barato.', 'critico', { moral: -3, board: 1, fans: 1 }],
    ['A arbitragem deixou de marcar um pênalti claro para nós.', 'polemico', null, null, [{ fans: 4 }, { fans: 1, board: -3 }]]] },
  { id: 'draw2', w: 2, when: c => c.res === 'draw' && c.weaker, q: c => `Empatar com o ${c.them}, mais fraco no papel, decepciona?`, a: [
    ['Decepciona, sim. Esse jogo era para ganhar.', 'critico', { moral: -2, board: 2, fans: 1 }],
    ['Não existe jogo fácil nesse campeonato.', 'humilde', { board: 1, moral: 1 }],
    ['O gramado estava péssimo, não deu para jogar o nosso futebol.', 'evasivo', { fans: -1 }]] },
  { id: 'draw0', w: 2, when: c => c.res === 'draw' && c.gf === 0, q: () => 'Zero a zero. Faltou criatividade ao time?', a: [
    ['Faltou. Vou cobrar mais ousadia dos meias.', 'critico', { moral: -2, board: 1 }],
    ['O adversário se fechou. Faz parte.', 'evasivo', { moral: 1 }],
    ['Prefiro um 0 x 0 seguro a uma derrota. Ponto é ponto.', 'humilde', { board: 2, fans: -2 }]] },
  // ---- derrotas
  { id: 'loss1', w: 1, when: c => c.res === 'loss' && c.diff > -3, q: c => `Derrota para o ${c.them}. O que faltou?`, a: [
    ['A culpa é minha. Eu assumo.', 'humilde', { moral: 3, fans: 2, board: -1 }],
    ['Faltou atitude dos jogadores.', 'critico', { moral: -5, board: 1, fans: 1 }],
    ['A arbitragem nos prejudicou.', 'polemico', null, null, [{ fans: 4, board: -1 }, { fans: 1, board: -4 }]],
    ['No próximo jogo a resposta vem. Pode cobrar.', 'promessa', { fans: 2, moral: 1 }, 'promise']] },
  { id: 'bigloss', w: 2, when: c => c.res === 'loss' && c.diff <= -3, q: c => `Levar ${c.ga} gols... Seu cargo está em risco?`, a: [
    ['Confio no trabalho. Vamos reagir.', 'confiante', { board: 2, moral: 1 }],
    ['Os jogadores precisam responder em campo.', 'critico', { moral: -4, board: 1 }],
    ['Peço desculpas à torcida. Foi vergonhoso.', 'humilde', { fans: 4, moral: -1 }],
    ['Quem decide isso é a diretoria. Eu só trabalho.', 'evasivo', { board: -1 }]] },
  { id: 'streakL', w: 3, when: c => c.res === 'loss' && c.streakL >= 3, q: c => `${c.streakL} derrotas seguidas. O vestiário ainda acredita em você?`, a: [
    ['Acredita. Estamos unidos e vamos sair dessa juntos.', 'confiante', null, null, [{ moral: 4, board: 1 }, { moral: -2, fans: -2 }]],
    ['Vou mexer no time. Quem não render vai para o banco.', 'critico', { moral: -4, board: 3, fans: 2 }],
    ['Eu sou o responsável. Se for para sair, saio de cabeça erguida.', 'humilde', { fans: 3, board: -2, moral: 2 }]] },
  { id: 'lossWeak', w: 2, when: c => c.res === 'loss' && c.weaker, q: c => `Perder para o ${c.them} foi um vexame?`, a: [
    ['Foi. Não tem desculpa.', 'humilde', { fans: 2, board: -1 }],
    ['Eles fizeram o jogo da vida. Faz parte do futebol.', 'evasivo', { fans: -2 }],
    ['Alguns jogadores acharam que ia ser fácil. Isso vai mudar.', 'critico', { moral: -4, board: 2, fans: 2 }]] },
  // ---- situações especiais
  { id: 'derbyW', w: 4, when: c => c.derby && c.res === 'win', q: c => `Vitória no ${c.derby}! Recado para a torcida rival?`, a: [
    ['A cidade tem dono. Hoje a festa é nossa!', 'polemico', null, null, [{ fans: 8, moral: 2 }, { fans: 5, board: -3 }]],
    ['Respeito o rival. Só dedico a vitória à nossa torcida.', 'humilde', { fans: 3, board: 2 }],
    ['Clássico se ganha, não se explica.', 'confiante', { fans: 5, moral: 2 }]] },
  { id: 'derbyL', w: 4, when: c => c.derby && c.res === 'loss', q: c => `Perder o ${c.derby} dói mais?`, a: [
    ['Dói demais. Peço desculpas à nossa torcida.', 'humilde', { fans: 3, moral: -1 }],
    ['Clássico é um jogo à parte. Agora é virar a página.', 'evasivo', { fans: -3, board: 1 }],
    ['Vamos dar o troco no returno. Pode anotar.', 'promessa', { fans: 4 }, 'promise']] },
  { id: 'derbyD', w: 3, when: c => c.derby && c.res === 'draw', q: c => `Empate no ${c.derby}. Gosto amargo ou ponto bom?`, a: [
    ['Amargo. Clássico é para ganhar.', 'critico', { fans: 2, moral: -1 }],
    ['Saímos invictos da casa deles. É um bom ponto.', 'confiante', { board: 1, fans: 1 }],
    ['Os dois times se respeitaram demais.', 'evasivo', { fans: -1 }]] },
  { id: 'star', w: 3, when: c => !!c.star, q: c => `${c.star.name} fez ${c.starGoals} gols. É o craque do time?`, a: [
    ['É o nosso grande jogador. Ninguém pode com ele.', 'elogio', { star: 10, moral: -1, fans: 2 }],
    ['Todos foram bem. O mérito é do grupo.', 'humilde', { moral: 3 }],
    ['Ele pode render ainda mais. Vou cobrar.', 'critico', { star: -4, board: 1 }],
    ['Se continuar assim, vai para a seleção. Pode escrever.', 'confiante', { star: 6, fans: 2 }]] },
  { id: 'young', w: 2, when: c => !!c.young && c.res !== 'loss', q: c => `O jovem ${c.young.name} (${c.young.age} anos) jogou hoje. Ele está pronto?`, a: [
    ['Está. Tem futuro enorme e vai ganhar minutos.', 'elogio', { young: 10, fans: 2 }],
    ['Calma. Não vamos queimar o garoto.', 'humilde', { young: 2, board: 2 }],
    ['Ainda precisa melhorar muito.', 'critico', { young: -6, board: 1 }]] },
  { id: 'red', w: 2, when: c => c.red, q: () => 'O time teve um expulso. Faltou cabeça?', a: [
    ['Faltou. Vou conversar com ele internamente.', 'humilde', { board: 2 }],
    ['O árbitro estava louco para mostrar o vermelho.', 'polemico', null, null, [{ fans: 3 }, { board: -3, fans: 1 }]],
    ['Jogador que deixa o time com dez vai sentir no bolso.', 'critico', { moral: -3, board: 3 }]] },
  { id: 'oppRed', w: 2, when: c => c.oppRed && c.res !== 'win', q: () => 'Com um a mais, por que o time não venceu?', a: [
    ['Faltou paciência para trabalhar a bola.', 'humilde', { board: 1 }],
    ['Eles se fecharam com dez atrás da linha da bola.', 'evasivo', { fans: -2 }],
    ['Não aceito. Quem não entendeu o jogo vai para o banco.', 'critico', { moral: -3, board: 2, fans: 2 }]] },
  { id: 'pens', w: 3, when: c => c.pens, q: c => c.res === 'win' ? 'Classificação nos pênaltis! Treinaram muito as cobranças?' : 'Eliminados nos pênaltis. É loteria?', a: [
    ['Pênalti é treino. Trabalhamos isso a semana toda.', 'confiante', { board: 2, moral: 1 }],
    ['Pênalti é loteria, não tem o que fazer.', 'evasivo', { moral: 1, fans: -1 }],
    ['Os cobradores mostraram coragem. Parabéns a eles.', 'elogio', { moral: 3 }]] },
  { id: 'cupOut', w: 3, when: c => c.out && !c.pens, q: c => `Eliminação na ${c.cup}. Fracasso?`, a: [
    ['É um fracasso, sim. Assumo a responsabilidade.', 'humilde', { fans: 2, board: -1 }],
    ['Agora é focar na liga. Ganhamos mais tempo de treino.', 'evasivo', { board: 1, fans: -2 }],
    ['Fomos prejudicados nos dois jogos.', 'polemico', null, null, [{ fans: 4 }, { board: -4 }]]] },
  { id: 'cupGo', w: 2, when: c => c.knockout && c.res === 'win' && !c.pens, q: c => `Vitória na ${c.cup} (${c.stage}). Dá para sonhar com o título?`, a: [
    ['Vamos buscar essa taça!', 'promessa', { fans: 4, moral: 2 }, 'promise'],
    ['Um jogo de cada vez.', 'humilde', { board: 2 }],
    ['Viemos para ser campeões, não para passear.', 'confiante', { fans: 3, board: 1 }]] },
  { id: 'top', w: 2, when: c => c.top && c.round >= 6 && c.res !== 'loss', q: c => `O time está em ${c.pos}º. Vocês são candidatos ao título?`, a: [
    ['Somos candidatos, sim. E não vamos esconder isso.', 'confiante', { fans: 4, moral: 2, board: -1 }],
    ['Ainda tem muito campeonato. O foco é o próximo jogo.', 'humilde', { board: 2 }],
    ['Quem tem que se preocupar são os outros.', 'polemico', null, null, [{ fans: 5, moral: 2 }, { fans: 2, board: -3 }]]] },
  { id: 'bottom', w: 3, when: c => c.bottom && c.round >= 6, q: c => `O time está em ${c.pos}º, na zona de perigo. Dá para escapar?`, a: [
    ['Dá. Eu confio nesse grupo até o fim.', 'confiante', { moral: 3, fans: 1 }],
    ['Precisamos de reforços. A diretoria sabe disso.', 'polemico', null, null, [{ fans: 3, board: -2 }, { board: -5 }]],
    ['Cada jogo agora é uma final. Vamos lutar.', 'humilde', { board: 2, moral: 1 }]] },
  { id: 'ultim', w: 4, when: c => c.ultimatum, q: () => 'A diretoria deu um ultimato. Você sente a pressão?', a: [
    ['Pressão faz parte. Vou cumprir a meta.', 'confiante', { board: 3 }],
    ['Sinto. Mas estou tranquilo com o meu trabalho.', 'humilde', { board: 1, moral: 1 }],
    ['Não é justo depois de tudo o que fizemos aqui.', 'polemico', null, null, [{ fans: 4 }, { board: -5 }]]] },
  { id: 'board', w: 2, when: c => c.board < 30 && !c.ultimatum, q: () => 'Dizem que a diretoria está insatisfeita com você. Algum recado?', a: [
    ['Converso com a diretoria todos os dias. Estamos alinhados.', 'evasivo', { board: 2 }],
    ['Quem manda é a torcida. Eles estão comigo.', 'polemico', null, null, [{ fans: 4 }, { board: -6 }]],
    ['Entendo a cobrança. Os resultados vão aparecer.', 'humilde', { board: 3 }]] },
  { id: 'fans', w: 2, when: c => c.fans < 30, q: () => 'A torcida vaiou o time. Recado para a arquibancada?', a: [
    ['Eles têm razão. Precisamos dar mais.', 'humilde', { fans: 4 }],
    ['Vaia não ajuda ninguém. Precisamos de apoio.', 'critico', { fans: -3, moral: 2 }],
    ['Prometo que a próxima vitória vai ser para vocês.', 'promessa', { fans: 3 }, 'promise']] },
  { id: 'early', w: 1, when: c => c.early, q: () => 'Começo de temporada. Qual é o objetivo do time?', a: [
    ['Brigar pelo título. Não vim aqui para participar.', 'confiante', { fans: 4, board: -1 }],
    ['Cumprir as metas da diretoria e crescer jogo a jogo.', 'humilde', { board: 3 }],
    ['O objetivo é o próximo jogo. O resto é conversa.', 'evasivo', {}]] },
  { id: 'late', w: 2, when: c => c.late, q: () => 'Reta final. Como manter o elenco focado?', a: [
    ['Com conversa e confiança. O grupo sabe o que está em jogo.', 'elogio', { moral: 3 }],
    ['Quem não estiver focado não joga. Simples assim.', 'critico', { moral: -2, board: 2 }],
    ['Vamos terminar forte. Pode cobrar.', 'promessa', { fans: 3, moral: 1 }, 'promise']] },
  { id: 'moral', w: 2, when: c => c.moral < 45, q: () => 'Há rumores de jogadores insatisfeitos no elenco. É verdade?', a: [
    ['Mentira. O ambiente é ótimo.', 'evasivo', null, null, [{ moral: 2 }, { moral: -2, fans: -1 }]],
    ['Vou conversar com cada um. Ninguém está acima do grupo.', 'humilde', { moral: 4, board: 1 }],
    ['Quem estiver insatisfeito pode procurar outro clube.', 'critico', { moral: -6, board: 2 }]] }
];

// ---------- Perguntas do JOGADOR (modo carreira) ----------
// fx: trust (confiança do técnico), fans (torcida/fama), moral (do próprio jogador)
const PLAYER = [
  { id: 'pWin', w: 1, when: c => c.res === 'win' && c.pcUsed, q: () => 'Boa vitória! Como você viu o jogo?', a: [
    ['O grupo está de parabéns.', 'humilde', { trust: 3 }],
    ['Fiz a minha parte. Mereço mais espaço.', 'confiante', { trust: -4, fans: 3 }],
    ['O professor armou muito bem o time.', 'elogio', { trust: 5 }],
    ['Foi tranquilo. Eles eram fracos.', 'polemico', null, null, [{ fans: 3 }, { trust: -4, fans: -1 }]]] },
  { id: 'pGoal', w: 3, when: c => c.pcGoals >= 1, q: c => c.pcGoals >= 2 ? `${c.pcGoals} gols hoje! Dedica para quem?` : 'Você marcou! Como foi o gol?', a: [
    ['Dedico à minha família, que sempre acreditou.', 'humilde', { fans: 2, moral: 4 }],
    ['Para a torcida, que canta o meu nome!', 'elogio', { fans: 5 }],
    ['Para quem duvidou de mim. Agora vão ter que engolir.', 'polemico', null, null, [{ fans: 6, moral: 3 }, { trust: -5, fans: 1 }]],
    ['O gol é do time. Eu só empurrei para dentro.', 'humilde', { trust: 3 }]] },
  { id: 'pAssist', w: 2, when: c => c.pcAssists >= 1 && !c.pcGoals, q: () => 'Você deu a assistência. Prefere servir ou marcar?', a: [
    ['O importante é o time ganhar.', 'humilde', { trust: 4 }],
    ['Prefiro marcar, mas hoje a jogada pedia o passe.', 'confiante', { fans: 2 }],
    ['Sou um jogador completo. Faço as duas coisas.', 'confiante', null, null, [{ fans: 3 }, { trust: -2 }]]] },
  { id: 'pBadGame', w: 3, when: c => c.pcUsed && c.pcRating != null && c.pcRating < 6, q: () => 'Sua atuação foi criticada. Concorda?', a: [
    ['Concordo. Não fui bem e vou trabalhar mais.', 'humilde', { trust: 4, moral: -2 }],
    ['Joguei fora de posição, aí fica difícil.', 'polemico', { trust: -6, fans: 1 }],
    ['Crítica faz parte. Sei do meu valor.', 'confiante', { moral: 2, trust: -1 }]] },
  { id: 'pDraw', w: 1, when: c => c.res === 'draw' && c.pcUsed, q: () => 'Empate. O que faltou para vencer?', a: [
    ['Caprichar mais na finalização.', 'humilde', { trust: 3 }],
    ['Precisamos ser mais ousados.', 'confiante', { trust: -1, fans: 2 }],
    ['Prefiro não comentar.', 'evasivo', {}]] },
  { id: 'pLoss', w: 1, when: c => c.res === 'loss' && c.pcUsed, q: () => 'Derrota. O que deu errado?', a: [
    ['Temos que trabalhar mais nos treinos.', 'humilde', { trust: 4 }],
    ['Falta entrosamento no time.', 'critico', { trust: -3 }],
    ['A culpa é de todos, inclusive minha.', 'humilde', { trust: 3, fans: 1 }],
    ['Prefiro não comentar.', 'evasivo', {}]] },
  { id: 'pBench', w: 2, when: c => !c.pcUsed, q: () => 'Você não jogou hoje. Está chateado?', a: [
    ['Respeito a decisão do professor.', 'humilde', { trust: 6 }],
    ['Quero jogar. Estou pronto!', 'confiante', { trust: -3, fans: 3 }],
    ['Vou pensar no meu futuro.', 'polemico', { trust: -8 }],
    ['Treino forte e espero a minha chance.', 'humilde', { trust: 4, moral: 2 }]] },
  { id: 'pDerby', w: 3, when: c => c.derby && c.pcUsed, q: c => `Como é jogar o ${c.derby}?`, a: [
    ['É o jogo que todo garoto sonha em jogar.', 'humilde', { fans: 3 }],
    ['Clássico eu jogo com a faca nos dentes.', 'confiante', { fans: 4, trust: 1 }],
    ['É um jogo como outro qualquer.', 'evasivo', { fans: -3 }]] },
  { id: 'pStarter', w: 2, when: c => c.pcUsed && c.pcRole === 'Titular' && c.res !== 'loss', q: () => 'Você virou titular absoluto. A cabeça mudou?', a: [
    ['Não mudou nada. Continuo treinando como se fosse reserva.', 'humilde', { trust: 4 }],
    ['Agora é manter. Lugar de titular não se devolve.', 'confiante', { fans: 2, moral: 3 }],
    ['Eu sempre soube que ia chegar aqui.', 'polemico', null, null, [{ fans: 4 }, { trust: -4 }]]] },
  { id: 'pLowTrust', w: 3, when: c => c.trust < 35, q: () => 'Você tem jogado pouco. Sua relação com o técnico está desgastada?', a: [
    ['De jeito nenhum. Ele sabe o que faz, e eu vou mostrar serviço.', 'humilde', { trust: 6 }],
    ['Não entendo os critérios dele, sinceramente.', 'polemico', { trust: -7, fans: 2 }],
    ['Vou conversar com ele em particular.', 'evasivo', { trust: 2 }]] },
  { id: 'pYoung', w: 2, when: c => c.pc && c.pc.age <= 20 && c.pcUsed, q: c => `Com ${c.pc.age} anos você já está no profissional. Quem é seu ídolo?`, a: [
    ['Meu pai. Foi ele que me levou para a escolinha.', 'humilde', { fans: 3, moral: 2 }],
    ['Quero ser o meu próprio ídolo. Vou fazer história.', 'confiante', null, null, [{ fans: 5 }, { trust: -3, fans: 1 }]],
    ['Os jogadores mais velhos aqui do elenco. Aprendo todo dia.', 'elogio', { trust: 5 }]] },
  { id: 'pTrain', w: 1, when: c => c.pcUsed, q: () => 'O que você tem treinado mais nesta semana?', a: [
    ['Finalização. Fico depois do treino batendo no gol.', 'humilde', { trust: 3 }],
    ['Parte física. Quero aguentar os 90 minutos.', 'humilde', { trust: 2, moral: 2 }],
    ['Segredo. O adversário pode estar ouvindo.', 'evasivo', { fans: 2 }]] },
  { id: 'pFuture', w: 1, when: c => c.pcUsed && c.round >= 10, q: () => 'Há rumores de interesse de outros clubes. Pensa em sair?', a: [
    ['Estou feliz aqui. Meu foco é o clube.', 'humilde', { trust: 4, fans: 3 }],
    ['Todo jogador sonha com voos maiores.', 'confiante', { trust: -3, fans: -2 }],
    ['Quem cuida disso é o meu empresário.', 'evasivo', { trust: -1 }]] }
];

// ---------- Escolha da pergunta ----------
function shuffle(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

function choose(pool, c, st) {
  let opts = pool.filter(q => { try { return q.when(c); } catch { return false; } });
  const fresh = opts.filter(q => !st.lastQ.includes(q.id));
  if (fresh.length) opts = fresh;
  if (!opts.length) return null;
  const total = opts.reduce((s, q) => s + q.w, 0);
  let x = rnd() * total;
  for (const q of opts) { x -= q.w; if (x <= 0) return q; }
  return opts[0];
}

// Confere a promessa feita na entrevista anterior
function checkPromise(game, c) {
  const st = state(game), p = st.promise;
  if (!p) return null;
  st.promise = null;
  const co = game.coach;
  if (c.res === 'win') {
    if (co) { co.fans = clamp(co.fans + 5, 0, 100); co.board = clamp(co.board + 2, 0, 100); }
    if (game.pc) game.pc.trust = clamp(game.pc.trust + 3, 0, 100);
    addPress(game, { title: `Promessa cumprida: ${c.us} vence e ${co && !game.pc ? 'o técnico' : 'o elenco'} honra a palavra`, text: `"${p.text}"`, tone: 'good' });
    return '✅ Você prometeu e cumpriu: torcida +5, diretoria +2.';
  }
  if (co) { co.fans = clamp(co.fans - 5, 0, 100); co.board = clamp(co.board - 3, 0, 100); }
  if (game.pc) game.pc.trust = clamp(game.pc.trust - 3, 0, 100);
  addPress(game, { title: `Prometeu e não cumpriu: ${c.us} ${c.res === 'draw' ? 'só empata' : 'perde'} depois de promessa`, text: `"${p.text}"`, tone: 'bad' });
  return '❌ A promessa da última entrevista não foi cumprida: torcida −5, diretoria −3. A imprensa não perdoou.';
}

export function interview(game, m) {
  const c = buildCtx(game, m);
  if (!c) return null;
  const player = game.mode === 'player';
  if (!player && (!game.coach || game.coach.fired)) return null;
  const st = state(game);
  const note = checkPromise(game, c);
  const q = choose(player ? PLAYER : COACH, c, st);
  if (!q) return note ? { note, q: null, a: [], opts: [] } : null;
  st.lastQ = [...st.lastQ, q.id].slice(-8);
  const opts = shuffle(q.a.map(([text, tone, fx, special, gamble]) => ({ text, tone, fx, special, gamble })));
  return {
    key: q.id, mode: player ? 'player' : 'coach', note,
    starId: c.star && c.star.id, youngId: c.young && c.young.id,
    q: q.q(c), a: opts.map(o => o.text), opts
  };
}

// Quanto o mesmo tom já foi usado nas últimas entrevistas
function fatigue(st, tone) {
  const n = st.tones.slice(-4).filter(t => t === tone).length;
  return n === 0 ? 1 : n === 1 ? 0.7 : n === 2 ? 0.35 : -0.5;
}

export function answerInterview(game, iv, idx) {
  const o = iv.opts && iv.opts[idx];
  if (!o) return 'Resposta neutra.';
  const st = state(game);
  const fat = fatigue(st, o.tone);
  st.tones = [...st.tones, o.tone].slice(-8);
  let fx = o.fx || {};
  let luck = '';
  if (o.gamble) {
    const good = rnd() < 0.5;
    fx = good ? o.gamble[0] : o.gamble[1];
    luck = good ? '🎲 A declaração pegou bem. ' : '🎲 A declaração repercutiu mal. ';
  }
  const parts = [];
  const vary = v => {
    // positivos cansam com a repetição; negativos não diminuem
    let x = v > 0 ? v * fat : v * (fat < 0 ? 1.3 : 1);
    x *= 0.7 + rnd() * 0.6;            // sorte: 70% a 130%
    return Math.round(x);
  };
  const sign = v => (v > 0 ? '+' : '') + v;
  const co = game.coach;
  const squad = Object.values(game.players).filter(p => p.clubId === game.userClubId);
  if (fx.moral && iv.mode !== 'player') {
    let v = vary(fx.moral);
    // cobrar os jogadores com o vestiário em baixa pesa mais
    if (o.tone === 'critico' && v < 0) { const avg = squad.reduce((s, p) => s + p.moral, 0) / (squad.length || 1); if (avg < 45) v = Math.round(v * 1.5); }
    if (v) { for (const p of squad) p.moral = clamp(p.moral + v, 5, 100); parts.push(`${v > 0 ? '😊' : '😠'} moral do elenco ${sign(v)}`); }
  }
  if (fx.star && iv.starId && game.players[iv.starId]) { const p = game.players[iv.starId], v = vary(fx.star); if (v) { p.moral = clamp(p.moral + v, 5, 100); parts.push(`${p.name} ${sign(v)} de moral`); } }
  if (fx.young && iv.youngId && game.players[iv.youngId]) { const p = game.players[iv.youngId], v = vary(fx.young); if (v) { p.moral = clamp(p.moral + v, 5, 100); parts.push(`${p.name} ${sign(v)} de moral`); } }
  if (co && fx.board) { const v = vary(fx.board); if (v) { co.board = clamp(co.board + v, 0, 100); parts.push(`diretoria ${sign(v)}`); } }
  if (co && fx.fans) { const v = vary(fx.fans); if (v) { co.fans = clamp(co.fans + v, 0, 100); parts.push(`torcida ${sign(v)}`); } }
  if (game.pc && fx.trust) { const v = vary(fx.trust); if (v) { game.pc.trust = clamp(game.pc.trust + v, 0, 100); parts.push(`confiança do técnico ${sign(v)}`); } }
  if (game.pc && fx.moral && iv.mode === 'player') { const p = game.players[game.pc.id], v = vary(fx.moral); if (v) { p.moral = clamp(p.moral + v, 5, 100); } }
  if (game.pc && fx.fans && !co) { const v = vary(fx.fans); if (v) parts.push(v > 0 ? 'a torcida gostou' : 'a torcida não gostou'); }
  // promessa: cobrada no próximo jogo
  if (o.special === 'promise' || o.tone === 'promessa') {
    st.promise = { text: o.text, season: game.season, round: game.round };
    parts.push('🤝 promessa feita: vale no próximo jogo');
  }
  let rep = '';
  if (fat < 0) rep = '🔁 Discurso repetido: ninguém mais acredita nessa fala. ';
  else if (fat < 1 && fat > 0) rep = '🔁 Fala parecida com as anteriores, menos efeito. ';
  // evasivo demais irrita a imprensa
  if (o.tone === 'evasivo' && st.tones.length >= 3 && st.tones.slice(-3).every(t => t === 'evasivo') && co) { co.fans = clamp(co.fans - 2, 0, 100); parts.push('imprensa irritada (torcida −2)'); }
  const who = iv.mode === 'player' ? game.players[game.pc.id].name : (co ? co.name : 'Técnico');
  addPress(game, { title: `"${o.text}"`, text: `${who}, na entrevista depois do jogo (tom ${TONES[o.tone] || o.tone}).`, tone: 'quote' });
  return luck + rep + (parts.length ? parts.join(' · ') : 'A resposta não mudou nada.');
}
