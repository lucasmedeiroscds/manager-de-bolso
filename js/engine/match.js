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
  GOAL: 0.32,      // chance base de uma finalização no gol virar gol
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
    if (diff === 1 && this.wasBehind[i]) lines.push('VIRADA! Que reação!');
    if (this.minute >= 85) lines.push(diff >= 1 ? 'No finzinho! Gol que pode valer a vitória!' : 'Gol nos acréscimos da emoção!');
    if (t.scorers.filter(s => s.id === shooter.id).length === 3) lines.push(`HAT-TRICK de ${shooter.name}! Leva a bola para casa!`);
    if (diff === 3) lines.push('Goleada se desenhando!');
    lines.push(t.isHome ? 'A torcida explode no estádio!' : pick(['Silêncio nas arquibancadas...', 'A torcida visitante faz a festa no seu cantinho!']));
    this.log('color', i, '🎙️ ' + lines.slice(0, 2).join(' '));
    if (t.goals > o.goals) this.wasBehind[1 - i] = true; // o outro time ficou atrás no placar
  }

  // Quem venceu? (0 mandante, 1 visitante, -1 empate) — conta os pênaltis
  winnerIndex() {
    const [h, a] = this.teams;
    if (h.goals !== a.goals) return h.goals > a.goals ? 0 : 1;
    if (this.pens) return this.pens[0] > this.pens[1] ? 0 : 1;
    return -1;
  }

  // Disputa de pênaltis: 5 cobranças para cada lado e depois alternadas
  penalties() {
    const kick = (t, o) => {
      const shooters = t.onField.filter(x => x.slot !== 'GOL').map(x => this.P(x.id))
        .sort((a, b) => b.attrs.fin - a.attrs.fin);
      const gkSlot = o.onField.find(x => x.slot === 'GOL');
      const gk = gkSlot ? overall(this.P(gkSlot.id), 'GOL') : 30;
      t._pk = (t._pk || 0);
      const p = shooters[t._pk++ % Math.max(1, shooters.length)];
      const chance = clamp(0.62 + (p.attrs.fin - gk) / 250 + (p.moral - 50) / 1000, 0.5, 0.9);
      return { p, ok: rnd() < chance };
    };
    const score = [0, 0];
    const marks = [[], []];
    this.log('info', -1, '🥅 Empate! A decisão vai para os pênaltis.');
    for (let round = 0; round < 30; round++) {
      for (let i = 0; i < 2; i++) {
        const k = kick(this.teams[i], this.teams[1 - i]);
        if (k.ok) score[i]++;
        marks[i].push(k.ok ? '●' : '○');
        this.log('pen', i, `${k.ok ? '✅' : '❌'} ${k.p.name} (${this.teams[i].club.short}) ${k.ok ? 'converte' : 'perde'}. Pênaltis: ${score[0]} x ${score[1]}`);
        // Decidido antes das 5 cobranças?
        if (round < 5) {
          const left = [5 - marks[0].length, 5 - marks[1].length];
          if (score[0] + left[0] < score[1] || score[1] + left[1] < score[0]) { this.pens = score; return; }
        }
      }
      if (round >= 4 && score[0] !== score[1]) { this.pens = score; return; }
    }
    this.pens = score[0] === score[1] ? [score[0] + 1, score[1]] : score;
  }

  buildTeam(club, isHome) {
    const slots = FORMATIONS[club.formation];
    return {
      club, isHome,
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
    const fx = (this.talkFx && this.talkFx[this.teams ? this.teams.indexOf(t) : -1]) || {}; // conversa do técnico
    return {
      att: att * st.att * h * (fx.att || 1), mid: mid * st.mid * h * (fx.mid || 1), def: def * st.def * mk.def * (fx.def || 1), gk,
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
    this.minute++;
    if (this.minute === 1) this.log('info', -1, 'Bola rolando! Começa a partida.');

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
      const cf = mk.fouls * (this.talkFx[i].cards || 1);
      if (rnd() < 0.13 * mk.fouls) t.stats.fouls++;
      if (rnd() < K.YELLOW * cf) this.card(i, t, false);
      else if (rnd() < K.RED * cf) this.card(i, t, true);
      // Lesão
      if (rnd() < K.INJURY) this.injury(i, t);
    }

    this.tire();
    this.aiSubs();

    // Pressão do minuto (para o gráfico): ataques, chutes e posse
    this.pressure.push(this._pm[0] - this._pm[1] + (this.poss === 0 ? 0.3 : -0.3));
    if ([15, 30, 60, 75].includes(this.minute)) this.atmosphere();

    if (this.minute === 45) this.log('half', -1, `Fim do primeiro tempo: ${this.score()}`);
    if (this.minute >= 90) {
      this.log('end', -1, `Fim de jogo! ${this.score()}`);
      if (this.knockout && this.teams[0].goals === this.teams[1].goals) {
        this.penalties();
        const w = this.teams[this.winnerIndex()].club;
        this.log('end', -1, `🏁 ${w.name} vence nos pênaltis por ${Math.max(...this.pens)} x ${Math.min(...this.pens)}!`);
      }
      this.finished = true;
      this.ratings = this.computeRatings(); // notas finais (aparecem na tela)
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

    const fin = shooter.attrs.fin * (0.65 + 0.35 * shooter.fitness / 100);
    const onTarget = rnd() < clamp(K.ON_TARGET * (0.5 + q) * (0.6 + fin / 175), 0.1, 0.8);
    if (!onTarget) {
      if (rnd() < (t.club.focus === 'Pelas laterais' ? 0.5 : 0.35)) t.stats.corners++;
      if (rnd() < 0.45) this.log('chance', i, pick(MISS)(shooter.name, t.club.short)).spot = spot;
      return;
    }
    t.stats.onTarget++;
    this._pm[i] += 1;
    shot.res = 'save';
    // Goleiro: um jogador de linha improvisado no gol tem nota muito baixa
    const gkR = gk ? overall(gk, 'GOL') : 15;
    const pGoal = clamp(K.GOAL * 2 * fin / (fin + gkR) * (0.7 + q * 0.8), 0.05, 0.85);
    if (rnd() < pGoal) {
      t.goals++;
      // Assistência (75% dos gols)
      let assist = null;
      if (rnd() < 0.75) {
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
      if (rnd() < 0.3) t.stats.corners++;
      this.log('save', i, pick(SAVE)(shooter.name, gk ? gk.name : 'o goleiro')).spot = spot;
    }
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
    if (t.club.id !== this.userClubId) this.aiReplace(t, x);
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
          : K.TIRE * st.tire * mk.tire * (this.talkFx[this.teams.indexOf(t)].tire || 1) * (1.4 - p.attrs.res / 100);
        p.fitness = Math.max(10, p.fitness - loss);
      }
    }
  }

  // IA: troca jogadores cansados a partir dos 55 minutos
  aiSubs() {
    if (this.minute < 55 || this.minute > 85) return;
    for (const t of this.teams) {
      if (t.club.id === this.userClubId || t.subsLeft <= 0) continue;
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

// ---- Frases de narração ----
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
