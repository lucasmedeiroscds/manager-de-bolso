// =============================================================
// locker.js — VESTIÁRIO: panelinhas, amizades e rivalidades
// =============================================================
// • PANELINHAS: os jogadores do seu clube se juntam por afinidade —
//   gringos do mesmo país, veteranos (30+), garotos (até 21) e o
//   "núcleo da casa". Cada grupo tem um líder.
// • AMIZADES e RIVALIDADES entre pares de jogadores (as rivalidades
//   nascem da briga por posição). Elas surgem e somem com o tempo.
// • ENTROSAMENTO (0–100): moral do grupo + amigos jogando juntos −
//   rivais escalados juntos. Mexe um pouco na força do time (±4%).
// • Toda semana: grupo esquecido no banco fica chateado; quando um
//   amigo é vendido o outro sente; rivais escalados juntos podem brigar.
// (Relações são do jogo, sorteadas: não representam pessoas reais.)
// =============================================================
import { clamp, rnd, pick } from '../util.js';
import { overall } from './ratings.js';
import { leadership } from './setpieces.js';

const squad = (g, clubId) => Object.values(g.players).filter(p => p.clubId === clubId && !p.loan);

export function groupsOf(game, club) {
  const ps = squad(game, club.id);
  const byNat = {};
  for (const p of ps) if (p.nat && club.country && p.nat !== club.country) (byNat[p.nat] = byNat[p.nat] || []).push(p);
  const groups = [], used = new Set();
  for (const [nat, list] of Object.entries(byNat)) if (list.length >= 2) { groups.push({ key: 'nat:' + nat, name: `Turma dos gringos (${nat})`, emoji: '🌎', members: list }); list.forEach(p => used.add(p.id)); }
  const rest = ps.filter(p => !used.has(p.id));
  const vets = rest.filter(p => p.age >= 30), kids = rest.filter(p => p.age <= 21);
  if (vets.length >= 2) { groups.push({ key: 'vet', name: 'Veteranos', emoji: '🧓', members: vets }); vets.forEach(p => used.add(p.id)); }
  if (kids.length >= 2) { groups.push({ key: 'kid', name: 'Garotada', emoji: '🧒', members: kids }); kids.forEach(p => used.add(p.id)); }
  const core = ps.filter(p => !used.has(p.id));
  if (core.length) groups.push({ key: 'core', name: 'Núcleo da casa', emoji: '🏠', members: core });
  for (const gr of groups) {
    gr.leader = gr.members.slice().sort((a, b) => leadership(b) - leadership(a))[0];
    gr.moral = Math.round(gr.members.reduce((s, p) => s + p.moral, 0) / gr.members.length);
  }
  return groups;
}

function state(game) {
  const L = game.locker || (game.locker = { club: game.userClubId, pairs: [], cool: 0 });
  if (L.club !== game.userClubId) { L.club = game.userClubId; L.pairs = []; }
  return L;
}

// Entrosamento (0–100) do clube do usuário
export function chemistry(game, club) {
  const ps = squad(game, club.id);
  if (!ps.length) return 50;
  const L = state(game), xi = new Set(club.lineup.filter(Boolean));
  const avg = ps.reduce((s, p) => s + p.moral, 0) / ps.length;
  let c = 50 + (avg - 60) * 0.9;
  for (const pr of L.pairs) {
    const both = xi.has(pr.a) && xi.has(pr.b);
    if (both) c += pr.type === 'friend' ? 3 : -7;
  }
  for (const gr of groupsOf(game, club)) if (gr.leader && gr.leader.moral < 40) c -= 4;
  return Math.round(clamp(c, 0, 100));
}

// Semana (só no modo técnico)
export function weeklyLocker(game, userMatch) {
  if (game.mode === 'player') return [];
  const club = game.clubs.find(c => c.id === game.userClubId);
  const L = state(game), msgs = [];
  const here = id => game.players[id] && game.players[id].clubId === club.id;
  // 1) quem saiu do clube: o amigo sente
  for (const pr of L.pairs.slice()) {
    if (here(pr.a) && here(pr.b)) continue;
    L.pairs = L.pairs.filter(x => x !== pr);
    if (pr.type === 'friend') {
      const stay = here(pr.a) ? game.players[pr.a] : here(pr.b) ? game.players[pr.b] : null;
      const gone = game.players[here(pr.a) ? pr.b : pr.a];
      if (stay) { stay.moral = clamp(stay.moral - 8, 5, 100); msgs.push(`😢 ${stay.name} sentiu a saída do amigo ${gone ? gone.name : ''} (moral −8).`); }
    }
  }
  // 2) novas relações (devagar)
  const ps = squad(game, club.id);
  if (ps.length > 4 && rnd() < 0.3) {
    const friends = L.pairs.filter(p => p.type === 'friend').length, rivals = L.pairs.filter(p => p.type === 'rival').length;
    const has = (a, b) => L.pairs.some(p => (p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id));
    if (friends < 5 && rnd() < 0.65) {
      const a = pick(ps), grp = groupsOf(game, club).find(gr => gr.members.includes(a));
      const pool = (grp && grp.members.length > 1 ? grp.members : ps).filter(x => x !== a && !has(a, x));
      if (pool.length) { const b = pick(pool); L.pairs.push({ a: a.id, b: b.id, type: 'friend', season: game.season }); msgs.push(`🤝 ${a.name} e ${b.name} ficaram amigos no vestiário.`); }
    } else if (rivals < 3) {
      // briga por posição: mesma posição, níveis parecidos
      const a = pick(ps);
      const pool = ps.filter(x => x !== a && x.pos === a.pos && Math.abs(overall(x) - overall(a)) <= 5 && !has(a, x));
      if (pool.length) { const b = pick(pool); L.pairs.push({ a: a.id, b: b.id, type: 'rival', season: game.season }); msgs.push(`⚡ ${a.name} e ${b.name} disputam a mesma vaga e não se bicam.`); }
    }
  }
  // amizades/rivalidades antigas podem acabar
  if (L.pairs.length && rnd() < 0.05) { const pr = pick(L.pairs); L.pairs = L.pairs.filter(x => x !== pr); }
  // 3) efeitos do jogo da semana
  if (userMatch) {
    const t = userMatch.teams.find(x => x.club.id === club.id);
    if (t) {
      for (const pr of L.pairs) {
        const both = t.used.has(pr.a) && t.used.has(pr.b);
        if (!both) continue;
        const A = game.players[pr.a], B = game.players[pr.b];
        if (pr.type === 'friend') { A.moral = clamp(A.moral + 1, 5, 100); B.moral = clamp(B.moral + 1, 5, 100); }
        else if (rnd() < 0.15) { A.moral = clamp(A.moral - 4, 5, 100); B.moral = clamp(B.moral - 4, 5, 100); msgs.push(`😤 ${A.name} e ${B.name} discutiram durante o jogo (moral −4 cada).`); }
      }
      // grupo inteiro fora do time
      if (L.cool > 0) L.cool--;
      else for (const gr of groupsOf(game, club)) {
        if (gr.members.length >= 3 && !gr.members.some(p => t.used.has(p.id))) {
          for (const p of gr.members) p.moral = clamp(p.moral - 2, 5, 100);
          msgs.push(`${gr.emoji} A panelinha "${gr.name}" reclama que ninguém do grupo jogou (moral −2). Líder: ${gr.leader.name}.`);
          L.cool = 3; break;
        }
      }
    }
  }
  club.chem = chemistry(game, club);
  return msgs;
}

export function relationsOf(game, id) {
  const L = state(game);
  return L.pairs.filter(p => p.a === id || p.b === id).map(p => ({ type: p.type, other: game.players[p.a === id ? p.b : p.a] })).filter(x => x.other);
}
export function pairs(game) { return state(game).pairs; }
