// =============================================================
// world.js — carrega o banco "mundo real" (data/mundo.json)
// =============================================================
// O arquivo vem compacto (ver ferramentas/converter-transfermarkt.js).
// Aqui cada jogador é expandido para o formato completo do jogo.
// =============================================================
import { marketValue, wageDemand } from '../engine/ratings.js';
import { addSecondDivisions } from '../engine/divisions.js';

export function expandPlayer(a) {
  const [id, name, pos, age, clubId, fin, pas, def, forc, res, gk, potential, years, nat, realValueEUR] = a;
  const p = {
    id, name, pos, age, clubId, attrs: { fin, pas, def, for: forc, res, gk },
    nat, potential, moral: 60, fitness: 100, injury: 0, yellow: 0, suspended: 0,
    goals: 0, assists: 0, apps: 0, seasonGoals: 0,
    contract: { wage: 0, years }, loan: null, listed: false, realValueEUR
  };
  p.contract.wage = wageDemand(p);
  p.value = marketValue(p);
  return p;
}

// Converte o JSON (compacto ou normal) num banco pronto para createGame
export function expandWorld(d) {
  if (d.format !== 'mundo-compacto-1') return d;
  const players = {};
  for (const a of d.players) { const p = expandPlayer(a); players[p.id] = p; }
  return { ...d, players, format: undefined };
}

export async function loadWorld() {
  const r = await fetch('data/mundo.json');
  if (!r.ok) throw new Error('Não foi possível carregar data/mundo.json');
  const db = expandWorld(await r.json());
  // 2ªs divisões já no banco: assim dá para escolher um clube da Série B
  db.nextPlayerId = 1; db.season = 2026;
  addSecondDivisions(db);
  return db;
}
