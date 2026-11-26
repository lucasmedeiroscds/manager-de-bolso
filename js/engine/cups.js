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
  { id: 'SUL', name: 'Copa Sul-Americana', conts: ['América do Sul'], tier: 2, minClubs: 40 },
  { id: 'UEL', name: 'Liga Europa', conts: ['Europa'], tier: 2, minClubs: 120 },
  { id: 'UECL', name: 'Liga Conferência', conts: ['Europa'], tier: 3, minClubs: 200 }
];

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
    const ranking = leagueRanking(game, l).concat(lower ? leagueRanking(game, lower) : []);
    const cup = {
      id: 'N-' + l.id, type: 'national', leagueId: l.id, country: l.country,
      name: NATIONAL_NAMES[l.country] || `Copa nacional (${l.country})`,
      teams: ranking.slice(), groups: [], rounds: [], champion: null, runnerUp: null
    };
    // Fase preliminar se não for potência de 2
    const n = cup.teams.length;
    const P = Math.pow(2, Math.floor(Math.log2(n)));
    const nStages = Math.log2(P) + (n > P ? 1 : 0);
    const weeks = wn.slice(Math.max(0, wn.length - nStages));
    while (weeks.length < nStages) weeks.unshift(Math.max(0, weeks[0] - 2));
    cup.weeks = weeks;
    if (n > P) {
      const playIn = shuffle(ranking.slice(n - 2 * (n - P)));      // os mais fracos
      cup.byes = ranking.slice(0, n - 2 * (n - P));                 // entram na fase seguinte
      cup.rounds.push(makeRound('Fase preliminar', weeks[0], pairs(playIn)));
    } else {
      cup.byes = [];
      cup.rounds.push(makeRound(stageName(P), weeks[0], pairs(shuffle(ranking))));
    }
    cups.push(cup);
  }

  // 2) Continentais
  const wg = scaleWeeks(W_GROUPS, T), wk = scaleWeeks(W_KO, T);
  const taken = new Set(); // um clube joga só uma copa continental por temporada
  for (const def of CONTINENTAL.slice().sort((a, b) => a.tier - b.tier)) {
    const leagues = game.leagues.filter(l => def.conts.includes(l.continent) && l.clubIds.length >= 4 && l.tier !== 2);
    const clubs = leagues.reduce((s, l) => s + l.clubIds.length, 0);
    if (!leagues.length || clubs < Math.max(16, def.minClubs || 0)) continue;
    if (def.tier > 1 && !cups.some(c => c.type === 'continental' && c.conts.join() === def.conts.join())) continue;
    const size = clubs >= 120 && leagues.length >= 6 ? 32 : 16;
    const slots = allocateSlots(game, leagues, size);
    const teams = [];
    leagues.forEach((l, i) => teams.push(...leagueRanking(game, l).filter(id => !taken.has(id)).slice(0, slots[i])));
    teams.forEach(id => taken.add(id));
    if (teams.length < 8) continue;
    // Arredonda para múltiplo de 4
    const usable = teams.slice(0, Math.floor(teams.length / 4) * 4);
    const nGroups = usable.length / 4;
    const groups = drawGroups(game, usable, nGroups);
    const cup = {
      id: def.id, type: 'continental', name: def.name, conts: def.conts, tier: def.tier,
      teams: usable, groups: groups.map((ids, gi) => {
        const fx = groupFixtures(ids);
        return { name: String.fromCharCode(65 + gi), clubIds: ids, fixtures: fx.map((round, r) => round.map(f => ({ ...f, week: wg[r] }))) };
      }),
      rounds: [], champion: null, runnerUp: null
    };
    // Semanas do mata-mata: as últimas da lista conforme o número de fases
    const koStages = Math.log2(nGroups * 2);
    cup.koWeeks = wk.slice(wk.length - koStages);
    cups.push(cup);
  }
  game.cups = cups;
  game.cupWeekDone = -1;
}

function makeRound(name, week, ties) { return { name, week, ties }; }
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
    // Fim dos grupos → monta o mata-mata
    if (cup.type === 'continental' && !cup.rounds.length && cup.groups.every(g => g.fixtures.every(r => r.every(f => f.r)))) {
      const tables = cup.groups.map(groupTable);
      const winners = tables.map(t => t[0].id), runners = tables.map(t => t[1].id);
      const ties = winners.map((w, i) => ({ h: w, a: runners[(i + 1) % runners.length] }));
      cup.rounds.push(makeRound(stageName(ties.length * 2), cup.koWeeks[0], ties));
      for (const t of tables) for (const s of t.slice(0, 2)) payPrize(game, cup, s.id, 'groups');
      if (tables.some(t => t.slice(0, 2).some(s => s.id === game.userClubId))) msgs.push(`✅ Você se classificou para o mata-mata da ${cup.name}!`);
      else if (cup.teams.includes(game.userClubId)) msgs.push(`❌ Você foi eliminado na fase de grupos da ${cup.name}.`);
    }
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
    if (cup.byes && cup.byes.length) {
      // quem passou direto entra agora
      next = shuffle(cup.byes.concat(winners));
      cup.byes = [];
    } else if (cup.type === 'national' || cup.type === 'world') next = shuffle(next);
    const idx = cup.rounds.length;
    const week = cup.type === 'continental' ? cup.koWeeks[idx] : cup.weeks[idx];
    const ties = [];
    for (let i = 0; i + 1 < next.length; i += 2) {
      // continental: mando do melhor (sorteio entre vencedores)
      ties.push(rnd() < 0.5 ? { h: next[i], a: next[i + 1] } : { h: next[i + 1], a: next[i] });
    }
    cup.rounds.push(makeRound(stageName(ties.length * 2), week, ties));
    const mine = ties.find(t => t.h === game.userClubId || t.a === game.userClubId);
    if (mine) {
      const opp = clubById(game, mine.h === game.userClubId ? mine.a : mine.h);
      msgs.push(`🎯 ${cup.name} — ${stageName(ties.length * 2)}: você enfrenta o ${opp.name} na semana ${week + 1}.`);
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
      else if (byes) status = 'Aguardando a próxima fase';
      else if (cup.groups.length) {
        const g = cup.groups.find(x => x.clubIds.includes(clubId));
        if (cup.rounds.length) status = 'Eliminado na fase de grupos';
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
