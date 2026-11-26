// =============================================================
// derbies.js — RIVALIDADES E CLÁSSICOS
// =============================================================
// Clássicos reais conhecidos (pelos nomes dos clubes no banco).
// Num clássico: estádio mais cheio, torcida mais barulhenta, a
// vitória vale mais para diretoria/torcida e a derrota dói mais.
// O retrospecto do usuário contra cada rival fica guardado.
// =============================================================
const PAIRS = [
  // Brasil
  ['Flamengo', 'Fluminense', 'Fla-Flu'], ['Flamengo', 'Vasco', 'Clássico dos Milhões'], ['Flamengo', 'Botafogo', 'Clássico da Rivalidade'],
  ['Fluminense', 'Vasco', 'Clássico dos Gigantes'], ['Botafogo', 'Vasco', 'Clássico da Amizade'], ['Botafogo', 'Fluminense', 'Clássico Vovô'],
  ['Corinthians', 'Palmeiras', 'Derby Paulista'], ['Corinthians', 'São Paulo', 'Majestoso'], ['Palmeiras', 'São Paulo', 'Choque-Rei'],
  ['Santos', 'Corinthians', 'Clássico Alvinegro'], ['Santos', 'Palmeiras', 'Clássico da Saudade'], ['Santos', 'São Paulo', 'San-São'],
  ['Grêmio', 'Internacional', 'Gre-Nal'], ['Atlético-MG', 'Cruzeiro', 'Clássico Mineiro'], ['Bahia', 'Vitória', 'Ba-Vi'],
  ['Sport', 'Náutico', 'Clássico dos Clássicos'], ['Ceará', 'Fortaleza', 'Clássico-Rei'], ['Coritiba', 'Athletico-PR', 'Atletiba'],
  ['Goiás', 'Atlético-GO', 'Clássico Goiano'], ['Ponte Preta', 'Guarani', 'Dérbi Campineiro'], ['Paysandu', 'Remo', 'Re-Pa'],
  // Argentina / Uruguai
  ['Boca Juniors', 'River Plate', 'Superclásico'], ['Racing', 'Independiente', 'Clásico de Avellaneda'],
  // Espanha
  ['Real Madrid', 'Barcelona', 'El Clásico'], ['Real Madrid', 'Atlético de Madrid', 'Derbi Madrileño'], ['Sevilla', 'Betis', 'Gran Derbi'],
  ['Barcelona', 'Espanyol Barcelona', 'Derbi Barceloní'], ['Athletic Bilbao', 'Real Sociedad', 'Derbi Basco'],
  // Inglaterra
  ['Arsenal', 'Tottenham', 'North London Derby'], ['Liverpool', 'Everton', 'Merseyside Derby'], ['Manchester United', 'Manchester City', 'Manchester Derby'],
  ['Liverpool', 'Manchester United', 'North West Derby'], ['Chelsea', 'Tottenham', 'Clássico de Londres'], ['Newcastle', 'Sunderland', 'Tyne-Wear Derby'],
  // Itália
  ['Inter de Milão', 'Milan', 'Derby della Madonnina'], ['Roma', 'Lazio', 'Derby della Capitale'], ['Juventus', 'Torino', 'Derby della Mole'],
  ['Juventus', 'Inter de Milão', "Derby d'Italia"], ['Genoa CFC', 'Sampdoria', 'Derby della Lanterna'],
  // Alemanha
  ['Borussia Dortmund', 'Schalke 04', 'Revierderby'], ['Bayern de Munique', 'Borussia Dortmund', 'Der Klassiker'], ['Hamburger SV', 'Werder Bremen', 'Nordderby'],
  // França / Portugal / Holanda / outros
  ['Lyon', 'Saint-Étienne', 'Derby du Rhône'],
  ['Benfica', 'Porto', 'O Clássico'], ['Benfica', 'Sporting', 'Derby de Lisboa'], ['Porto', 'Sporting', 'Clássico'],
  ['Ajax Amsterdam', 'Feyenoord', 'De Klassieker'], ['Ajax Amsterdam', 'PSV', 'Topper'], ['Celtic', 'Rangers', 'Old Firm'],
  ['Galatasaray', 'Fenerbahçe', 'Derbi Intercontinental'], ['Fenerbahçe', 'Beşiktaş', 'Derbi de Istambul'], ['Club Brugge', 'Anderlecht', 'Clássico Belga']
];
const KEY = (a, b) => [a, b].sort().join('|');
const MAP = new Map(PAIRS.map(([a, b, n]) => [KEY(a, b), n]));

// Nome do clássico (ou null) entre dois clubes
export function derbyName(a, b) {
  return MAP.get(KEY(a.name, b.name)) || null;
}

// Rivais de um clube (nomes)
export function rivalsOf(club) {
  return PAIRS.filter(p => p[0] === club.name || p[1] === club.name).map(p => ({ name: p[0] === club.name ? p[1] : p[0], derby: p[2] }));
}

// Retrospecto do usuário contra um rival: { w, d, l, gf, ga }
export function h2h(game, oppId) {
  game.h2h = game.h2h || {};
  return game.h2h[oppId] || { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
}
export function recordH2H(game, m) {
  const i = m.teams.findIndex(t => t.club.id === game.userClubId);
  if (i < 0 || !m.derby) return;
  const t = m.teams[i], o = m.teams[1 - i];
  game.h2h = game.h2h || {};
  const r = game.h2h[o.club.id] || (game.h2h[o.club.id] = { w: 0, d: 0, l: 0, gf: 0, ga: 0 });
  const w = m.winnerIndex();
  if (w === i) r.w++; else if (w === -1) r.d++; else r.l++;
  r.gf += t.goals; r.ga += o.goals;
  game.derbyLog = (game.derbyLog || []).slice(-30);
  game.derbyLog.push({ season: game.season, opp: o.club.id, res: w === i ? 'w' : w === -1 ? 'd' : 'l' });
}
