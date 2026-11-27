// =============================================================
// match.js — MOTOR DE SIMULAÇÃO DE PARTIDAS
// =============================================================
// Como funciona (resumo):
//  1. Cada time tem 3 forças: ATAQUE, MEIO-CAMPO e DEFESA, somando
//     a contribuição de cada jogador conforme a vaga em que joga.
//  2. A cada minuto, cada time pode ter um lance de ataque. A chance
//     depende do domínio do meio-campo.
//  3. Se houver lance, o ataque enfrenta a defesa adversária: isso
//     define se a finalização vai no gol.
//  4. A finalização vira gol conforme a finalização do atacante
//     contra o goleiro.
//  5. Também podem acontecer faltas, cartões, lesões e substituições.
// Os números (constantes K_*) foram calibrados para dar uma média
// parecida com o futebol real: ~2,5 gols e ~11 finalizações por jogo.
// =============================================================
import { effectiveRating, overall } from './ratings.js';
import { FORMATIONS, STYLES, MARKING } from './tactics.js';
import { rnd, pick, pickWeighted, clamp } from '../util.js';

// ---- Constantes de balanceamento ----
export const K = {
  ATTACK: 0.20,      // chance base de uma investida por minuto (parte vira desarme)
  POWER: 2.4,        // quanto a diferença de força pesa (maior = favoritos ganham mais)
  ON_TARGET: 0.40,   // chance base de a finalização ir no gol
  GOAL: 0.27,     // chance base de uma finalização no gol virar gol
  HOME: 1.08,        // vantagem de jogar em casa
  YELLOW: 0.021,     // amarelos por minuto por time
  RED: 0.0006,       // vermelho direto por minuto por time
  INJURY: 0.0012,    // lesão por minuto por time
  TIRE: 0.38         // cansaço por minuto (~25% de físico por jogo)
};

// Quanto cada vaga contribui para cada setor
const SECTOR = {
  GOL: { att: 0.00, mid: 0.05, def: 0.00 },
  ZAG: { att: 0.05, mid: 0.10, def: 1.00 },
  LAT: { att: 0.25, mid: 0.35, def: 0.60 },
  VOL: { att: 0.10, mid: 0.70, def: 0.50 },
  MEI: { att: 0.50, mid: 0.80, def: 0.15 },
  ATA: { att: 1.00, mid: 0.20, def: 0.05 }
};

// Peso de cada vaga na defesa do MEIO e das LATERAIS (para "concentrar ataques")
const CORRIDOR = {
  GOL: { cen: 0, wide: 0 }, ZAG: { cen: 1, wide: 0.3 }, LAT: { cen: 0.2, wide: 1 },
  VOL: { cen: 0.7, wide: 0.3 }, MEI: { cen: 0.2, wide: 0.4 }, ATA: { cen: 0, wide: 0.1 }
};

// Quem costuma finalizar (peso por vaga)
const SHOOT_W = { GOL: 0, ZAG: 0.7, LAT: 0.9, VOL: 1.3, MEI: 3, ATA: 5 };

import { pickTaker, headerScore, captainOf, leadership } from './setpieces.js';
import { weatherFx, weatherLine } from './weather.js';

export class Match {
  // home/away: objetos de clube. game: estado completo do jogo.
  constructor(game, home, away, opts = {}) {
    this.game = game;
    this.minute = 0;
    this.events = [];
    this.finished = false;
    this.userClubId = opts.userClubId || null;
    this.competition = opts.competition || 'league'; // 'league' ou id da copa
    this.knockout = !!opts.knockout;                 // mata-mata: empate vai para os pênaltis
    this.pens = null;                                // [gols mandante, gols visitante] nos pênaltis
    this.teams = [this.buildTeam(home, !opts.neutral), this.buildTeam(away, false)];
    this.shots = [];        // { side, min, x (0–100, lateral), d (0 = linha do gol, 1 = meio-campo), res, id }
    this.pressure = [];     // pressão por minuto: positivo = mandante atacando, negativo = visitante
    this.talkFx = [{}, {}]; // efeito da conversa do técnico (preleção/intervalo) em cada time
    this.wasBehind = [false, false];
    this._pm = [0, 0];
    this.instr = ['normal', 'normal']; // instrução ao vivo de cada time (ver INSTR)
    this.mine = this.teams.some(t => t.club.id === this.userClubId);
    this.pcId = opts.pcId || null;   // modo carreira: o jogador do usuário
    this.pcLive = false;             // a tela liga quando a partida é assistida // jogo do usuário: ganha narração detalhada
  }

  // ---------- Instruções durante o jogo ----------
  setInstr(side, key, silent) {
    if (!INSTR[key] || this.instr[side] === key) return;
    this.instr[side] = key;
    this.dirty = true;
    if (!silent) this.log('instr', side, `📣 ${this.teams[side].club.short} ${INSTR[key].say}`);
  }
  // IA muda a postura conforme placar e tempo
  aiInstr() {
    for (let i = 0; i < 2; i++) {
      const t = this.teams[i];
      if (this.human(t)) continue;
      const d = t.goals - this.teams[1 - i].goals;
      let k = 'normal';
      if (this.minute >= 70 && d < 0) k = this.minute >= 82 ? 'tudo' : 'pressao';
      else if (this.minute >= 75 && d > 0) k = 'segurar';
      else if (d >= 2) k = 'contra';
      this.setInstr(i, k);
    }
  }

  // ---------- Conversa do técnico (preleção e intervalo) ----------
  // choice: 'elogiar' | 'cobrar' | 'calma' | 'pracima'; when: 'pre' | 'half'
  // A reação depende da situação: placar (intervalo) ou favoritismo (preleção).
  talk(side, choice, when) {
    const t = this.teams[side], o = this.teams[1 - side];
    let sit;
    if (when === 'half') sit = t.goals > o.goals ? 'win' : t.goals < o.goals ? 'lose' : 'draw';
    else {
      const a = this.strength(t), b = this.strength(o);
      const r = (a.att + a.mid + a.def) / (b.att + b.mid + b.def);
      sit = r > 1.06 ? 'win' : r < 0.94 ? 'lose' : 'draw';   // favorito / equilibrado / azarão
    }
    const T = {
      elogiar: { win: [6, 'good'], draw: [2, 'neutral'], lose: [-4, 'bad'] },
      cobrar: { win: [-4, 'bad'], draw: [4, 'good'], lose: [7, 'good'] },
      calma: { win: [4, 'good'], draw: [2, 'neutral'], lose: [0, 'neutral'] },
      pracima: { win: [-1, 'neutral'], draw: [3, 'good'], lose: [5, 'good'] }
    }[choice][sit];
    const [dm, mood] = T;
    for (const id of new Set([...t.onField.map(f => f.id), ...t.bench])) {
      const p = this.P(id);
      if (p) p.moral = clamp(p.moral + dm * (mood === 'bad' ? 1 : 1.2), 5, 100);
    }
    // Efeito tático no jogo
    const fx = {};
    if (choice === 'calma') { fx.cards = 0.7; fx.def = 1.03; }
    if (choice === 'pracima') { fx.att = sit === 'lose' ? 1.08 : 1.05; fx.def = sit === 'lose' ? 0.94 : 0.96; fx.tire = 1.1; }
    if (choice === 'cobrar' && mood === 'good') { fx.att = 1.02; fx.mid = 1.02; }
    if (mood === 'bad') { fx.mid = 0.97; }
    this.talkFx[side] = fx;
    this.dirty = true;
    const ctx = when === 'half' ? (sit === 'win' ? 'vencendo' : sit === 'lose' ? 'perdendo' : 'empatando') : (sit === 'win' ? 'favorito' : sit === 'lose' ? 'azarão' : 'jogo equilibrado');
    const msg = {
      good: ['Os jogadores reagiram muito bem!', 'O vestiário ficou motivado!', 'Mensagem recebida: o time voltou ligado!'],
      neutral: ['Os jogadores ouviram, sem grande reação.', 'O time seguiu tranquilo.'],
      bad: ['Os jogadores não gostaram do tom...', 'Clima pesado no vestiário.']
    }[mood];
    const txt = `${pick(msg)} (${ctx})`;
    this.log('talk', side, `🗣️ ${when === 'half' ? 'Intervalo' : 'Preleção'}: ${txt}`);
    return { mood, text: txt, moral: dm };
  }

  // Comentários sobre o andamento do jogo (a cada ~15 minutos)
  atmosphere() {
    const [h, a] = this.teams;
    const last = this.pressure.slice(-12);
    const p = last.reduce((s, v) => s + v, 0);
    const dom = p > 6 ? h : p < -6 ? a : null;
    const fouls = h.stats.fouls + a.stats.fouls;
    const opts = [];
    if (dom) opts.push(`O ${dom.club.name} domina e empurra o adversário para trás.`, `Pressão total do ${dom.club.name}, o gol parece questão de tempo.`);
    else opts.push('Jogo equilibrado, muita disputa no meio-campo.', 'Partida estudada: os dois times se respeitam.');
    if (fouls > this.minute / 5) opts.push(`Jogo pegado: já são ${fouls} faltas.`);
    if (h.goals === 0 && a.goals === 0 && this.minute >= 60) opts.push('Placar zerado. A torcida pede mais ousadia!');
    if (Math.abs(h.goals - a.goals) >= 3) opts.push(`O ${(h.goals > a.goals ? h : a).club.name} passeia em campo.`);
    this.log('color', -1, '🎙️ ' + pick(opts));
  }

  // Frases extras depois de um gol (virada, empate, finzinho, hat-trick...)
  goalColor(i, t, o, shooter) {
    const lines = [];
    const diff = t.goals - o.goals;
    if (diff === 0) lines.push('Tudo igual! O jogo recomeça do zero.');
    if (diff === 1 && this.wasBehind[i]) lines.push((this.maxDef && this.maxDef[i] >= 2) ? 'VIRADA HISTÓRICA! Estava perdendo por dois!' : 'VIRADA! Que reação!');
    if (this.minute >= 88 && diff === 0) lines.push('EMPATE NO APAGAR DAS LUZES!');
    if (this.minute >= 85) lines.push(diff >= 1 ? 'No finzinho! Gol que pode valer a vitória!' : 'Gol nos acréscimos da emoção!');
    if (t.scorers.filter(s => s.id === shooter.id).length === 3) lines.push(`HAT-TRICK de ${shooter.name}! Leva a bola para casa!`);
    if (diff === 3) lines.push('Goleada se desenhando!');
    lines.push(t.isHome ? 'A torcida explode no estádio!' : pick(['Silêncio nas arquibancadas...', 'A torcida visitante faz a festa no seu cantinho!']));
    this.log('color', i, '🎙️ ' + lines.slice(0, 2).join(' '));
    if (t.goals > o.goals) this.wasBehind[1 - i] = true; // o outro time ficou atrás no placar
    // drama: maior desvantagem de cada time e minuto do último gol
    this.maxDef = this.maxDef || [0, 0];
    this.maxDef[0] = Math.max(this.maxDef[0], this.teams[1].goals - this.teams[0].goals);
    this.maxDef[1] = Math.max(this.maxDef[1], this.teams[0].goals - this.teams[1].goals);
    this.lastGoal = { side: i, min: this.minute, diff };
  }

  // Quem venceu? (0 mandante, 1 visitante, -1 empate) — conta os pênaltis
  winnerIndex() {
    const [h, a] = this.teams;
    if (h.goals !== a.goals) return h.goals > a.goals ? 0 : 1;
    if (this.pens) return this.pens[0] > this.pens[1] ? 0 : 1;
    return -1;
  }

  // Disputa de pênaltis: 5 cobranças para cada lado e depois alternadas
  // Cobradas uma a uma: no jogo do usuário, a tela pede o canto (cobrança)
  // ou o pulo do goleiro (defesa). Canto: 0 esquerda, 1 meio, 2 direita.
  penStart() {
    if (this.pso) return;
    this.pso = { score: [0, 0], marks: [[], []], n: [0, 0], next: 0, done: false };
    this.log('info', -1, '🥅 Empate! A decisão vai para os pênaltis.');
  }
  // Quem bate a próxima cobrança
  penKicker(side = this.pso.next) {
    const t = this.teams[side];
    const shooters = t.onField.filter(x => x.slot !== 'GOL').map(x => this.P(x.id)).sort((a, b) => b.attrs.fin - a.attrs.fin);
    return shooters[this.pso.n[side] % Math.max(1, shooters.length)] || this.P(t.onField[0].id);
  }
  penKeeper(side) {
    const o = this.teams[1 - side];
    const g = o.onField.find(x => x.slot === 'GOL') || o.onField[0];
    return g ? this.P(g.id) : null;
  }
  penKick(dir, dive) {
    const sh = this.pso, i = sh.next;
    const p = this.penKicker(i), gkP = this.penKeeper(i);
    const gk = gkP ? overall(gkP, 'GOL') : 30;
    if (dir == null) dir = rnd() < 0.2 ? 1 : rnd() < 0.5 ? 0 : 2;
    if (dive == null) dive = rnd() < 0.15 ? 1 : rnd() < 0.5 ? 0 : 2;
    const base = clamp(0.62 + (p.attrs.fin - gk) / 250 + (p.moral - 50) / 1000, 0.5, 0.9);
    // Goleiro acertou o canto: defende bem mais. Errou: quase sempre é gol.
    const chance = dive === dir ? base * 0.45 : Math.min(0.97, base * 1.27);
    const ok = rnd() < chance;
    const how = ok ? 'goal' : dive === dir ? 'save' : 'miss';
    if (ok) sh.score[i]++;
    sh.marks[i].push(ok);
    sh.n[i]++;
    this.log('pen', i, `${ok ? '✅' : '❌'} ${p.name} (${this.teams[i].club.short}) ${ok ? 'converte' : how === 'save' ? 'para no goleiro' : 'manda para fora'}. Pênaltis: ${sh.score[0]} x ${sh.score[1]}`);
    // Decidido?
    const [a, b] = sh.score, [na, nb] = sh.n;
    if (na <= 5 && nb <= 5 && (a + (5 - na) < b || b + (5 - nb) < a)) sh.done = true;
    else if (na >= 5 && na === nb && a !== b) sh.done = true;
    else if (na >= 30 && na === nb) { sh.done = true; sh.score[0]++; }
    sh.next = 1 - i;
    return { side: i, name: p.name, keeper: gkP ? gkP.name : 'o goleiro', dir, dive, ok, how, done: sh.done };
  }
  // Encerra a disputa (resolve o que faltar sozinho)
  closePens() {
    this.penStart();
    while (!this.pso.done) this.penKick();
    this.pens = this.pso.score.slice();
    this.penPending = false;
    const w = this.teams[this.winnerIndex()].club;
    this.log('end', -1, `🏁 ${w.name} vence nos pênaltis por ${Math.max(...this.pens)} x ${Math.min(...this.pens)}!`);
    this.finished = true;
    this.ratings = this.computeRatings();
  }
  penalties() { this.closePens(); }

  buildTeam(club, isHome) {
    const slots = FORMATIONS[club.formation];
    const cap = captainOf(this.game, club);
    return {
      club, isHome, capId: cap ? cap.id : null, capL: leadership(cap),
      onField: club.lineup.map((id, i) => ({ id, slot: slots[i] })).filter(x => x.id),
      bench: club.bench.slice(),
      used: new Set(club.lineup.filter(Boolean)),  // todos que entraram em campo
      subsLeft: 5,
      goals: 0,
      stats: { shots: 0, onTarget: 0, poss: 0, fouls: 0, yellow: 0, red: 0, corners: 0, tackles: 0, passErr: 0 },
      scorers: [],
      yellows: {} // id → nº de amarelos nesta partida
    };
  }

  P(id) { return this.game.players[id]; }
  // efeito do clima/gramado/altitude em cada time (calculado uma vez)
  wfx(i) {
    if (!this.weather || i < 0) return { mid: 1, shot: 1, tire: 1 };
    if (!this._wf) this._wf = this.teams.map(t => weatherFx(this.weather, t.club, t.isHome));
    return this._wf[i];
  }
  // Time controlado pelo usuário (no modo carreira de jogador, quem escala é a IA)
  human(t) { return t.club.id === this.userClubId && !this.pcId && !this.game.quickSim; }

  // Calcula as forças do time agora (muda com cansaço, expulsões, trocas)
  strength(t) {
    const st = STYLES[t.club.style] || STYLES['Equilibrado'];
    const mk = MARKING[t.club.marking] || MARKING['Média'];
    let att = 0, mid = 0, def = 0, gk = 20, cen = 0, wide = 0, pas = 0;
    for (const { id, slot } of t.onField) {
      const p = this.P(id);
      const r = effectiveRating(p, slot);
      att += r * SECTOR[slot].att;
      mid += r * SECTOR[slot].mid;
      def += r * SECTOR[slot].def;
      cen += r * CORRIDOR[slot].cen;
      wide += r * CORRIDOR[slot].wide;
      pas += p.attrs.pas;
      if (slot === 'GOL') gk = r;
    }
    const h = t.isHome ? K.HOME : 1;
    const ti = this.teams ? this.teams.indexOf(t) : -1;
    const fx = (this.talkFx && this.talkFx[ti]) || {}; // conversa do técnico
    const ins = INSTR[(this.instr && this.instr[ti]) || 'normal'];
    const thr = this.fixSide === ti && ti >= 0 ? 0.55 : 1;   // esquema de apostas: o time entrega o jogo
    const wf = this.wfx(ti);
    let cap;
    // capitão em campo puxa a reação quando o time perde no 2º tempo
    // entrosamento do vestiário (só o clube do usuário tem esse cálculo)
    if (t.club.chem != null && t.club.id === this.userClubId) cap = 1 + (t.club.chem - 50) / 1250;
    else cap = 1;
    if (this.teams && ti >= 0 && this.minute >= 55 && t.goals < this.teams[1 - ti].goals && t.capId && t.onField.some(x => x.id === t.capId)) cap *= 1 + 0.05 * (t.capL || 0);
    return {
      att: att * st.att * h * (fx.att || 1) * ins.att * thr * cap, mid: mid * st.mid * h * (fx.mid || 1) * ins.mid * thr * cap * wf.mid, def: def * st.def * mk.def * (fx.def || 1) * ins.def * thr, gk: gk * thr,
      cenShare: cen / ((cen + wide) || 1),                 // ~0,5 em formações equilibradas
      pas: pas / Math.max(1, t.onField.length)
    };
  }

  // Defesa que o ataque enfrenta, conforme o foco escolhido pelo atacante
  defenseAgainst(attTeam, sDef) {
    const f = attTeam.club.focus;
    if (f === 'Pelo meio') return sDef.def * sDef.cenShare / 0.5;
    if (f === 'Pelas laterais') return sDef.def * (1 - sDef.cenShare) / 0.5;
    return sDef.def;
  }

  log(type, side, text) {
    const e = { min: this.minute, type, side, text };
    this.events.push(e);
    return e;
  }

  // Avança 1 minuto. Devolve os eventos que aconteceram nele.
  step() {
    if (this.finished) return [];
    const before = this.events.length;
    if (this.penPending) { this.closePens(); return this.events.slice(before); }
    if (this.pcPending) this.resolvePc('auto'); // pulou o lance (ex.: "Fim")
    this.minute++;
    if (this.minute === 1) this.log('info', -1, 'Bola rolando! Começa a partida.');
    if (this.minute === 1 && this.mine && this.weather) this.log('info', -1, `${weatherLine(this.weather)}. ${this.weather.desc}`);
    if (this.mine && this.weather && (this.weather.key === 'chuva' || this.weather.key === 'forte') && this.minute % 20 === 7 && rnd() < 0.5) this.log('play', this.poss || 0, pick(['A bola espirra na poça d\'água e engana a marcação!', 'Jogador escorrega no gramado molhado...', 'Que dificuldade para dominar a bola com essa chuva!']));
    if (this.mine && this.weather && this.weather.alt >= 2000 && this.minute === 70) this.log('info', -1, '⛰️ A altitude cobra o preço: o time visitante está com as pernas pesadas.');
    if (this.mine && this.weather && this.weather.key === 'calor' && this.minute === 30) this.log('info', -1, '🥵 Parada técnica para hidratação: o calor está castigando.');

    // Forças recalculadas a cada 5 minutos (cansaço muda devagar) ou após
    // substituição/expulsão (this.dirty) — economiza muito processamento
    if (!this._s || this.dirty || this.minute % 5 === 1) {
      this._s = this.teams.map(t => this.strength(t));
      this.dirty = false;
    }
    const s = this._s;
    // Domínio do meio-campo (com "expoente" para valorizar a diferença)
    const m0 = Math.pow(s[0].mid, K.POWER), m1 = Math.pow(s[1].mid, K.POWER);
    const share = [m0 / (m0 + m1), m1 / (m0 + m1)];
    // Quem está com a bola neste minuto (usado também pela tela do campo)
    this.poss = rnd() < share[0] ? 0 : 1;
    this.attackSide = -1;
    this._pm = [0, 0];
    const pt = this.teams[this.poss];
    pt.stats.poss++;
    // Erros de passe: time com passe ruim erra mais
    if (rnd() < 0.4 * (1 - s[this.poss].pas / 110)) pt.stats.passErr++;
    // Roubadas de bola no meio-campo (estatística)
    if (rnd() < 0.12) this.teams[1 - this.poss].stats.tackles++;

    for (let i = 0; i < 2; i++) {
      const t = this.teams[i], o = this.teams[1 - i];
      const mk = MARKING[t.club.marking] || MARKING['Média'];
      // Investida de ataque?
      if (rnd() < K.ATTACK * 2 * share[i]) this.attack(i, t, o, s[i], s[1 - i]);
      // Falta / cartão (marcação pesada faz mais faltas)
      const fi = INSTR[this.instr[i]].fouls;
      const cf = mk.fouls * (this.talkFx[i].cards || 1) * fi;
      if (rnd() < 0.13 * mk.fouls * fi) {
        t.stats.fouls++;
        // falta de quem defende (i) perto da área: bola parada para o outro time
        const r = rnd();
        if (r < 0.012) this.penaltyKick(1 - i);
        else if (r < 0.08) this.freeKick(1 - i);
      }
      if (rnd() < K.YELLOW * cf * (this.derby ? 1.3 : 1)) this.card(i, t, false); // clássico é mais pegado
      else if (rnd() < K.RED * cf) this.card(i, t, true);
      // Lesão
      if (rnd() < K.INJURY) this.injury(i, t);
    }

    this.tire();
    this.aiSubs();
    if (this.minute % 5 === 0) this.aiInstr();
    // Narração do jogo corrido (minuto sem lance) — só no jogo do usuário
    if (this.mine && this.events.length === before && rnd() < 0.35) this.flow();

    // Pressão do minuto (para o gráfico): ataques, chutes e posse
    this.pressure.push(this._pm[0] - this._pm[1] + (this.poss === 0 ? 0.3 : -0.3));
    if ([15, 30, 60, 75].includes(this.minute)) this.atmosphere();

    if (this.minute === 89 && this.mine) {
      const add = 2 + Math.floor(rnd() * 5) + (Math.abs(this.teams[0].goals - this.teams[1].goals) <= 1 ? 1 : 0);
      this.log('info', -1, `⏱️ O quarto árbitro levanta a placa: +${add} minutos de acréscimo!${Math.abs(this.teams[0].goals - this.teams[1].goals) <= 1 ? ' Muita emoção ainda!' : ''}`);
    }
    if (this.minute === 45) this.log('half', -1, `Fim do primeiro tempo: ${this.score()}`);
    if (this.minute >= 90) {
      if (this.pcPending) this.resolvePc('auto');
      this.log('end', -1, `Fim de jogo! ${this.score()}`);
      if (this.knockout && this.teams[0].goals === this.teams[1].goals) {
        // Jogo do usuário: a tela conduz as cobranças (penPending).
        // Se alguém chamar step()/runToEnd antes, a disputa é resolvida sozinha.
        if (this.mine) { this.penStart(); this.penPending = true; }
        else this.closePens();
      } else {
        this.finished = true;
        this.ratings = this.computeRatings(); // notas finais (aparecem na tela)
      }
    }
    return this.events.slice(before);
  }

  score() {
    const [h, a] = this.teams;
    return `${h.club.short} ${h.goals} x ${a.goals} ${a.club.short}`;
  }

  attack(i, t, o, sa, so) {
    const a = Math.pow(sa.att, K.POWER), d = Math.pow(this.defenseAgainst(t, so), K.POWER);
    const q = a / (a + d); // qualidade do lance (0 a 1, média ~0,45)
    this.attackSide = i;
    this._pm[i] += 1;

    // A defesa pode desarmar antes da finalização
    if (rnd() > clamp(0.42 + 0.55 * q, 0.3, 0.9)) {
      o.stats.tackles++;
      if (rnd() < 0.08) {
        const defs = o.onField.filter(x => ['ZAG', 'VOL', 'LAT'].includes(x.slot));
        if (defs.length) this.log('tackle', 1 - i, `${this.P(pick(defs).id).name} (${o.club.short}) desarma e corta o ataque.`);
      }
      return;
    }

    // Quem chuta
    const shooters = t.onField.filter(x => x.slot !== 'GOL');
    if (!shooters.length) return;
    const sh = pickWeighted(shooters, shooters.map(x => SHOOT_W[x.slot] * Math.pow(this.P(x.id).attrs.fin, 1.5)));
    // Modo carreira: lance decisivo do SEU jogador — a tela pergunta o que fazer
    const pcF = this.pcLive && this.pcId ? t.onField.find(x => x.id === this.pcId) : null;
    // chance por posição (atacante participa mais) e no máximo 3 lances por jogo
    const PC_CH = { ATA: 0.3, MEI: 0.2, VOL: 0.13, LAT: 0.13, ZAG: 0.1, GOL: 0 };
    if (pcF && (this.pcMoments || 0) < 3 && (sh.id === this.pcId ? rnd() < 0.75 : rnd() < (PC_CH[pcF.slot] || 0.05))) {
      this.pcMoments = (this.pcMoments || 0) + 1;
      this.pcPending = { i, q };
      this.log('pcmoment', i, `🎯 ${this.P(this.pcId).name} recebe a bola em boa posição! O que fazer?`);
      return;
    }
    this.shoot(i, t, o, q, sh);
  }

  // Resolve o lance decisivo do jogador do usuário
  // choice: 'colocado' | 'forte' | 'driblar' | 'passar' | 'auto'
  resolvePc(choice) {
    const pend = this.pcPending;
    if (!pend) return [];
    this.pcPending = null;
    const before = this.events.length;
    const { i, q } = pend, t = this.teams[i], o = this.teams[1 - i];
    const pcF = t.onField.find(x => x.id === this.pcId);
    if (!pcF) return [];
    const p = this.P(this.pcId);
    if (choice === 'auto') choice = rnd() < 0.5 ? 'colocado' : 'forte';
    if (choice === 'colocado') this.shoot(i, t, o, q, pcF, { on: 1.3, goal: 0.92, text: `${p.name} ajeita e bate colocado...` });
    else if (choice === 'forte') this.shoot(i, t, o, q, pcF, { on: 0.8, goal: 1.4, text: `${p.name} solta a bomba!` });
    else if (choice === 'driblar') {
      const ok = rnd() < clamp(0.3 + (p.attrs.fin + p.attrs.for + p.attrs.pas) / 600 + (p.fitness - 60) / 400, 0.2, 0.75);
      if (ok) {
        this.log('play', i, `${p.name} passa pelo marcador com um drible desconcertante!`);
        this.shoot(i, t, o, Math.min(0.95, q + 0.25), pcF, { on: 1.2, goal: 1.2 });
      } else {
        o.stats.tackles++;
        const defs = o.onField.filter(x => x.slot !== 'GOL');
        this.log('tackle', 1 - i, `${p.name} tenta o drible, mas ${defs.length ? this.P(pick(defs).id).name : 'a zaga'} toma a bola.`);
      }
    } else if (choice === 'passar') {
      const mates = t.onField.filter(x => x.id !== this.pcId && x.slot !== 'GOL');
      if (!mates.length) return this.events.slice(before);
      const mf = pickWeighted(mates, mates.map(x => SHOOT_W[x.slot] * this.P(x.id).attrs.fin));
      const ok = rnd() < clamp(0.45 + p.attrs.pas / 160, 0.4, 0.92);
      if (ok) this.shoot(i, t, o, Math.min(0.95, q + 0.18), mf, { on: 1.15, assist: this.pcId, text: `${p.name} enxerga ${this.P(mf.id).name} livre e toca...` });
      else { o.stats.tackles++; this.log('tackle', 1 - i, `O passe de ${p.name} é interceptado.`); }
    }
    return this.events.slice(before);
  }

  // Finalização (chute de "sh" com qualidade de lance q). mods: on/goal (multiplicadores),
  // assist (id forçado), text (narração antes do chute)
  shoot(i, t, o, q, sh, mods = {}) {
    const shooter = this.P(sh.id);
    const gkSlot = o.onField.find(x => x.slot === 'GOL');
    const gk = gkSlot ? this.P(gkSlot.id) : null;
    t.stats.shots++;
    this._pm[i] += 1;
    // Local do chute: lance melhor = mais perto do gol e mais centralizado
    const dist = clamp(0.05 + (1 - q) * 0.2 + rnd() * 0.1 + (sh.slot === 'VOL' || sh.slot === 'ZAG' ? 0.06 : 0), 0.04, 0.38);
    const spot = { x: clamp(50 + (rnd() - 0.5) * (24 + dist * 130), 8, 92), d: dist };
    const shot = { side: i, min: this.minute, x: spot.x, d: spot.d, res: 'miss', id: shooter.id };
    this.shots.push(shot);
    // Narração da jogada que leva ao chute (só no jogo do usuário)
    const mates = this.mine ? t.onField.filter(x => x.id !== sh.id && x.slot !== 'GOL') : [];
    if (mods.text) this.log('play', i, mods.text);
    else if (mates.length && rnd() < 0.8) this.log('play', i, pick(BUILD)(this.P(pick(mates).id).name, shooter.name));

    const fin = shooter.attrs.fin * (0.65 + 0.35 * shooter.fitness / 100);
    const onTarget = rnd() < clamp(K.ON_TARGET * (0.5 + q) * (0.6 + fin / 175) * (mods.on || 1) * this.wfx(i).shot, 0.1, 0.85);
    if (!onTarget) {
      if (rnd() < (t.club.focus === 'Pelas laterais' ? 0.5 : 0.35)) { t.stats.corners++; if (rnd() < 0.3) this.cornerKick(i); }
      if (rnd() < 0.45) this.log('chance', i, pick(MISS)(shooter.name, t.club.short)).spot = spot;
      return;
    }
    t.stats.onTarget++;
    this._pm[i] += 1;
    shot.res = 'save';
    // Goleiro: um jogador de linha improvisado no gol tem nota muito baixa
    const gkR = gk ? overall(gk, 'GOL') : 15;
    const pGoal = clamp(K.GOAL * 2 * fin / (fin + gkR) * (0.7 + q * 0.8) * (mods.goal || 1), 0.05, 0.88);
    if (rnd() < pGoal) {
      t.goals++;
      // Assistência (75% dos gols)
      let assist = mods.assist ? this.P(mods.assist) : null;
      if (!assist && rnd() < 0.75) {
        const others = t.onField.filter(x => x.id !== sh.id && x.slot !== 'GOL');
        if (others.length) assist = this.P(pickWeighted(others, others.map(x => Math.pow(this.P(x.id).attrs.pas, 2))).id);
      }
      t.scorers.push({ min: this.minute, id: shooter.id, assist: assist && assist.id });
      shot.res = 'goal';
      this._pm[i] += 2;
      const txt = pick(GOAL)(shooter.name, t.club.name, assist && assist.name);
      const ev = this.log('goal', i, `${txt}  ${this.score()}`);
      ev.spot = spot; ev.assistId = assist && assist.id; ev.scorerId = shooter.id;
      this.goalColor(i, t, o, shooter);
    } else {
      if (rnd() < 0.3) { t.stats.corners++; if (rnd() < 0.3) this.cornerKick(i); }
      this.log('save', i, pick(SAVE)(shooter.name, gk ? gk.name : 'o goleiro')).spot = spot;
    }
  }

  // ---------- Bolas paradas ----------
  // Gol de bola parada (mantém artilharia, assistência e animação)
  spGoal(i, shooter, assist, text, spot) {
    const t = this.teams[i], o = this.teams[1 - i];
    t.goals++;
    t.scorers.push({ min: this.minute, id: shooter.id, assist: assist && assist.id, sp: true });
    this.shots.push({ side: i, min: this.minute, x: spot.x, d: spot.d, res: 'goal', id: shooter.id });
    this._pm[i] += 3;
    const ev = this.log('goal', i, `${text}  ${this.score()}`);
    ev.spot = spot; ev.assistId = assist && assist.id; ev.scorerId = shooter.id;
    this.goalColor(i, t, o, shooter);
  }
  gkOf(o) { const g = o.onField.find(x => x.slot === 'GOL'); return g ? this.P(g.id) : null; }
  onIds(t) { return t.onField.map(x => x.id); }

  penaltyKick(i) {
    const t = this.teams[i], o = this.teams[1 - i];
    const p = pickTaker(this.game, t.club, 'pen', this.onIds(t));
    if (!p) return;
    const gk = this.gkOf(o), gkR = gk ? overall(gk, 'GOL') : 15;
    t.stats.shots++; t.stats.onTarget++;
    this.log('chance', i, `🎯 PÊNALTI para o ${t.club.short}! ${p.name} vai para a cobrança...`);
    const calm = p.id === t.capId ? 0.03 : 0;
    const pGoal = clamp(0.62 + (p.attrs.fin - 60) / 220 + (p.moral - 60) / 600 - (gkR - 65) / 320 + calm, 0.5, 0.9);
    const spot = { x: 50, d: 0.11 };
    if (rnd() < pGoal) this.spGoal(i, p, null, `⚽ ${p.name} bate o pênalti e converte! Goleiro para um lado, bola para o outro.`, spot);
    else if (rnd() < 0.65) { this.shots.push({ side: i, min: this.minute, ...spot, res: 'save', id: p.id }); this.log('save', i, `🧤 ${gk ? gk.name : 'O goleiro'} DEFENDE o pênalti de ${p.name}!`); }
    else { t.stats.onTarget--; this.shots.push({ side: i, min: this.minute, ...spot, res: 'miss', id: p.id }); this.log('chance', i, `❌ ${p.name} chuta o pênalti para fora!`); }
  }

  freeKick(i) {
    const t = this.teams[i], o = this.teams[1 - i];
    const p = pickTaker(this.game, t.club, 'fk', this.onIds(t));
    if (!p) return;
    const gk = this.gkOf(o), gkR = gk ? overall(gk, 'GOL') : 15;
    // metade bate direto, metade cruza na área
    if (rnd() < 0.5) {
      t.stats.shots++;
      const skill = (p.attrs.fin + p.attrs.pas) / 2;
      const spot = { x: clamp(50 + (rnd() - 0.5) * 30, 20, 80), d: 0.22 };
      const on = rnd() < clamp(0.3 + (skill - 60) / 200, 0.18, 0.5);
      if (!on) { this.shots.push({ side: i, min: this.minute, ...spot, res: 'miss', id: p.id }); if (this.mine) this.log('chance', i, `🌀 Falta perigosa! ${p.name} cobra por cima da barreira... e da trave.`); return; }
      t.stats.onTarget++;
      if (rnd() < clamp(0.2 + (skill - 60) / 160 - (gkR - 65) / 250, 0.1, 0.42)) this.spGoal(i, p, null, `⚽ GOLAÇO DE FALTA! ${p.name} coloca a bola no ângulo!`, spot);
      else { this.shots.push({ side: i, min: this.minute, ...spot, res: 'save', id: p.id }); this.log('save', i, `🌀 ${p.name} cobra a falta com efeito, ${gk ? gk.name : 'o goleiro'} espalma!`); }
    } else this.aerial(i, p, 'falta');
  }

  cornerKick(i) { const t = this.teams[i]; const p = pickTaker(this.game, t.club, 'ck', this.onIds(t)); if (p) this.aerial(i, p, 'escanteio'); }

  // Bola alçada na área: quem cobra (passe) x quem cabeceia (força) x defesa
  aerial(i, taker, what) {
    const t = this.teams[i], o = this.teams[1 - i];
    const heads = t.onField.filter(x => x.id !== taker.id && x.slot !== 'GOL').map(x => this.P(x.id));
    if (!heads.length) return;
    const h = heads.sort((a, b) => headerScore(b) - headerScore(a))[Math.floor(rnd() * Math.min(3, heads.length))];
    const defs = o.onField.filter(x => x.slot === 'ZAG' || x.slot === 'VOL').map(x => this.P(x.id));
    const defAir = defs.length ? defs.reduce((s, d) => s + d.attrs.for * 0.5 + d.attrs.def * 0.5, 0) / defs.length : 50;
    const cross = taker.attrs.pas;
    const win = clamp(0.3 + (cross - 60) / 250 + (headerScore(h) - defAir) / 180, 0.12, 0.55);
    if (rnd() > win) { if (this.mine && rnd() < 0.5) this.log('tackle', 1 - i, `🚩 ${what === 'falta' ? 'Cobrança de falta' : 'Escanteio'} de ${taker.name}, a defesa do ${o.club.short} afasta.`); return; }
    t.stats.shots++;
    const spot = { x: clamp(50 + (rnd() - 0.5) * 20, 30, 70), d: 0.08 };
    const gk = this.gkOf(o), gkR = gk ? overall(gk, 'GOL') : 15;
    if (rnd() < 0.45) { this.shots.push({ side: i, min: this.minute, ...spot, res: 'miss', id: h.id }); if (this.mine) this.log('chance', i, `🚩 ${taker.name} cobra, ${h.name} sobe e cabeceia para fora!`); return; }
    t.stats.onTarget++;
    if (rnd() < clamp(0.3 + (headerScore(h) - 60) / 200 - (gkR - 65) / 250, 0.15, 0.5)) this.spGoal(i, h, taker, `⚽ GOL DE CABEÇA! ${taker.name} cobra ${what === 'falta' ? 'a falta' : 'o escanteio'} e ${h.name} testa para o fundo da rede!`, spot);
    else { this.shots.push({ side: i, min: this.minute, ...spot, res: 'save', id: h.id }); this.log('save', i, `🚩 ${h.name} cabeceia firme e ${gk ? gk.name : 'o goleiro'} defende!`); }
  }

  // Frase de jogo corrido (posse, toques, faltas) — muda com a instrução
  flow() {
    const i = this.poss, t = this.teams[i], o = this.teams[1 - i];
    const field = t.onField.filter(x => x.slot !== 'GOL'), od = o.onField.filter(x => x.slot !== 'GOL');
    if (!field.length || !od.length) return;
    const ins = this.instr[i];
    const pool = FLOW.slice();
    if (ins === 'segurar') pool.push(...FLOW_HOLD, ...FLOW_HOLD);
    if (ins === 'pressao' || ins === 'tudo') pool.push(...FLOW_PUSH, ...FLOW_PUSH);
    if (ins === 'contra') pool.push(...FLOW_COUNTER, ...FLOW_COUNTER);
    this.log('play', i, pick(pool)(this.P(pick(field).id).name, this.P(pick(od).id).name, t.club.name, o.club.name));
  }

  card(i, t, directRed) {
    const field = t.onField.filter(x => x.slot !== 'GOL' || rnd() < 0.1);
    if (!field.length) return;
    // Defensores levam mais cartão
    const x = pickWeighted(field, field.map(f => ({ ZAG: 3, VOL: 3, LAT: 2, MEI: 1.2, ATA: 1, GOL: 0.5 })[f.slot]));
    const p = this.P(x.id);
    if (!directRed) {
      t.yellows[p.id] = (t.yellows[p.id] || 0) + 1;
      t.stats.yellow++;
      if (t.yellows[p.id] < 2) { this.log('yellow', i, `🟨 Cartão amarelo para ${p.name} (${t.club.short}).`); return; }
      this.log('red', i, `🟥 Segundo amarelo! ${p.name} (${t.club.short}) está expulso.`);
    } else {
      this.log('red', i, `🟥 Vermelho direto! ${p.name} (${t.club.short}) deixa o time com um a menos.`);
    }
    t.stats.red++;
    p._red = true;
    t.onField = t.onField.filter(f => f.id !== p.id);
    this.dirty = true;
    // Se o goleiro for expulso, um jogador de linha vai para o gol
    if (x.slot === 'GOL') this.emergencyKeeper(t);
  }

  emergencyKeeper(t) {
    // Tenta trocar por goleiro reserva, senão improvisa
    const gkId = t.bench.find(id => this.P(id).pos === 'GOL');
    if (gkId && t.subsLeft > 0 && t.onField.length > 1) {
      const out = t.onField.filter(f => f.slot !== 'GOL').sort((a, b) => effectiveRating(this.P(a.id), a.slot) - effectiveRating(this.P(b.id), b.slot))[0];
      this.doSub(t, out.id, gkId, 'GOL');
    } else if (t.onField.length) {
      t.onField[t.onField.length - 1].slot = 'GOL';
      this.dirty = true;
    }
  }

  injury(i, t) {
    if (!t.onField.length) return;
    const x = pick(t.onField);
    const p = this.P(x.id);
    p._injury = Math.ceil(rnd() * rnd() * 8) + 0; // semanas (geralmente curtas)
    if (p._injury < 1) p._injury = 1;
    this.log('injury', i, `🚑 ${p.name} (${t.club.short}) se machuca${p._injury >= 4 ? ' e parece grave' : ''}.`);
    // Time do usuário decide sozinho; IA troca na hora
    if (!this.human(t)) this.aiReplace(t, x);
    else { x.injured = true; p.fitness = Math.min(p.fitness, 30); } // rende pouco até ser trocado
  }

  aiReplace(t, x) {
    if (t.subsLeft <= 0 || !t.bench.length) {
      t.onField = t.onField.filter(f => f.id !== x.id);
      this.dirty = true;
      if (x.slot === 'GOL') this.emergencyKeeper(t);
      return;
    }
    const inId = this.bestBench(t, x.slot);
    if (inId) this.doSub(t, x.id, inId, x.slot);
  }

  bestBench(t, slot) {
    const cands = t.bench.filter(id => !t.used.has(id));
    if (!cands.length) return null;
    return cands.sort((a, b) => effectiveRating(this.P(b), slot) - effectiveRating(this.P(a), slot))[0];
  }

  // Faz uma substituição (usada pela IA e pelo jogador)
  doSub(t, outId, inId, slot) {
    const idx = t.onField.findIndex(f => f.id === outId);
    if (idx < 0 || t.subsLeft <= 0 || t.used.has(inId)) return false;
    const s = slot || t.onField[idx].slot;
    t.onField[idx] = { id: inId, slot: s };
    this.dirty = true;
    t.bench = t.bench.filter(id => id !== inId);
    t.used.add(inId);
    t.subsLeft--;
    const side = this.teams.indexOf(t);
    this.log('sub', side, `🔄 ${t.club.short}: sai ${this.P(outId).name}, entra ${this.P(inId).name}.`);
    return true;
  }

  // Substituição pedida pelo usuário na tela da partida
  userSub(outId, inId) {
    const t = this.teams.find(x => x.club.id === this.userClubId);
    return t ? this.doSub(t, outId, inId) : false;
  }

  tire() {
    for (const t of this.teams) {
      const st = STYLES[t.club.style] || STYLES['Equilibrado'];
      const mk = MARKING[t.club.marking] || MARKING['Média'];
      for (const { id, slot } of t.onField) {
        const p = this.P(id);
        // Goleiro corre bem menos: cansa ~1/4 de um jogador de linha
        // (e não depende da resistência, que é baixa no cadastro de goleiros)
        const loss = slot === 'GOL'
          ? K.TIRE * 0.22
          : K.TIRE * st.tire * mk.tire * (this.talkFx[this.teams.indexOf(t)].tire || 1) * INSTR[this.instr[this.teams.indexOf(t)]].tire * (1.4 - p.attrs.res / 100) * this.wfx(this.teams.indexOf(t)).tire;
        p.fitness = Math.max(10, p.fitness - loss);
      }
    }
  }

  // IA: troca jogadores cansados a partir dos 55 minutos
  aiSubs() {
    if (this.minute < 55 || this.minute > 85) return;
    for (const t of this.teams) {
      if (this.human(t) || t.subsLeft <= 0) continue;
      // Modo carreira: o técnico põe o seu jogador do banco no 2º tempo
      if (this.pcId && t.bench.includes(this.pcId) && !t.used.has(this.pcId) && this.minute >= 58 && rnd() < 0.09) {
        const pc = this.P(this.pcId);
        const out = t.onField.filter(f => f.slot !== 'GOL').sort((a, b) =>
          (b.slot === pc.pos) - (a.slot === pc.pos) || this.P(a.id).fitness - this.P(b.id).fitness)[0];
        if (out && pc.injury <= 0) { this.doSub(t, out.id, this.pcId, out.slot); continue; }
      }
      if (rnd() > 0.12) continue;
      const tired = t.onField.filter(f => f.slot !== 'GOL').sort((a, b) => this.P(a.id).fitness - this.P(b.id).fitness)[0];
      if (!tired || this.P(tired.id).fitness > 72) continue;
      const inId = this.bestBench(t, tired.slot);
      if (inId && this.P(inId).pos !== 'GOL') this.doSub(t, tired.id, inId, tired.slot);
    }
  }

  // Nota de cada jogador na partida (3 a 10, média ~6,5)
  computeRatings() {
    const out = {};
    const [h, a] = this.teams;
    for (const t of this.teams) {
      const gf = t.goals, ga = t === h ? a.goals : h.goals;
      const res = gf > ga ? 0.45 : gf < ga ? -0.35 : 0.05;
      for (const id of t.used) {
        const p = this.P(id);
        let r = 6.2 + res + (overall(p) - 68) * 0.03 + (rnd() + rnd() + rnd() - 1.5) * 0.45;
        r += t.scorers.filter(s => s.id === id).length * 1.0;
        r += t.scorers.filter(s => s.assist === id).length * 0.55;
        if (['GOL', 'ZAG', 'LAT'].includes(p.pos)) r += ga === 0 ? 0.6 : -0.18 * ga;
        if (p.pos === 'GOL') r += (t === h ? a : h).stats.onTarget * 0.08; // defesas
        if (t.yellows[id]) r -= 0.25;
        if (p._red) r -= 1.2; // expulso
        out[id] = Math.round(Math.max(3, Math.min(10, r)) * 10) / 10;
      }
    }
    return out;
  }

  // Simula direto até o fim (jogos dos outros times)
  runToEnd() {
    while (!this.finished) this.step();
    return this;
  }

  // Aplica as consequências nos jogadores e devolve o resultado
  finish() {
    const [h, a] = this.teams;
    this.ratings = this.ratings || this.computeRatings();
    const isLeague = this.competition === 'league';
    for (const t of this.teams) {
      const won = t.goals > (t === h ? a.goals : h.goals);
      const lost = t.goals < (t === h ? a.goals : h.goals);
      const conceded = t === h ? a.goals : h.goals;
      for (const id of t.used) {
        const p = this.P(id);
        p.apps++;
        // Estatísticas da temporada (liga separada do total, para os prêmios)
        const ss = p.ss || (p.ss = { j: 0, g: 0, a: 0, r: 0, lj: 0, lg: 0, la: 0, lr: 0, cs: 0 });
        const g = t.scorers.filter(s => s.id === id).length, as = t.scorers.filter(s => s.assist === id).length;
        const r = this.ratings[id] || 6;
        ss.j++; ss.g += g; ss.a += as; ss.r += r;
        if (isLeague) { ss.lj++; ss.lg += g; ss.la += as; ss.lr += r; }
        if (conceded === 0 && ['GOL', 'ZAG', 'LAT'].includes(p.pos)) ss.cs++;
        p.moral = clamp(p.moral + (won ? 6 : lost ? -5 : 1), 5, 100);
        const y = t.yellows[id] || 0;
        if (p._red) { p.suspended = 1 + (y >= 2 ? 0 : 1); p.yellow = 0; }
        else if (y === 1) { p.yellow++; if (p.yellow >= 3) { p.suspended = 1; p.yellow = 0; } }
        if (p._injury) { p.injury = Math.max(p.injury, p._injury); }
        delete p._red; delete p._injury;
      }
      for (const s of t.scorers) {
        this.P(s.id).goals++;
        if (this.competition === 'league') this.P(s.id).seasonGoals++; // artilharia da liga
        if (s.assist) this.P(s.assist).assists++;
      }
    }
    return {
      home: h.club.id, away: a.club.id, hg: h.goals, ag: a.goals,
      pens: this.pens, ratings: this.ratings,
      scorers: [h.scorers.map(s => ({ min: s.min, name: this.P(s.id).name, id: s.id })),
                a.scorers.map(s => ({ min: s.min, name: this.P(s.id).name, id: s.id }))],
      stats: [h.stats, a.stats]
    };
  }
}

// ---- Instruções durante o jogo ----
// Multiplicadores sobre ataque/meio/defesa, cansaço e faltas
export const INSTR = {
  normal:  { label: 'Normal', att: 1, mid: 1, def: 1, tire: 1, fouls: 1, say: 'volta a jogar no padrão.', tip: 'Segue a tática escolhida.' },
  pressao: { label: 'Pressionar', att: 1.04, mid: 1.07, def: 0.96, tire: 1.3, fouls: 1.3, say: 'adianta a marcação e pressiona a saída de bola!', tip: 'Mais domínio, mais cansaço e faltas.' },
  contra:  { label: 'Contra-ataque', att: 1.08, mid: 0.93, def: 1.04, tire: 1.05, fouls: 1, say: 'recua as linhas e aposta no contra-ataque.', tip: 'Menos posse, ataques mais perigosos.' },
  segurar: { label: 'Segurar', att: 0.8, mid: 1, def: 1.13, tire: 0.85, fouls: 1.1, say: 'fecha a defesa para segurar o resultado.', tip: 'Defesa forte, quase não ataca. Poupa energia.' },
  tudo:    { label: 'Tudo ao ataque', att: 1.16, mid: 1.03, def: 0.85, tire: 1.25, fouls: 1.1, say: 'manda todo mundo para o ataque!', tip: 'Ataque máximo, defesa muito exposta.' }
};

// ---- Frases de narração ----
const BUILD = [
  (a, b) => `${a} lança ${b} na corrida...`,
  (a, b) => `${a} cruza na área, ${b} aparece...`,
  (a, b) => `Tabelinha entre ${a} e ${b} na entrada da área...`,
  (a, b) => `${a} rouba a bola e acha ${b} livre...`,
  (a, b) => `${b} recebe de ${a} e ajeita para o chute...`,
  (a, b) => `${a} vai à linha de fundo e rola para ${b}...`,
  (a, b) => `Escanteio cobrado por ${a}, ${b} sobe...`,
  (a, b) => `${b} invade a área driblando...`
];
const FLOW = [
  (p, d, c) => `O ${c} troca passes no meio-campo, ${p} comanda.`,
  (p, d) => `${d} chega firme e ${p} perde a bola.`,
  (p, d) => `Falta de ${d} em ${p}. O juiz marca.`,
  (p) => `${p} tenta o lançamento longo, a bola sai pela lateral.`,
  (p, d) => `${p} carrega pela ponta, mas ${d} acompanha bem.`,
  (p, d, c) => `O ${c} roda a bola procurando espaço.`,
  (p, d) => `Dividida forte entre ${p} e ${d}.`,
  (p) => `${p} tenta o drible e é desarmado.`,
  (p, d, c, oc) => `O ${oc} se fecha bem, o ${c} não acha brechas.`,
  (p) => `Bola parada: ${p} cruza, mas a zaga afasta.`
];
const FLOW_HOLD = [
  (p, d, c) => `O ${c} gira a bola na defesa, sem pressa nenhuma.`,
  (p) => `${p} segura a bola perto da bandeirinha. A torcida rival vaia!`,
  (p, d, c) => `Todo o time do ${c} atrás da linha da bola.`
];
const FLOW_PUSH = [
  (p, d, c, oc) => `O ${c} sufoca o ${oc} no campo de defesa!`,
  (p, d) => `${p} pressiona a saída de bola e ${d} se enrola.`,
  (p, d, c) => `O ${c} vem com tudo, a torcida empurra!`
];
const FLOW_COUNTER = [
  (p, d, c) => `O ${c} espera o adversário para sair rápido.`,
  (p) => `${p} puxa o contragolpe em velocidade!`
];
const MISS = [
  (p) => `${p} arrisca de fora da área... por cima do gol!`,
  (p) => `${p} recebe na área e chuta para fora. Que chance!`,
  (p) => `Cabeçada de ${p}, a bola passa raspando a trave.`,
  (p) => `${p} tenta a finalização, mas a zaga bloqueia.`,
  (p) => `Contra-ataque rápido, ${p} finaliza mal.`,
  (p) => `${p} bate de primeira e isola a bola.`,
  (p) => `Na trave! ${p} acerta o poste e a bola sai!`,
  (p) => `${p} tenta de cavadinha, mas a bola sai à esquerda.`,
  (p) => `Que perigo! ${p} chuta cruzado e a bola tira tinta da trave.`,
  (p) => `${p} domina no peito, gira e manda por cima do travessão.`,
  (p) => `Falta perigosa: ${p} cobra e a bola passa por cima da barreira... e do gol.`,
  (p) => `${p} perde gol feito! A torcida leva as mãos à cabeça.`
];
const SAVE = [
  (p, g) => `${p} chuta forte, mas ${g} faz grande defesa!`,
  (p, g) => `${g} se estica todo e espalma a finalização de ${p}.`,
  (p, g) => `${p} cara a cara com ${g}... e o goleiro leva a melhor!`,
  (p, g) => `Chute colocado de ${p}, ${g} encaixa firme.`,
  (p, g) => `Milagre de ${g}! Defesaça no chute à queima-roupa de ${p}!`,
  (p, g) => `${p} bate colocado no canto, ${g} voa e manda para escanteio.`,
  (p, g) => `${g} sai do gol na hora certa e abafa ${p}.`,
  (p, g) => `Cabeçada firme de ${p}, ${g} defende com reflexo incrível!`
];
const GOAL = [
  (p, c, a) => `⚽ GOOOL do ${c}! ${p} balança a rede${a ? ` após passe de ${a}` : ''}!`,
  (p, c, a) => `⚽ É GOL! ${p} marca para o ${c}${a ? `, ótima assistência de ${a}` : ''}!`,
  (p, c, a) => `⚽ GOLAÇO! ${p} acerta o ângulo${a ? ` depois do cruzamento de ${a}` : ''}! Festa do ${c}!`,
  (p, c, a) => `⚽ Gol do ${c}! ${p} aproveita a sobra e empurra para o fundo da rede.`,
  (p, c, a) => `⚽ GOOOL! ${p} sobe mais que todo mundo e cabeceia${a ? ` o cruzamento de ${a}` : ''}! ${c} na frente!`,
  (p, c, a) => `⚽ É DO ${c.toUpperCase()}! ${p} dribla o goleiro e toca para o gol vazio!`,
  (p, c, a) => `⚽ Que pintura! ${p} chuta de fora da área e a bola morre na rede!`,
  (p, c, a) => `⚽ GOL! ${a ? `${a} lança e ` : ''}${p} sai cara a cara e não perdoa!`
];
