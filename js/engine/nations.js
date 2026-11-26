// =============================================================
// nations.js — SELEÇÕES NACIONAIS e torneios de seleções
// =============================================================
// • Convocação: os 26 melhores jogadores de cada nacionalidade
//   (3 goleiros, 8 defensores, 8 meio-campistas, 7 atacantes).
// • Copa do Mundo: a cada 4 anos (2030, 2034...), 32 seleções.
// • Eurocopa e Copa América: nos anos pares entre Copas (2028, 2032...),
//   16 seleções cada.
// Formato: grupos de 4 (turno único) e mata-mata em jogo único com
// pênaltis. Os torneios acontecem nas férias, entre uma temporada e
// outra, e não mexem em cartões/suspensões dos clubes.
// =============================================================
import { shuffle, pick, rnd } from '../util.js';
import { overall, effectiveRating } from './ratings.js';
import { FORMATIONS } from './tactics.js';
import { Match } from './match.js';

// Continente, cores e sigla das seleções mais comuns
export const NATIONS = {
  'Brasil': ['América do Sul', '#f7d117', '#009739', 'BRA'], 'Argentina': ['América do Sul', '#74acdf', '#ffffff', 'ARG'],
  'Uruguai': ['América do Sul', '#5cbfeb', '#ffffff', 'URU'], 'Colômbia': ['América do Sul', '#fcd116', '#003893', 'COL'],
  'Equador': ['América do Sul', '#ffdd00', '#034ea2', 'EQU'], 'Paraguai': ['América do Sul', '#d52b1e', '#ffffff', 'PAR'],
  'Chile': ['América do Sul', '#d52b1e', '#0039a6', 'CHI'], 'Peru': ['América do Sul', '#ffffff', '#d91023', 'PER'],
  'Venezuela': ['América do Sul', '#8a1538', '#ffcc00', 'VEN'], 'Bolívia': ['América do Sul', '#007934', '#f9e300', 'BOL'],
  'México': ['América do Norte', '#006847', '#ffffff', 'MEX'], 'Estados Unidos': ['América do Norte', '#ffffff', '#002868', 'EUA'],
  'Canadá': ['América do Norte', '#d80621', '#ffffff', 'CAN'], 'Costa Rica': ['América do Norte', '#c8102e', '#002b7f', 'CRC'],
  'Panamá': ['América do Norte', '#d21034', '#ffffff', 'PAN'], 'Jamaica': ['América do Norte', '#fed100', '#009b3a', 'JAM'],
  'Honduras': ['América do Norte', '#ffffff', '#0073cf', 'HON'],
  'França': ['Europa', '#002395', '#ffffff', 'FRA'], 'Inglaterra': ['Europa', '#ffffff', '#cf081f', 'ING'],
  'Espanha': ['Europa', '#c60b1e', '#ffc400', 'ESP'], 'Alemanha': ['Europa', '#ffffff', '#000000', 'ALE'],
  'Portugal': ['Europa', '#c8102e', '#006600', 'POR'], 'Itália': ['Europa', '#0066cc', '#ffffff', 'ITA'],
  'Holanda': ['Europa', '#ff6200', '#ffffff', 'HOL'], 'Bélgica': ['Europa', '#e30613', '#000000', 'BEL'],
  'Croácia': ['Europa', '#ffffff', '#ff0000', 'CRO'], 'Dinamarca': ['Europa', '#c60c30', '#ffffff', 'DIN'],
  'Suíça': ['Europa', '#ff0000', '#ffffff', 'SUI'], 'Áustria': ['Europa', '#ed2939', '#ffffff', 'AUT'],
  'Sérvia': ['Europa', '#c6363c', '#0c4076', 'SER'], 'Polônia': ['Europa', '#ffffff', '#dc143c', 'POL'],
  'Turquia': ['Europa', '#e30a17', '#ffffff', 'TUR'], 'Noruega': ['Europa', '#ba0c2f', '#ffffff', 'NOR'],
  'Suécia': ['Europa', '#fecc02', '#006aa7', 'SUE'], 'Escócia': ['Europa', '#005eb8', '#ffffff', 'ESC'],
  'Ucrânia': ['Europa', '#ffd700', '#0057b7', 'UCR'], 'Rep. Tcheca': ['Europa', '#d7141a', '#11457e', 'TCH'],
  'Grécia': ['Europa', '#0d5eaf', '#ffffff', 'GRE'], 'Hungria': ['Europa', '#ce2939', '#477050', 'HUN'],
  'Romênia': ['Europa', '#fcd116', '#002b7f', 'ROM'], 'Eslováquia': ['Europa', '#ffffff', '#0b4ea2', 'SVK'],
  'Eslovênia': ['Europa', '#ffffff', '#005da4', 'SVN'], 'Geórgia': ['Europa', '#ffffff', '#ff0000', 'GEO'],
  'País de Gales': ['Europa', '#c8102e', '#00b140', 'GAL'], 'Irlanda': ['Europa', '#169b62', '#ffffff', 'IRL'],
  'Rússia': ['Europa', '#ffffff', '#0039a6', 'RUS'], 'Bósnia': ['Europa', '#002395', '#fecb00', 'BOS'],
  'Albânia': ['Europa', '#e41e20', '#000000', 'ALB'], 'Islândia': ['Europa', '#02529c', '#dc1e35', 'ISL'],
  'Finlândia': ['Europa', '#ffffff', '#003580', 'FIN'], 'Bulgária': ['Europa', '#ffffff', '#00966e', 'BUL'],
  'Marrocos': ['África', '#c1272d', '#006233', 'MAR'], 'Senegal': ['África', '#ffffff', '#00853f', 'SEN'],
  'Nigéria': ['África', '#008751', '#ffffff', 'NGA'], 'Costa do Marfim': ['África', '#ff8200', '#ffffff', 'CIV'],
  'Gana': ['África', '#ffffff', '#ce1126', 'GAN'], 'Camarões': ['África', '#007a5e', '#ce1126', 'CMR'],
  'Egito': ['África', '#ce1126', '#ffffff', 'EGI'], 'Argélia': ['África', '#ffffff', '#006233', 'ARL'],
  'Tunísia': ['África', '#e70013', '#ffffff', 'TUN'], 'Mali': ['África', '#14b53a', '#fcd116', 'MLI'],
  'Japão': ['Ásia', '#000555', '#ffffff', 'JAP'], 'Coreia do Sul': ['Ásia', '#c60c30', '#ffffff', 'COR'],
  'Arábia Saudita': ['Ásia', '#006c35', '#ffffff', 'ARS'], 'Irã': ['Ásia', '#ffffff', '#239f40', 'IRA'],
  'Austrália': ['Ásia', '#ffcd00', '#00843d', 'AUS'], 'Catar': ['Ásia', '#8a1538', '#ffffff', 'CAT']
};
export const natInfo = n => NATIONS[n] || ['Outros', '#888888', '#333333', n.slice(0, 3).toUpperCase()];

const QUOTA = { GOL: 3, DEF: 8, MID: 8, ATA: 7 };
const GROUP = p => p.pos === 'GOL' ? 'GOL' : p.pos === 'ZAG' || p.pos === 'LAT' ? 'DEF' : p.pos === 'ATA' ? 'ATA' : 'MID';

// Convocação de uma seleção (26 jogadores ativos da nacionalidade)
// pool (opcional): jogadores daquela nacionalidade já separados (mais rápido)
export function callUp(game, nat, pool) {
  pool = (pool || Object.values(game.players).filter(p => p.nat === nat && p.clubId))
    .filter(p => p.injury <= 1).sort((a, b) => overall(b) - overall(a));
  const out = [], used = new Set(), count = { GOL: 0, DEF: 0, MID: 0, ATA: 0 };
  for (const p of pool) {
    const g = GROUP(p);
    if (count[g] < QUOTA[g]) { out.push(p); used.add(p.id); count[g]++; }
    if (out.length >= 26) break;
  }
  // completa se faltar alguma posição
  for (const p of pool) { if (out.length >= 26) break; if (!used.has(p.id)) { out.push(p); used.add(p.id); } }
  return out;
}

// Força da seleção: média dos 11 melhores convocados
export function nationStrength(squad) {
  const top = squad.map(p => overall(p)).sort((a, b) => b - a).slice(0, 11);
  return top.length < 11 ? 0 : top.reduce((s, v) => s + v, 0) / 11;
}

// Ranking de seleções (todas com pelo menos 18 jogadores ativos)
export function nationRanking(game) {
  // agrupa os jogadores ativos por nacionalidade uma única vez
  const byNat = {};
  for (const p of Object.values(game.players)) if (p.clubId && p.nat) (byNat[p.nat] = byNat[p.nat] || []).push(p);
  const out = [];
  for (const nat in byNat) {
    if (byNat[nat].length < 18) continue;
    const sq = callUp(game, nat, byNat[nat]);
    if (sq.length < 18 || !sq.some(p => p.pos === 'GOL')) continue;
    out.push({ nat, squad: sq, str: nationStrength(sq), cont: natInfo(nat)[0] });
  }
  return out.sort((a, b) => b.str - a.str);
}

// "Clube" temporário da seleção, para o motor de partidas
function nationClub(nat, squad) {
  const [, c1, c2, short] = natInfo(nat);
  const formation = '4-3-3';
  const slots = FORMATIONS[formation];
  const used = new Set();
  const lineup = slots.map(slot => {
    const best = squad.filter(p => !used.has(p.id)).sort((a, b) => effectiveRating(b, slot) - effectiveRating(a, slot))[0];
    if (best) used.add(best.id);
    return best ? best.id : null;
  });
  const bench = squad.filter(p => !used.has(p.id)).sort((a, b) => overall(b) - overall(a)).slice(0, 9).map(p => p.id);
  return { id: 'NAT-' + nat, name: nat, short, colors: [c1, c2], formation, style: 'Equilibrado', marking: 'Média', focus: 'Geral',
    lineup, bench, stadium: 60000, ticketPrice: 0, rep: 80, isNation: true };
}

// Joga uma partida de seleções sem efeitos colaterais nos clubes
function playNational(game, A, B, knockout) {
  const ids = [...A.squad, ...B.squad].map(p => p.id);
  const saved = ids.map(id => [id, game.players[id].fitness, game.players[id].moral]);
  for (const p of [...A.squad, ...B.squad]) p.fitness = 100;
  const m = new Match(game, A.club, B.club, { knockout, neutral: true, competition: 'nations' });
  m.runToEnd();
  // devolve energia/moral e limpa marcas temporárias (sem lesões/cartões nos clubes)
  for (const [id, f, mo] of saved) { const p = game.players[id]; p.fitness = f; p.moral = mo; delete p._red; delete p._injury; }
  const [h, a] = m.teams;
  return {
    h: A.nat, a: B.nat, hg: h.goals, ag: a.goals, pens: m.pens,
    winner: m.winnerIndex() === 0 ? A.nat : m.winnerIndex() === 1 ? B.nat : null,
    scorers: [h.scorers.map(s => s.id), a.scorers.map(s => s.id)], ratings: m.ratings || {}
  };
}

const STAGE = { 2: 'Final', 4: 'Semifinal', 8: 'Quartas de final', 16: 'Oitavas de final' };

// Roda um torneio completo. def: { id, name, size, conts (filtro) }
export function runTournament(game, def, year) {
  const all = nationRanking(game);
  let ranking = all;
  if (def.conts) {
    ranking = all.filter(n => def.conts.includes(n.cont)).concat(def.guests ? all.filter(n => def.guests.includes(n.nat)) : []);
    // faltou seleção? completa com convidados (melhores de fora da Europa)
    for (const n of all) {
      if (ranking.length >= def.size) break;
      if (!ranking.includes(n) && n.cont !== 'Europa') ranking.push(n);
    }
  }
  const teams = ranking.slice(0, def.size);
  if (teams.length < 8) return null;
  const size = teams.length >= 32 ? 32 : teams.length >= 16 ? 16 : 8;
  const field = teams.slice(0, size).map(t => ({ ...t, club: nationClub(t.nat, t.squad) }));
  // potes por força
  const nG = size / 4;
  const pots = [0, 1, 2, 3].map(k => field.slice(k * nG, (k + 1) * nG));
  const groups = Array.from({ length: nG }, (_, i) => ({ name: String.fromCharCode(65 + i), teams: [], games: [] }));
  for (const pot of pots) shuffle(pot).forEach((t, i) => groups[i].teams.push(t));
  const goals = {}, ratingSum = {}, ratingN = {};
  const track = r => {
    r.scorers.flat().forEach(id => { goals[id] = (goals[id] || 0) + 1; });
    for (const [id, v] of Object.entries(r.ratings)) { ratingSum[id] = (ratingSum[id] || 0) + v; ratingN[id] = (ratingN[id] || 0) + 1; }
  };
  // fase de grupos (turno único)
  for (const g of groups) {
    const T = g.teams;
    for (const [i, j] of [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]]) {
      const r = playNational(game, T[i], T[j], false);
      g.games.push(r); track(r);
    }
    const tab = Object.fromEntries(T.map(t => [t.nat, { nat: t.nat, pts: 0, gp: 0, gc: 0, j: 0 }]));
    for (const r of g.games) {
      const H = tab[r.h], A = tab[r.a];
      H.j++; A.j++; H.gp += r.hg; H.gc += r.ag; A.gp += r.ag; A.gc += r.hg;
      if (r.hg > r.ag) H.pts += 3; else if (r.hg < r.ag) A.pts += 3; else { H.pts++; A.pts++; }
    }
    g.table = Object.values(tab).sort((x, y) => y.pts - x.pts || (y.gp - y.gc) - (x.gp - x.gc) || y.gp - x.gp);
  }
  // mata-mata: 1º de um grupo x 2º do vizinho
  const byNat = Object.fromEntries(field.map(t => [t.nat, t]));
  let alive = [];
  groups.forEach((g, i) => alive.push(g.table[0].nat, groups[(i % 2 === 0 ? i + 1 : i - 1)].table[1].nat));
  const rounds = [];
  while (alive.length > 1) {
    const ties = [];
    for (let i = 0; i + 1 < alive.length; i += 2) {
      const r = playNational(game, byNat[alive[i]], byNat[alive[i + 1]], true);
      ties.push(r); track(r);
    }
    rounds.push({ name: STAGE[alive.length] || `Fase de ${alive.length}`, ties });
    alive = ties.map(t => t.winner);
  }
  const champion = alive[0];
  const final = rounds[rounds.length - 1].ties[0];
  const runnerUp = final.winner === final.h ? final.a : final.h;
  // artilheiro e craque do torneio
  const pName = id => game.players[id] ? game.players[id].name : '?';
  const topScorers = Object.entries(goals).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([id, g]) => ({ id, name: pName(id), nat: game.players[id] && game.players[id].nat, g }));
  const best = Object.keys(ratingSum).filter(id => ratingN[id] >= 4)
    .map(id => ({ id, avg: ratingSum[id] / ratingN[id] + (goals[id] || 0) * 0.05 + (byNat[game.players[id].nat] && game.players[id].nat === champion ? 0.25 : 0) }))
    .sort((a, b) => b.avg - a.avg)[0];
  // premia e mexe na moral dos campeões
  for (const p of byNat[champion].squad) {
    p.moral = Math.min(100, p.moral + 12);
    (p.trophies = p.trophies || []).push(`🌍 ${def.name} ${year} (${champion})`);
  }
  if (best && game.players[best.id]) (game.players[best.id].trophies = game.players[best.id].trophies || []).push(`⭐ Craque da ${def.name} ${year}`);
  const userCalled = field.flatMap(t => t.squad.filter(p => p.clubId === game.userClubId).map(p => ({ id: p.id, name: p.name, nat: t.nat })));
  return {
    id: def.id, name: def.name, year, champion, runnerUp,
    groups: groups.map(g => ({ name: g.name, table: g.table, games: g.games.map(({ ratings, ...r }) => r) })),
    rounds: rounds.map(r => ({ name: r.name, ties: r.ties.map(({ ratings, ...t }) => t) })),
    topScorers, best: best ? { id: best.id, name: pName(best.id), nat: game.players[best.id].nat, avg: Math.round(best.avg * 100) / 100 } : null,
    teams: field.map(t => ({ nat: t.nat, str: Math.round(t.str) })), userCalled
  };
}

// Calendário: quais torneios acontecem nas férias depois da temporada "season"
export function tournamentsAfter(season) {
  const year = season + 1;
  if (year % 4 === 2) return [{ id: 'WC', name: 'Copa do Mundo', size: 32 }];
  if (year % 4 === 0) return [
    { id: 'EURO', name: 'Eurocopa', size: 16, conts: ['Europa'] },
    { id: 'CA', name: 'Copa América', size: 16, conts: ['América do Sul'], guests: ['México', 'Estados Unidos', 'Canadá', 'Costa Rica', 'Panamá', 'Jamaica'] }
  ];
  return [];
}
