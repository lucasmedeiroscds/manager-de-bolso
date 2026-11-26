// =============================================================
// pitch-anim.js — MOVIMENTO no campo (bola e jogadores)
// =============================================================
// O motor de jogo decide o que acontece em cada minuto (quem tem a
// bola, se houve ataque, chute, gol, defesa ou desarme). Este arquivo
// só ANIMA isso de um jeito que faça sentido:
//
//  • A bola sempre tem um "dono": quem conduz carrega a bola; passes
//    vão até um companheiro (de preferência mais à frente); chutes vão
//    em direção ao gol; o goleiro segura e repõe; desarmes trocam o dono.
//  • Os times se movem em bloco: quem ataca sobe as linhas, quem
//    defende recua e se fecha; todos deslizam para o lado da bola.
//  • O defensor mais próximo pressiona; no ataque, atacantes e meias
//    entram na área.
//
// Coordenadas em % do campo: x 0–100 (esquerda→direita),
// y 0–100 (topo→base). O time do usuário fica embaixo e ataca para cima.
// =============================================================
import { layout } from './match-screen.js';
import * as Sound from './sound.js';

const R = Math.random;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

export class PitchAnimator {
  constructor(S) {
    this.S = S;
    this.pos = {};          // posição atual de cada jogador
    this.ball = { x: 50, y: 50 };
    this.lift = 0;          // "altura" da bola (passe longo, chute)
    this.carrier = null;    // quem está com a bola
    this.queue = [];        // ações planejadas para o minuto
    this.cur = null;        // ação em andamento
    this.raf = null;
    this.last = 0;
    this.seed = {};         // variação individual (balanço natural)
    this.minuteMs = 300;
  }

  get m() { return this.S.prep && this.S.prep.userMatch; }

  // ---------- Ligação com a tela ----------
  attach() {
    this.root = document.getElementById('mx-pitch');
    if (!this.root) { this.stopLoop(); return; }
    this.root.classList.add('anim');
    this.ballEl = document.getElementById('mx-ball');
    this.els = {};
    this.root.querySelectorAll('.pl[data-pid]').forEach(el => { this.els[el.dataset.pid] = el; });
    // Tamanho do campo em pixels (as posições viram "transform", que o
    // celular desenha na placa de vídeo, sem recalcular a página a cada quadro)
    const box = (this.ballEl && this.ballEl.offsetParent) || this.root;
    const measure = () => { this.w = box.clientWidth; this.h = box.clientHeight; };
    measure();
    if (this.ro) this.ro.disconnect();
    if (window.ResizeObserver) { this.ro = new ResizeObserver(measure); this.ro.observe(box); }
    this.hasBallId = null; this.liftKey = null;
    this.computeBase();
    for (const id of this.ids) {
      if (!this.pos[id]) this.pos[id] = { ...this.base[id] };
      if (this.seed[id] == null) this.seed[id] = R() * 100;
    }
    if (!this.carrier || !this.info[this.carrier]) this.kickoff(0, true);
    this.render();
    this.startLoop();
  }

  computeBase() {
    const m = this.m;
    const me = m.teams.findIndex(t => t.club.id === this.S.game.userClubId);
    this.meIdx = me;
    this.base = {};
    this.info = {};
    this.ids = [];
    m.teams.forEach((t, ti) => {
      const bottom = ti === me;
      Object.assign(this.base, layout(t.onField, bottom));
      for (const f of t.onField) {
        this.info[f.id] = { ti, bottom, slot: f.slot, dir: bottom ? -1 : 1, ownY: bottom ? 100 : 0, oppY: bottom ? 0 : 100 };
        this.ids.push(f.id);
      }
    });
  }

  startLoop() {
    if (this.raf) return;
    this.last = performance.now();
    this.lastFrame = this.last;
    const loop = t => { this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
    // Plano B: se o navegador pausar o requestAnimationFrame (alguns
    // celulares em economia de bateria), um temporizador mantém o movimento
    this.watch = setInterval(() => {
      if (performance.now() - this.lastFrame > 120) this.frame(performance.now());
    }, 40);
  }
  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    clearInterval(this.watch);
    this.raf = null; this.watch = null;
  }
  destroy() { this.stopLoop(); if (this.ro) this.ro.disconnect(); this.ro = null; this.root = null; }

  // ---------- Utilidades ----------
  teamIds(ti) { return this.ids.filter(id => this.info[id].ti === ti); }
  bottomOf(ti) { return ti === this.meIdx; }
  // progresso (0 = perto do próprio gol, 1 = perto do gol adversário)
  prog(ti, y) { return this.bottomOf(ti) ? (100 - y) / 100 : y / 100; }
  yAt(ti, prog) { return this.bottomOf(ti) ? 100 - prog * 100 : prog * 100; }
  gk(ti) { return this.teamIds(ti).find(id => this.info[id].slot === 'GOL'); }
  carrierTeam() { return this.carrier && this.info[this.carrier] ? this.info[this.carrier].ti : 0; }

  nearest(ti, pt, exclude = [], noGK = true) {
    let best = null, bd = Infinity;
    for (const id of this.teamIds(ti)) {
      if (exclude.includes(id) || (noGK && this.info[id].slot === 'GOL')) continue;
      const d = dist(this.pos[id], pt);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  // Companheiro para receber o passe: de preferência mais à frente
  pickMate(fromId, wantForward = true) {
    const ti = this.info[fromId].ti;
    const me = this.prog(ti, this.pos[fromId].y);
    const cands = this.teamIds(ti).filter(id => id !== fromId && this.info[id].slot !== 'GOL');
    if (!cands.length) return null;
    const w = cands.map(id => {
      const p = this.prog(ti, this.pos[id].y);
      const d = dist(this.pos[id], this.pos[fromId]);
      let s = 1 / (1 + Math.abs(d - 18) / 10);           // passes de média distância
      if (wantForward) s *= p > me ? 1 + (p - me) * 6 : 0.35;
      return s * (0.6 + R() * 0.8);
    });
    return cands[w.indexOf(Math.max(...w))];
  }

  // ---------- Reinício ----------
  kickoff(ti, snap = false) {
    // todos voltam às posições; um atacante do time ti na bola, no meio
    for (const id of this.ids) if (snap) this.pos[id] = { ...this.base[id] };
    const fw = this.teamIds(ti).filter(id => this.info[id].slot !== 'GOL')
      .sort((a, b) => this.prog(ti, this.base[b].y) - this.prog(ti, this.base[a].y) || Math.abs(this.base[a].x - 50) - Math.abs(this.base[b].x - 50))[0];
    this.carrier = fw || this.ids[0];
    this.ball = { x: 50, y: 50 };
    this.lift = 0;
    if (this.pos[this.carrier]) this.pos[this.carrier] = { x: 50, y: 50 - this.info[this.carrier].dir * 2 };
    this.queue = []; this.cur = null;
  }

  // ---------- Planejamento de um minuto ----------
  // evs: eventos do minuto (do motor). Monta a sequência de ações.
  onMinute(evs, minuteMs) {
    const m = this.m;
    if (!m || !this.root) return;
    this.minuteMs = minuteMs || this.minuteMs;
    this.finishAll(); // termina o que sobrou do minuto anterior

    if (evs.some(e => e.type === 'half')) { this.kickoff(1, true); return; }
    if (evs.some(e => e.type === 'end') || m.finished) { this.queue = [this.act('hold', 2)]; return; }

    const goal = evs.find(e => e.type === 'goal');
    const save = evs.find(e => e.type === 'save');
    const miss = evs.find(e => e.type === 'chance');
    const tackle = evs.find(e => e.type === 'tackle');
    const shotEv = goal || save || miss;
    const plan = [];
    this.path = [];   // jogada gravada (para o replay do gol)

    // Quem deve estar com a bola neste minuto
    let T = shotEv ? shotEv.side : tackle ? 1 - tackle.side : (m.poss ?? this.carrierTeam());
    if (this.carrierTeam() !== T) plan.push(this.act('steal', 0.7, { team: T }));

    if (shotEv) {
      // Quem finaliza na animação é o mesmo jogador citado na narração
      const players = this.S.game.players;
      let shooter = null, at = Infinity;
      for (const id of this.teamIds(T)) {
        const i = shotEv.text.indexOf(players[id].name);
        if (i >= 0 && i < at) { at = i; shooter = id; }
      }
      // Constrói o ataque: passes para frente até a entrada da área
      plan.push(this.act('progress', 1.1, { team: T, to: 0.55 + R() * 0.1 }));
      plan.push(this.act('progress', 1.0, { team: T, to: 0.72 + R() * 0.08, forceMate: shooter }));
      // A finalização sai do local que o motor registrou (o mesmo do mapa de chutes)
      plan.push(this.act('run', 0.6, { team: T, to: 0.82 + R() * 0.06, spot: shotEv.spot }));
      const result = goal ? 'goal' : save ? 'save' : 'miss';
      plan.push(this.act('shot', 0.55, { team: T, result }));
      if (result === 'goal') { plan.push(this.act('hold', 2.6)); plan.push(this.act('kickoff', 0.01, { team: 1 - T })); }
      else if (result === 'save') { plan.push(this.act('hold', 0.7)); plan.push(this.act('distribute', 0.9)); }
      else { plan.push(this.act('goalkick', 0.5, { team: 1 - T })); plan.push(this.act('distribute', 0.9)); }
    } else if (tackle) {
      plan.push(this.act('progress', 1, { team: T, to: 0.35 + R() * 0.3 }));
      plan.push(this.act('steal', 0.7, { team: 1 - T }));
    } else if (m.attackSide === T) {
      // Ataque sem finalização (bloqueado / cruzamento cortado)
      plan.push(this.act('progress', 1, { team: T, to: 0.5 + R() * 0.1 }));
      plan.push(this.act('progress', 1, { team: T, to: 0.66 + R() * 0.1 }));
      plan.push(this.act('run', 0.6, { team: T, to: 0.75 + R() * 0.05 }));
    } else {
      // Troca de passes no meio (posse de bola)
      const n = 1 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) plan.push(this.act('progress', 1, { team: T, to: 0.3 + R() * 0.3, side: true }));
      if (R() < 0.5) plan.push(this.act('run', 0.8, { team: T, to: 0.4 + R() * 0.2 }));
    }

    // Ajusta as durações para caber no minuto
    const total = plan.reduce((s, a) => s + a.w, 0);
    const avail = this.minuteMs * 0.92 / 1000;
    for (const a of plan) a.dur = Math.max(0.02, a.w / total * avail);
    this.queue = plan;
  }

  act(type, w, extra = {}) { return { type, w, t: 0, dur: w, ...extra }; }

  // Começa uma ação (define origem e destino)
  begin(a) {
    a.from = { ...this.ball };
    const c = this.carrier;
    if (a.type === 'steal') {
      const by = this.nearest(a.team, this.ball);
      a.by = by; a.to = by ? { ...this.pos[by] } : { ...this.ball };
    } else if (a.type === 'progress') {
      // passe para um companheiro, preferindo quem está à frente
      const ct = this.carrierTeam();
      if (ct !== a.team || !c) { a.skip = true; return; }
      let mate = a.side ? this.pickMate(c, R() < 0.6) : this.pickMate(c, true);
      if (a.forceMate && this.info[a.forceMate]) {
        if (a.forceMate === c) { a.skip = true; return; } // ele já está com a bola
        mate = a.forceMate;
      }
      if (!mate) { a.skip = true; return; }
      a.mate = mate;
      // o receptor se apresenta: ponto um pouco à frente da posição dele
      const mp = this.pos[mate];
      const targetProg = Math.max(this.prog(a.team, mp.y), a.to - 0.08 + R() * 0.08);
      a.to = { x: clamp(mp.x + (R() - 0.5) * 8, 8, 92), y: this.yAt(a.team, Math.min(0.9, targetProg)) };
      a.long = dist(a.from, a.to) > 30;
    } else if (a.type === 'run') {
      if (!c || this.carrierTeam() !== a.team) { a.skip = true; return; }
      const p0 = this.pos[c];
      a.p0 = { ...p0 };
      if (a.spot) {
        // d: 0 = linha do gol, 1 = meio-campo (metade do campo = 50%)
        const bottom = this.bottomOf(a.team);
        a.to = { x: bottom ? a.spot.x : 100 - a.spot.x, y: bottom ? a.spot.d * 50 : 100 - a.spot.d * 50 };
      } else a.to = { x: clamp(lerp(p0.x, 50, 0.4) + (R() - 0.5) * 20, 15, 85), y: this.yAt(a.team, a.to) };
    } else if (a.type === 'shot') {
      if (!this.flushing) Sound.kick();
      const bottom = this.bottomOf(a.team);
      const line = bottom ? 0 : 100;
      const gk = this.gk(1 - a.team);
      if (a.result === 'goal') a.to = { x: 44 + R() * 12, y: bottom ? -1.5 : 101.5 };
      else if (a.result === 'save') a.to = gk ? { x: this.pos[gk].x + (R() - 0.5) * 4, y: this.pos[gk].y } : { x: 50, y: line };
      else a.to = R() < 0.5 ? { x: R() < 0.5 ? 36 + R() * 5 : 59 + R() * 5, y: bottom ? -2 : 102 } : { x: 44 + R() * 12, y: bottom ? -3 : 103, high: true };
      a.gk = gk;
    } else if (a.type === 'goalkick') {
      const gk = this.gk(a.team);
      a.gk = gk;
    } else if (a.type === 'distribute') {
      // goleiro repõe para um defensor / lateral
      const ti = this.carrierTeam();
      const mates = this.teamIds(ti).filter(id => ['ZAG', 'LAT', 'VOL'].includes(this.info[id].slot));
      a.mate = mates.length ? mates[Math.floor(R() * mates.length)] : this.pickMate(this.carrier, true);
      if (!a.mate) { a.skip = true; return; }
      a.to = { ...this.pos[a.mate] };
      a.long = true;
    }
    // Grava a jogada do time que ataca (passes, condução e chute) para o replay
    if (!a.skip && this.path && ['progress', 'run', 'shot'].includes(a.type) && a.to) {
      const who = a.type === 'progress' ? a.mate : this.carrier;
      const pl = who && this.S.game.players[who];
      this.path.push({ type: a.type, from: { ...(a.type === 'run' ? a.p0 : a.from) }, to: { ...a.to }, name: pl ? pl.name : '' });
    }
  }

  // Replay do gol: zoom na área e a jogada desenhada sobre o campo
  replay(teamIdx, path) {
    const inner = document.getElementById('mx-pitch-inner');
    if (!inner || !path || !path.length) return;
    this.path = path;
    inner.querySelectorAll('.replay').forEach(e => e.remove());
    const bottom = this.bottomOf(teamIdx);
    const goalY = bottom ? 0 : 100;
    // zoom centrado na área onde saiu o gol
    const last = this.path[this.path.length - 1];
    inner.style.transformOrigin = `${clamp(last.from.x, 25, 75)}% ${bottom ? 4 : 96}%`;
    inner.classList.remove('zoom'); void inner.offsetWidth; inner.classList.add('zoom');
    const segs = this.path.map((s, i) => {
      const len = Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);
      const cls = s.type === 'shot' ? 'rp-shot' : s.type === 'run' ? 'rp-run' : 'rp-pass';
      return `<line x1="${s.from.x}" y1="${s.from.y}" x2="${s.to.x}" y2="${clamp(s.to.y, -2, 102)}" class="${cls}"
        style="--len:${len.toFixed(1)};animation-delay:${(i * 0.35).toFixed(2)}s" vector-effect="non-scaling-stroke"/>`;
    }).join('');
    const names = this.path.filter(s => s.type !== 'shot' && s.name).map((s, i) =>
      `<span class="rp-name" style="left:${s.to.x}%;top:${s.to.y}%;animation-delay:${(i * 0.35 + 0.25).toFixed(2)}s">${s.name.split(' ').pop()}</span>`).join('');
    const div = document.createElement('div');
    div.className = 'replay';
    div.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${segs}<circle cx="${clamp(last.to.x, 0, 100)}" cy="${goalY}" r="2.2" class="rp-goal"/></svg>${names}`;
    inner.appendChild(div);
    // etiqueta "REPLAY" fora da camada com zoom (para não sair do quadro)
    const pitch = document.getElementById('mx-pitch');
    pitch.querySelectorAll(':scope > .rp-tag').forEach(e => e.remove());
    const tag = document.createElement('span');
    tag.className = 'rp-tag';
    tag.textContent = '⟲ REPLAY';
    pitch.appendChild(tag);
    setTimeout(() => { div.remove(); tag.remove(); inner.classList.remove('zoom'); }, 2900);
  }

  // Termina uma ação (consequência)
  end(a) {
    if (a.skip) return;
    switch (a.type) {
      case 'steal': if (a.by) { this.carrier = a.by; this.ball = { ...this.pos[a.by] }; } break;
      case 'progress': case 'distribute': if (a.mate) { this.carrier = a.mate; this.ball = { ...a.to }; this.pos[a.mate] = { ...a.to }; } break;
      case 'run': this.ball = { ...a.to }; break;
      case 'shot':
        this.ball = { ...a.to };
        if (a.result === 'save' && a.gk) this.carrier = a.gk;
        else this.carrier = null;
        // jogada atropelada pelo minuto seguinte: sem som/comemoração atrasados
        if (this.flushing) break;
        // sons no instante em que a bola chega: gol ou "uuuh" da torcida
        if (a.result === 'goal') Sound.goal(); else Sound.ooh();
        if (a.result === 'goal') {
          // "GOOOL!" + placar na hora em que a bola entra, depois o replay
          if (this.S.revealGoal) this.S.revealGoal();
          const fl = document.getElementById('mx-flash');
          if (fl) { fl.textContent = 'GOOOL!'; fl.classList.remove('show'); void fl.offsetWidth; fl.classList.add('show'); }
          const path = (this.path || []).slice();
          setTimeout(() => this.replay(a.team, path), 700);
        }
        break;
      case 'goalkick': if (a.gk) { this.carrier = a.gk; this.ball = { ...this.pos[a.gk] }; } break;
      case 'kickoff': this.kickoff(a.team, false); break;
    }
    this.lift = 0;
  }

  finishAll() {
    // em velocidade alta o minuto acaba antes da animação: conclui o resto na hora
    this.flushing = true;
    if (this.cur) { this.end(this.cur); this.cur = null; }
    while (this.queue.length) {
      const a = this.queue.shift();
      this.begin(a);
      this.end(a);
    }
    this.flushing = false;
  }

  // ---------- Quadro a quadro ----------
  frame(now) {
    if (!this.root || !this.root.isConnected) { this.stopLoop(); return; }
    // (limite de 0,25 s: em aparelhos lentos a animação não fica atrasada)
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.lastFrame = now;
    const t = now / 1000;

    // Avança a ação atual
    if (!this.cur && this.queue.length) { this.cur = this.queue.shift(); this.begin(this.cur); this.cur.started = true; }
    const a = this.cur;
    if (a) {
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      if (!a.skip) {
        if (a.type === 'progress' || a.type === 'distribute' || a.type === 'steal') {
          const to = a.type === 'steal' && a.by ? this.pos[a.by] : a.to;
          this.ball.x = lerp(a.from.x, to.x, ease(k));
          this.ball.y = lerp(a.from.y, to.y, ease(k));
          this.lift = a.long ? Math.sin(Math.PI * k) : 0;
        } else if (a.type === 'shot') {
          this.ball.x = lerp(a.from.x, a.to.x, k);
          this.ball.y = lerp(a.from.y, a.to.y, k);
          this.lift = a.to.high ? Math.sin(Math.PI * k) * 1.2 : Math.sin(Math.PI * k) * 0.4;
        } else if (a.type === 'run') {
          // o condutor leva a bola
          const c = this.carrier;
          const p = { x: lerp(a.p0.x, a.to.x, ease(k)), y: lerp(a.p0.y, a.to.y, ease(k)) };
          if (c && this.pos[c]) this.pos[c] = { ...p };
          this.ball = { x: p.x + 0.6, y: p.y + this.info[c].dir * 1.6 };
        }
      }
      if (k >= 1) { this.end(a); this.cur = null; }
    }
    // Bola "grudada" em quem conduz quando não há ação de bola
    const moving = a && !a.skip && ['progress', 'distribute', 'steal', 'shot', 'run'].includes(a.type);
    if (!moving && this.carrier && this.pos[this.carrier]) {
      const cp = this.pos[this.carrier], d = this.info[this.carrier].dir;
      this.ball.x = lerp(this.ball.x, cp.x + 0.6, Math.min(1, dt * 12));
      this.ball.y = lerp(this.ball.y, cp.y + d * 1.6, Math.min(1, dt * 12));
    }

    // Relógio parado (intervalo, pausa, fim de jogo) e nenhuma jogada em
    // andamento: todos ficam parados no lugar
    const m = this.m;
    const frozen = !this.cur && !this.queue.length && (!this.S.matchRunning || (m && m.finished));
    if (!frozen) this.updatePlayers(dt, t, a);
    this.render();
  }

  // Para onde cada jogador quer ir agora
  updatePlayers(dt, t, a) {
    const ct = this.carrierTeam();
    const hasCarrier = !!this.carrier;
    const progBall = this.prog(ct, this.ball.y);       // quão avançado está o ataque
    const presser = hasCarrier ? this.nearest(1 - ct, this.ball) : null;
    const presser2 = hasCarrier && progBall > 0.55 ? this.nearest(1 - ct, this.ball, [presser]) : null;
    const receiver = a && !a.skip && (a.type === 'progress' || a.type === 'distribute') ? a.mate : null;

    for (const id of this.ids) {
      const inf = this.info[id], b = this.base[id];
      if (!b || !this.pos[id]) continue;
      let x = b.x, y = b.y, k = 2.6;
      const attacking = inf.ti === ct && hasCarrier;
      if (inf.slot === 'GOL') {
        // goleiro acompanha a bola na linha do gol
        x = 50 + (this.ball.x - 50) * 0.22;
        const threat = inf.ti !== ct ? progBall : 0;
        // com a bola no ataque o goleiro adianta um pouco; sob ameaça, fica na linha
        y = b.y + (attacking ? inf.dir * 6 * progBall : -inf.dir * 2 * threat);
      } else {
        if (attacking) {
          // time com a bola sobe as linhas
          y = b.y + inf.dir * (6 + 18 * progBall);
          // no último terço, atacantes e meias entram na área
          if (progBall > 0.6 && (inf.slot === 'ATA' || inf.slot === 'MEI')) {
            const boxY = inf.bottom ? 14 : 86;
            y = lerp(y, boxY, clamp((progBall - 0.6) * 2.2, 0, 0.8));
          }
          // laterais abrem o campo
          if (inf.slot === 'LAT') x = b.x < 50 ? lerp(b.x, 6, 0.4) : lerp(b.x, 94, 0.4);
        } else {
          // time sem a bola recua e se fecha perto do próprio gol
          const threat = hasCarrier ? progBall : 0.3;
          y = inf.ownY + (b.y - inf.ownY) * (1 - 0.35 * threat) - inf.dir * 2;
          x = 50 + (b.x - 50) * (1 - 0.2 * threat);
        }
        // todos deslizam para o lado da bola
        x += (this.ball.x - 50) * 0.3;
      }
      // balanço natural (ninguém fica parado como estátua)
      const s = this.seed[id] || 0;
      x += Math.sin(t * 0.9 + s) * 0.9;
      y += Math.cos(t * 0.7 + s * 1.3) * 0.9;

      // casos especiais
      if (id === this.carrier && !(a && a.type === 'run')) {
        x = this.ball.x - 0.6; y = this.ball.y - inf.dir * 1.6; k = 9;
      } else if (id === receiver) {
        x = a.to.x; y = a.to.y; k = 5;
      } else if (id === presser || id === presser2) {
        // marcação: vai em cima de quem tem a bola, entre ela e o gol
        x = this.ball.x + (50 - this.ball.x) * 0.05;
        y = this.ball.y - inf.dir * (id === presser ? 2.5 : 6);
        k = id === presser ? 4.5 : 3;
      } else if (a && a.type === 'steal' && id === a.by) {
        x = this.ball.x; y = this.ball.y; k = 7;
      }
      if (a && a.type === 'run' && id === this.carrier) continue; // posição já definida pela corrida

      x = clamp(x, 3, 97); y = clamp(y, 2.5, 97.5);
      const p = this.pos[id];
      const f = Math.min(1, dt * k);
      p.x += (x - p.x) * f;
      p.y += (y - p.y) * f;
    }
  }

  render() {
    const W = this.w || 1, H = this.h || 1;
    for (const id of this.ids) {
      const el = this.els[id], p = this.pos[id];
      if (!el || !p) continue;
      el.style.transform = `translate3d(${(p.x * W / 100).toFixed(1)}px,${(p.y * H / 100).toFixed(1)}px,0) translate(-50%,-50%)`;
    }
    // quem está com a bola: só mexe no destaque quando muda
    if (this.hasBallId !== this.carrier) {
      if (this.els[this.hasBallId]) this.els[this.hasBallId].classList.remove('has-ball');
      if (this.els[this.carrier]) this.els[this.carrier].classList.add('has-ball');
      this.hasBallId = this.carrier;
    }
    if (this.ballEl) {
      const bx = clamp(this.ball.x, -2, 102) * W / 100, by = clamp(this.ball.y, -3, 103) * H / 100;
      this.ballEl.style.transform = `translate3d(${bx.toFixed(1)}px,${by.toFixed(1)}px,0) translate(-50%,-50%) scale(${(1 + this.lift * 0.55).toFixed(2)})`;
      // sombra da bola no alto: só atualiza quando a altura muda de verdade
      const lk = Math.round(this.lift * 10);
      if (lk !== this.liftKey) {
        this.liftKey = lk;
        const l = lk / 10;
        this.ballEl.style.boxShadow = l > 0.05
          ? `0 0 0 1px #000, ${(l * 4).toFixed(1)}px ${(l * 7).toFixed(1)}px ${(2 + l * 4).toFixed(1)}px #0007`
          : '0 0 0 1px #000, 0 2px 4px #0008';
      }
    }
  }
}
