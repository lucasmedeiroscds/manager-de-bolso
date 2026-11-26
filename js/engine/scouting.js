// =============================================================
// scouting.js — OLHEIROS
// =============================================================
// Você envia um olheiro para uma região (país ou continente), com
// foco numa posição e num perfil (jovens promessas ou prontos para
// jogar). Toda semana ele traz até 2 relatórios de jogadores que
// combinam com o pedido, revelando o POTENCIAL real deles.
// Custa um valor por semana, conforme a região.
// =============================================================
import { rnd, pick } from '../util.js';
import { overall } from './ratings.js';
import { clubById } from './market.js';
import { addTx } from './finance.js';

export const REGIONS = ['Brasil', 'América do Sul', 'Europa', 'América do Norte', 'Ásia', 'Mundo todo'];
export const SCOUT_COST = { 'Brasil': 30000, 'América do Sul': 50000, 'Europa': 90000, 'América do Norte': 60000, 'Ásia': 60000, 'Mundo todo': 120000 };

function inRegion(game, p, region) {
  if (region === 'Mundo todo') return true;
  if (!p.clubId) return p.nat === region || region === 'Mundo todo';
  const c = clubById(game, p.clubId);
  const l = game.leagues.find(x => x.id === c.leagueId);
  if (!l) return false;
  return l.country === region || l.continent === region;
}

export function startScouting(game, { region, pos, profile, weeks }) {
  game.scout = { region, pos, profile, weeksLeft: weeks, started: game.round, reports: (game.scout && game.scout.reports) || [] };
  return { ok: true, msg: `Olheiro enviado: ${region}, ${weeks} semanas (${pos === 'ALL' ? 'todas as posições' : pos}).` };
}
export function stopScouting(game) {
  if (game.scout) game.scout.weeksLeft = 0;
}

// Roda toda semana: cobra o custo e traz relatórios
export function weeklyScouting(game) {
  const s = game.scout;
  if (!s || s.weeksLeft <= 0) return [];
  s.weeksLeft--;
  addTx(game, game.userClubId, `Olheiro (${s.region})`, -SCOUT_COST[s.region]);
  const seen = new Set(s.reports.map(r => r.id));
  const cands = Object.values(game.players).filter(p =>
    p.clubId !== game.userClubId && !seen.has(p.id) && !p.loan &&
    (s.pos === 'ALL' || p.pos === s.pos) &&
    (s.profile === 'jovens' ? p.age <= 21 : p.age >= 21 && p.age <= 29) &&
    inRegion(game, p, s.region));
  if (!cands.length) return s.weeksLeft === 0 ? ['🔭 O olheiro voltou: não achou mais ninguém com esse perfil.'] : [];
  // Prioriza bom custo-benefício: muito potencial (jovens) ou muita nota (prontos) para o valor
  const score = p => (s.profile === 'jovens' ? p.potential * 1.4 - overall(p) * 0.2 : overall(p)) - Math.log10(p.value + 1) * 3 + rnd() * 6;
  cands.sort((a, b) => score(b) - score(a));
  const found = cands.slice(0, rnd() < 0.5 ? 2 : 1);
  const msgs = [];
  for (const p of found) {
    p.scouted = true; // potencial revelado
    const note = s.profile === 'jovens'
      ? pick(['Joia rara, pode virar titular em poucas temporadas.', 'Muito talento, ainda cru.', 'Promessa: vale acompanhar de perto.'])
      : pick(['Pronto para jogar e com preço justo.', 'Experiente, resolveria uma carência do elenco.', 'Boa relação custo-benefício.']);
    s.reports.unshift({ id: p.id, season: game.season, round: game.round, note });
    msgs.push(`🔭 Relatório do olheiro: ${p.name} (${p.pos}, ${p.age} anos, potencial ${p.potential}). ${note}`);
  }
  s.reports = s.reports.slice(0, 30);
  if (s.weeksLeft === 0) msgs.push('🔭 O olheiro terminou a missão. Veja os relatórios em Mercado → Olheiros.');
  return msgs;
}
