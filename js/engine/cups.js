// =============================================================
// cups.js — COPAS: nacionais, continentais e Mundial de Clubes
// =============================================================
// • Copa nacional: mata-mata em jogo único (empate → pênaltis).
//   Se o número de clubes não for potência de 2, os mais fracos
//   jogam uma fase preliminar e os mais fortes entram direto.
// • Copa continental: grupos de 4 (ida e volta, 6 rodadas); os 2
//   melhores de cada grupo vão ao mata-mata (jogo único, mando do
//   1º colocado; final em campo neutro).
// • Mundial de Clubes: campeões continentais, semifinal e final.
// Os jogos de copa acontecem no MEIO DA SEMANA (antes da rodada da
// liga da mesma semana).
// =============================================================
import { shuffle, pick, rnd } from '../util.js';
import { overall } from './ratings.js';
import { clubPlayers } from './tactics.js';
import { clubById } from './market.js';
import { weeklyWages, addTx } from './finance.js';

// Nomes das copas nacionais (as demais: "Copa nacional (País)")
const NATIONAL_NAMES = {
  'Brasil': 'Copa do Brasil', 'Argentina': 'Copa Argentina', 'Inglaterra': 'FA Cup', 'Espanha': 'Copa del Rey',
  'Itália': 'Coppa Italia', 'Alemanha': 'DFB-Pokal', 'França': 'Coupe de France', 'Portugal': 'Taça de Portugal',
  'Holanda': 'KNVB Beker', 'Estados Unidos': 'US Open Cup', 'México': 'Copa MX', 'Japão': 'Copa do Imperador',
  'Escócia': 'Scottish Cup', 'Turquia': 'Copa da Turquia', 'Bélgica': 'Copa da Bélgica'
};
// Continentais: continente(s) → nome
// tier 1 = principal (campeão vai ao Mundial); tier 2/3 = copas secundárias,
// com os clubes que ficaram logo abaixo na tabela. minClubs: só existe
// se o continente tiver clubes suficientes.
const CONTINENTAL = [
  { id: 'LIB', name: 'Copa Libertadores', conts: ['América do Sul'], tier: 1 },
  { id: 'UCL', name: 'Liga dos Campeões', conts: ['Europa'], tier: 1 },
  { id: 'ACL', name: 'Liga dos Campeões da Ásia', conts: ['Ásia', 'Oceania'], tier: 1 },
  { id: 'CON', name: 'Copa dos Campeões da Concacaf', conts: ['América do Norte'], tier: 1 },
  { id: 'CAF', name: 'Liga dos Campeões da África', conts: ['África'], tier: 1 },
  { id: 'SUL', name: 'Copa Sul-Americana', conts: ['América do Sul'], tier: 2 },
  { id: 'UEL', name: 'Liga Europa', conts: ['Europa'], tier: 2 }
];
// SISTEMA DE VAGAS (igual para todas as ligas de 1ª divisão):
//   1º ao 4º  → copa continental principal (Libertadores, Liga dos Campeões...)
//   5º ao 10º → copa continental secundária (Sul-Americana, Liga Europa),
//               onde ela existir
//   1º ao 8º  → entram direto nas oitavas da copa nacional
export const SLOTS = { tier1: 4, tier2: 6, nationalSeeds: 8 };
const TIER_RANGE = { 1: [0, SLOTS.tier1], 2: [SLOTS.tier1, SLOTS.tier1 + SLOTS.tier2] };
const W_QUAL = [0, 1, 3];                            // fases preliminares das continentais

// Calendário (para temporada de 38 semanas; ajustado proporcionalmente)
const W_NATIONAL = [2, 7, 13, 19, 25, 31];          // até 6 fases
const W_GROUPS = [4, 9, 11, 15, 17, 21];            // 6 rodadas de grupo
const W_KO = [23, 27, 29, 33];                       // oitavas/quartas/semi/final (usa as últimas)
const W_WORLD = [35, 36];

function scaleWeeks(list, T) {
  const out = list.map(w => Math.max(0, Math.min(T - 2, Math.round(w * T / 38))));
  for (let i = 1; i < out.length; i++) if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1;
  return out;
}

export const STAGE_NAMES = { 2: 'Final', 4: 'Semifinal', 8: 'Quartas de final', 16: 'Oitavas de final', 32: '16-avos de final', 64: '32-avos de final' };
const stageName = n => STAGE_NAMES[n] || `Fase de ${n}`;

// Ranking dos clubes de uma liga: tabela da temporada passada (se houver)
// ou reputação (primeira temporada)
function leagueRanking(game, l) {
  const prev = game.lastTables && game.lastTables[l.id];
  const byRep = (a, b) => clubById(game, b).rep - clubById(game, a).rep;
  if (!prev) return l.clubIds.slice().sort(byRep);
  // quem estava na liga segue a tabela; quem acabou de subir entra depois, por reputação
  const kept = prev.filter(id => l.clubIds.includes(id));
  return kept.concat(l.clubIds.filter(id => !kept.includes(id)).sort(byRep));
}

// "Força" de uma liga: média de reputação dos 5 melhores clubes
function leagueCoef(game, l) {
  const reps = l.clubIds.map(id => clubById(game, id).rep).sort((a, b) => b - a).slice(0, 5);
  return reps.reduce((s, v) => s + v, 0) / reps.length;
}

// Distribui vagas entre ligas proporcional à força (ao cubo)
function allocateSlots(game, leagues, total) {
  const coef = leagues.map(l => Math.pow(leagueCoef(game, l), 3));
  const sum = coef.reduce((s, v) => s + v, 0);
  // limite por país: 4 em continentes com muitas ligas; mais onde há poucas ligas
  const cap = l => Math.min(Math.floor(l.clubIds.length / 2), Math.max(4, Math.ceil(total / leagues.length)));
  const raw = leagues.map((l, i) => total * coef[i] / sum);
  const slots = raw.map((v, i) => Math.min(cap(leagues[i]), Math.floor(v)));
  let left = total - slots.reduce((s, v) => s + v, 0);
  const order = leagues.map((l, i) => i).sort((a, b) => (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a])) || coef[b] - coef[a]);
  let guard = 0;
  while (left > 0 && guard++ < 200) {
    for (const i of order) {
      if (left <= 0) break;
      if (slots[i] < cap(leagues[i])) { slots[i]++; left--; }
    }
  }
  return slots;
}

// ---------- Criação das copas da temporada ----------
export function createCups(game) {
  const T = Math.max(...game.leagues.map(l => l.fixtures.length));
  const cups = [];
  // 1) Copas nacionais
  const wn = scaleWeeks(W_NATIONAL, T);
  for (const l of game.leagues) {
    if (l.clubIds.length < 4 || l.tier === 2) continue;
    // Copa nacional: clubes da 1ª e (se existir) da 2ª divisão do país
    const lower = game.leagues.find(x => x.id === l.lowerId);
    const top = leagueRanking(game, l);
    const ranking = top.concat(lower ? leagueRanking(game, lower) : []);
    const cup = {
      id: 'N-' + l.id, type: 'national', leagueId: l.id, country: l.country,
      name: NATIONAL_NAMES[l.country] || `Copa nacional (${l.country})`,
      teams: ranking.slice(), groups: [], rounds: [], champion: null, runnerUp: null, entries: []
    };
    const n = cup.teams.length;
    // Os 8 primeiros da liga entram direto nas oitavas (se houver clubes suficientes)
    const seeds = n >= 24 ? top.slice(0, SLOTS.nationalSeeds) : [];
    const others = ranking.filter(id => !seeds.includes(id));
    const m = others.length;
    const base = seeds.length ? 8 : 1;
    const Q = base * Math.pow(2, Math.floor(Math.log2(m / base)));   // potência de 2
    const pre = m > Q ? 1 : 0;                                         // precisa de fase preliminar?
    const before = pre + Math.round(Math.log2(Q / base));             // fases antes de os cabeças entrarem
    const nStages = before + (seeds.length ? 4 : 0);
    const weeks = wn.slice(Math.max(0, wn.length - nStages));
    while (weeks.length < nStages) weeks.unshift(Math.max(0, weeks[0] - 2));
    cup.weeks = weeks;
    const skip = pre ? others.slice(0, 2 * Q - m) : [];               // os melhores pulam a preliminar
    if (pre) {
      cup.rounds.push(makeRound('Fase preliminar', weeks[0], pairs(shuffle(others.slice(2 * Q - m)))));
      if (skip.length) cup.entries.push({ at: 1, ids: skip });
    } else {
      cup.rounds.push(makeRound(seeds.length ? '1ª fase' : stageName(Q), weeks[0], pairs(shuffle(others))));
    }
    if (seeds.length) cup.entries.push({ at: before, ids: seeds });
    cup.byes = skip.concat(seeds);
    cups.push(cup);
  }

  // 2) Continentais
  const wg = scaleWeeks(W_GROUPS, T), wk = scaleWeeks(W_KO, T);
  const wq = scaleWeeks(W_QUAL, T);
  for (const def of CONTINENTAL.slice().sort((a, b) => a.tier - b.tier)) {
    const leagues = game.leagues.filter(l => def.conts.includes(l.continent) && l.clubIds.length >= 4 && l.tier !== 2);
    if (!leagues.length) continue;
    const [from, to] = TIER_RANGE[def.tier];
    const teams = [];
    for (const l of leagues) teams.push(...leagueRanking(game, l).slice(from, to));
    if (teams.length < 8) continue;
    // Grupos de 4 (2, 4 ou 8 grupos); os que sobram jogam fases preliminares
    let G = 2;
    while (G < 8 && 4 * G * 2 <= teams.length) G *= 2;
    const cup = {
      id: def.id, type: 'continental', name: def.name, conts: def.conts, tier: def.tier,
      teams: teams.slice(), groups: [], rounds: [], byes: [], champion: null, runnerUp: null,
      target: 4 * G, qualWeeks: wq, groupWeeks: wg
    };
    // Semanas do mata-mata: as últimas da lista conforme o número de fases
    cup.koWeeks = wk.slice(wk.length - Math.log2(G * 2));
    advanceQual(game, cup, teams);
    cups.push(cup);
  }
  game.cups = cups;
  game.cupWeekDone = -1;
}

function makeRound(name, week, ties) { return { name, week, ties }; }

// Continental: fases preliminares (os mais fracos se enfrentam) até sobrar
// o número certo de clubes para os grupos; aí sorteia os grupos
function advanceQual(game, cup, pool) {
  const n = pool.length, target = cup.target;
  if (n <= target) {
    const ids = pool.slice(0, target);
    cup.groups = drawGroups(game, ids, ids.length / 4).map((gids, gi) => {
      const fx = groupFixtures(gids);
      return { name: String.fromCharCode(65 + gi), clubIds: gids, fixtures: fx.map((round, r) => round.map(f => ({ ...f, week: cup.groupWeeks[r] }))) };
    });
    cup.byes = [];
    return;
  }
  const k = Math.min(n - target, Math.floor(n / 2));
  const sorted = pool.slice().sort((a, b) => clubById(game, b).rep - clubById(game, a).rep);
  const qi = cup.rounds.length;
  const week = cup.qualWeeks[qi] != null ? cup.qualWeeks[qi] : Math.max(0, cup.groupWeeks[0] - 1);
  cup.byes = sorted.slice(0, n - 2 * k);
  cup.rounds.push({ ...makeRound(qi ? `${qi + 1}ª fase preliminar` : 'Fase preliminar', week, pairs(shuffle(sorted.slice(n - 2 * k)))), qual: true });
}

// Faixas de vaga de uma liga (para colorir a tabela)
export function qualZones(game, leagueId) {
  const l = game.leagues.find(x => x.id === leagueId);
  if (!l || l.tier === 2 || l.clubIds.length < 4) return null;
  const defs = CONTINENTAL.filter(d => d.conts.includes(l.continent));
  const t1 = defs.find(d => d.tier === 1), t2 = defs.find(d => d.tier === 2);
  const natCup = (game.cups || []).find(c => c.type === 'national' && c.leagueId === l.id);
  return {
    t1: t1 ? { n: SLOTS.tier1, name: t1.name } : null,
    t2: t2 ? { n: SLOTS.tier2, name: t2.name } : null,
    nat: natCup && natCup.teams.length >= 24 ? { n: SLOTS.nationalSeeds, name: natCup.name } : null
  };
}
function pairs(ids) {
  const out = [];
  for (let i = 0; i + 1 < ids.length; i += 2) out.push(rnd() < 0.5 ? { h: ids[i], a: ids[i + 1] } : { h: ids[i + 1], a: ids[i] });
  return out;
}

// Sorteio dos grupos com potes (por reputação), evitando clubes do mesmo país
function drawGroups(game, ids, nGroups) {
  const sorted = ids.slice().sort((a, b) => clubById(game, b).rep - clubById(game, a).rep);
  const pots = [0, 1, 2, 3].map(k => sorted.slice(k * nGroups, (k + 1) * nGroups));
  let best = null, bestConf = Infinity;
  for (let t = 0; t < 80; t++) {
    const groups = Array.from({ length: nGroups }, () => []);
    for (const pot of pots) shuffle(pot).forEach((id, i) => groups[i].push(id));
    const conf = groups.reduce((s, g) => {
      const c = g.map(id => clubById(game, id).leagueId);
      return s + c.length - new Set(c).size;
    }, 0);
    if (conf < bestConf) { best = groups; bestConf = conf; }
    if (conf === 0) break;
  }
  return best;
}

// Grupo de 4: turno e returno (6 rodadas)
function groupFixtures(ids) {
  const [a, b, c, d] = shuffle(ids);
  const first = [[{ h: a, a: b }, { h: c, a: d }], [{ h: d, a: a }, { h: b, a: c }], [{ h: a, a: c }, { h: d, a: b }]];
  const second = first.map(r => r.map(f => ({ h: f.a, a: f.h })));
  return first.concat(second);
}

// Classificação de um grupo
export function groupTable(group) {
  const t = {};
  for (const id of group.clubIds) t[id] = { id, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
  for (const round of group.fixtures) for (const f of round) {
    if (!f.r) continue;
    const h = t[f.h], a = t[f.a];
    h.j++; a.j++; h.gp += f.r.hg; h.gc += f.r.ag; a.gp += f.r.ag; a.gc += f.r.hg;
    if (f.r.hg > f.r.ag) { h.v++; h.pts += 3; a.d++; } else if (f.r.hg < f.r.ag) { a.v++; a.pts += 3; h.d++; } else { h.e++; a.e++; h.pts++; a.pts++; }
  }
  return Object.values(t).sort((x, y) => y.pts - x.pts || (y.gp - y.gc) - (x.gp - x.gc) || y.gp - x.gp || y.v - x.v);
}

// ---------- Jogos da semana ----------
// Lista de { cup, f, knockout, neutral, stage } que acontecem nesta semana
export function cupFixturesForWeek(game, week) {
  const out = [];
  for (const cup of game.cups || []) {
    for (const g of cup.groups) for (const round of g.fixtures) for (const f of round) {
      if (f.week === week && !f.r) out.push({ cup, f, knockout: false, neutral: false, stage: `Grupo ${g.name}` });
    }
    for (const r of cup.rounds) {
      if (r.week !== week) continue;
      const isFinal = r.ties.length === 1 && r.name === 'Final';
      for (const f of r.ties) if (!f.r) out.push({ cup, f, knockout: true, neutral: isFinal && cup.type !== 'national', stage: r.name });
    }
  }
  return out;
}

// Depois dos jogos: avança fases, define campeões e paga prêmios
export function processCups(game) {
  const msgs = [];
  for (const cup of game.cups || []) {
    if (cup.champion) continue;
    // Fases preliminares da continental
    if (cup.type === 'continental' && !cup.groups.length) {
      const q = cup.rounds[cup.rounds.length - 1];
      if (!q || !q.ties.every(f => f.r)) continue;
      const w = q.ties.map(f => f.r.winner), lo = q.ties.map(f => f.r.winner === f.h ? f.a : f.h);
      if (lo.includes(game.userClubId)) msgs.push(`❌ Você caiu na ${q.name.toLowerCase()} da ${cup.name}.`);
      advanceQual(game, cup, cup.byes.concat(w));
      const gg = cup.groups.find(x => x.clubIds.includes(game.userClubId));
      if (gg) msgs.push(`🎲 ${cup.name}: você caiu no Grupo ${gg.name}.`);
      continue;
    }
    const koRounds = cup.rounds.filter(r => !r.qual);
    // Fim dos grupos → monta o mata-mata
    if (cup.type === 'continental' && !koRounds.length && cup.groups.length && cup.groups.every(g => g.fixtures.every(r => r.every(f => f.r)))) {
      const tables = cup.groups.map(groupTable);
      const winners = tables.map(t => t[0].id), runners = tables.map(t => t[1].id);
      const ties = winners.map((w, i) => ({ h: w, a: runners[(i + 1) % runners.length] }));
      cup.rounds.push(makeRound(stageName(ties.length * 2), cup.koWeeks[0], ties));
      for (const t of tables) for (const s of t.slice(0, 2)) payPrize(game, cup, s.id, 'groups');
      if (tables.some(t => t.slice(0, 2).some(s => s.id === game.userClubId))) msgs.push(`✅ Você se classificou para o mata-mata da ${cup.name}!`);
      else if (cup.teams.includes(game.userClubId)) msgs.push(`❌ Você foi eliminado na fase de grupos da ${cup.name}.`);
    }
    if (cup.type === 'continental' && !cup.rounds.some(r => !r.qual)) continue; // grupos em andamento
    const last = cup.rounds[cup.rounds.length - 1];
    if (!last || !last.ties.every(f => f.r)) continue;
    const winners = last.ties.map(f => f.r.winner);
    const losers = last.ties.map(f => f.r.winner === f.h ? f.a : f.h);
    winners.forEach(id => payPrize(game, cup, id, 'win'));
    if (losers.includes(game.userClubId)) msgs.push(`❌ Você foi eliminado da ${cup.name} (${last.name}).`);
    if (last.name === 'Final') {
      cup.champion = winners[0]; cup.runnerUp = losers[0];
      payPrize(game, cup, winners[0], 'champion');
      const c = clubById(game, winners[0]);
      msgs.push(`🏆 ${c.name} é campeão da ${cup.name}!${winners[0] === game.userClubId ? ' É SEU TÍTULO!' : ''}`);
      continue;
    }
    // Próxima fase
    let next = winners.slice();
    const idx = cup.type === 'continental' ? cup.rounds.filter(r => !r.qual).length : cup.rounds.length;
    const later = (cup.entries || []).some(e => e.at > idx);
    if (cup.entries) {
      // quem passou direto (os melhores da liga) entra agora
      for (const e of cup.entries.filter(x => x.at === idx)) {
        next = next.concat(e.ids);
        cup.byes = (cup.byes || []).filter(id => !e.ids.includes(id));
      }
      next = shuffle(next);
    } else if (cup.byes && cup.byes.length) {
      // quem passou direto entra agora
      next = shuffle(cup.byes.concat(winners));
      cup.byes = [];
    } else if (cup.type === 'national' || cup.type === 'world') next = shuffle(next);
    const week = cup.type === 'continental' ? cup.koWeeks[idx] : cup.weeks[idx];
    const ties = [];
    for (let i = 0; i + 1 < next.length; i += 2) {
      // continental: mando do melhor (sorteio entre vencedores)
      ties.push(rnd() < 0.5 ? { h: next[i], a: next[i + 1] } : { h: next[i + 1], a: next[i] });
    }
    const rname = later ? `${idx + 1}ª fase` : stageName(ties.length * 2);
    cup.rounds.push(makeRound(rname, week, ties));
    const mine = ties.find(t => t.h === game.userClubId || t.a === game.userClubId);
    if (mine) {
      const opp = clubById(game, mine.h === game.userClubId ? mine.a : mine.h);
      msgs.push(`🎯 ${cup.name} — ${rname}: você enfrenta o ${opp.name} na semana ${week + 1}.`);
    }
  }
  // Mundial de Clubes: quando todas as continentais terminarem
  const conts = (game.cups || []).filter(c => c.type === 'continental' && (c.tier || 1) === 1);
  if (conts.length >= 2 && conts.every(c => c.champion) && !(game.cups || []).some(c => c.type === 'world')) {
    const T = Math.max(...game.leagues.map(l => l.fixtures.length));
    const ww = scaleWeeks(W_WORLD, T);
    let teams = shuffle(conts.map(c => c.champion));
    const cup = { id: 'WLD', type: 'world', name: 'Mundial de Clubes', teams: teams.slice(), groups: [], rounds: [], champion: null, runnerUp: null, weeks: ww };
    if (teams.length >= 4) teams = teams.slice(0, 4);
    if (teams.length === 3) {
      // o mais forte espera na final
      const strongest = teams.slice().sort((a, b) => clubById(game, b).rep - clubById(game, a).rep)[0];
      cup.byes = [strongest];
      teams = teams.filter(id => id !== strongest);
      cup.rounds.push(makeRound('Semifinal', ww[0], pairs(teams)));
    } else {
      cup.byes = [];
      cup.rounds.push(makeRound(stageName(teams.length), teams.length === 2 ? ww[1] : ww[0], pairs(teams)));
      if (teams.length === 2) cup.weeks = [ww[1]];
    }
    game.cups.push(cup);
    if (cup.teams.includes(game.userClubId)) msgs.push(`🌍 Você vai disputar o Mundial de Clubes!`);
    else msgs.push(`🌍 O Mundial de Clubes vai começar: ${cup.teams.map(id => clubById(game, id).name).join(', ')}.`);
  }
  return msgs;
}

// Prêmios (proporcionais à folha salarial média dos participantes)
function payPrize(game, cup, clubId, kind) {
  const base = cup._base || (cup._base = Math.max(200000, cup.teams.reduce((s, id) => s + weeklyWages(game, id), 0) / cup.teams.length));
  const t = cup.tier || 1;
  const mult = cup.type === 'national' ? { win: 0.8, groups: 0, champion: 4 }
    : cup.type === 'continental' ? { win: 2.5 / t, groups: 3 / t, champion: 10 / t }
    : { win: 4, groups: 0, champion: 12 };
  const v = Math.round(base * mult[kind] / 10000) * 10000;
  if (v > 0) addTx(game, clubId, `${cup.name}: ${kind === 'champion' ? 'título' : kind === 'groups' ? 'classificação nos grupos' : 'vitória no mata-mata'}`, v);
}

// Competições de que o clube participa e a situação nelas (para a tela)
export function cupStatus(game, clubId) {
  const out = [];
  for (const cup of game.cups || []) {
    if (!cup.teams.includes(clubId)) continue;
    let status;
    if (cup.champion === clubId) status = '🏆 Campeão!';
    else if (cup.runnerUp === clubId) status = '🥈 Vice-campeão';
    else {
      const ko = cup.rounds.length ? cup.rounds[cup.rounds.length - 1] : null;
      const inKo = ko && ko.ties.some(f => f.h === clubId || f.a === clubId);
      const outKo = cup.rounds.some(r => r.ties.some(f => f.r && (f.h === clubId || f.a === clubId) && f.r.winner !== clubId));
      const byes = cup.byes && cup.byes.includes(clubId);
      if (outKo) status = 'Eliminado';
      else if (inKo) status = ko.name;
      else if (byes) status = cup.type === 'national' ? 'Entra direto numa fase seguinte' : 'Classificado direto para os grupos';
      else if (cup.groups.length) {
        const g = cup.groups.find(x => x.clubIds.includes(clubId));
        if (cup.rounds.some(r => !r.qual)) status = 'Eliminado na fase de grupos';
        else {
          const t = groupTable(g);
          status = t.every(s => s.j === 0) ? `Grupo ${g.name} (começa na semana ${g.fixtures[0][0].week + 1})`
            : `Grupo ${g.name}: ${t.findIndex(s => s.id === clubId) + 1}º lugar`;
        }
      } else status = 'Classificado';
    }
    out.push({ cup, status });
  }
  return out;
}

// Artilharia de uma copa (a partir das súmulas)
export function cupScorers(game, cup) {
  const goals = {};
  const add = f => { if (f.r && f.r.scorers) for (const side of f.r.scorers) for (const s of side) if (s.id) goals[s.id] = (goals[s.id] || 0) + 1; };
  for (const g of cup.groups) for (const r of g.fixtures) r.forEach(add);
  for (const r of cup.rounds) r.ties.forEach(add);
  return Object.entries(goals).map(([id, n]) => ({ p: game.players[id], n })).filter(x => x.p).sort((a, b) => b.n - a.n);
}

export { clubPlayers, overall, pick };
