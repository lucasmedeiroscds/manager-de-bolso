// =============================================================
// importer.js — BANCO DE DADOS EDITÁVEL (importar / exportar)
// =============================================================
// Formatos aceitos:
//  • JSON: { "name": "...", "clubs": [...], "players": [...] }
//  • CSV de jogadores (abre no Excel/Google Planilhas), uma linha por jogador:
//      nome;clube;posicao;idade;finalizacao;passe;defesa;forca;resistencia;goleiro;potencial
//    Os clubes são criados automaticamente a partir da coluna "clube".
//    Separador pode ser ponto e vírgula (Excel em português) ou vírgula.
// =============================================================
import { overall, marketValue, wageDemand, POSITIONS } from '../engine/ratings.js';
import { clamp } from '../util.js';
import { expandWorld } from './world.js';

const CSV_HEADER = ['nome', 'clube', 'posicao', 'idade', 'finalizacao', 'passe', 'defesa', 'forca', 'resistencia', 'goleiro', 'potencial'];
const ATTR_MAP = { finalizacao: 'fin', passe: 'pas', defesa: 'def', forca: 'for', resistencia: 'res', goleiro: 'gk' };

// Aceita nomes de posição comuns e converte para as 6 do jogo
const POS_ALIASES = {
  GOL: 'GOL', GK: 'GOL', GOLEIRO: 'GOL',
  ZAG: 'ZAG', CB: 'ZAG', ZAGUEIRO: 'ZAG',
  LAT: 'LAT', LD: 'LAT', LE: 'LAT', RB: 'LAT', LB: 'LAT', LATERAL: 'LAT', ALA: 'LAT', RWB: 'LAT', LWB: 'LAT',
  VOL: 'VOL', CDM: 'VOL', DM: 'VOL', VOLANTE: 'VOL',
  MEI: 'MEI', CM: 'MEI', CAM: 'MEI', AM: 'MEI', MC: 'MEI', MEIA: 'MEI', RM: 'MEI', LM: 'MEI',
  ATA: 'ATA', ST: 'ATA', CF: 'ATA', FW: 'ATA', ATACANTE: 'ATA', PD: 'ATA', PE: 'ATA', RW: 'ATA', LW: 'ATA', CA: 'ATA'
};

function normPos(s) {
  const k = String(s || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return POS_ALIASES[k] || null;
}

// Completa e valida um jogador vindo de arquivo
function normalizePlayer(raw, id, clubId) {
  const attrs = {};
  for (const k of ['fin', 'pas', 'def', 'for', 'res', 'gk']) {
    const v = Number(raw.attrs ? raw.attrs[k] : raw[k]);
    attrs[k] = clamp(Number.isFinite(v) ? Math.round(v) : 40, 1, 99);
  }
  const pos = normPos(raw.pos) || 'MEI';
  const p = {
    id, name: String(raw.name || 'Sem nome').slice(0, 40), pos,
    age: clamp(Math.round(Number(raw.age) || 25), 15, 45),
    clubId, attrs,
    potential: 0, moral: 60, fitness: 100, injury: 0, yellow: 0, suspended: 0,
    goals: 0, assists: 0, apps: 0, seasonGoals: 0,
    contract: { wage: 0, years: clamp(Number(raw.contract && raw.contract.years) || 2, 0, 6) },
    loan: null, listed: false, fictional: !!raw.fictional
  };
  const ovr = overall(p);
  p.potential = clamp(Math.round(Number(raw.potential) || ovr + (p.age <= 21 ? 10 : p.age <= 24 ? 4 : 0)), ovr, 99);
  p.contract.wage = Number(raw.contract && raw.contract.wage) || wageDemand(p);
  if (!clubId) p.contract.years = 0;
  p.value = marketValue(p);
  return p;
}

function normalizeClub(raw, id, avgOvr) {
  const rep = clamp(Math.round(Number(raw.rep) || (avgOvr ? (avgOvr - 49) / 0.32 : 60)), 20, 99);
  return {
    id, name: String(raw.name).slice(0, 40),
    short: String(raw.short || raw.name.replace(/[^A-Za-zÀ-ú ]/g, '').split(' ').filter(w => w.length > 2).map(w => w[0]).join('').slice(0, 3) || raw.name.slice(0, 3)).toUpperCase().slice(0, 4),
    colors: Array.isArray(raw.colors) && raw.colors.length >= 2 ? raw.colors.slice(0, 2) : ['#ffffff', '#333333'],
    rep,
    stadium: Number(raw.stadium) || Math.round(15000 + rep * 450),
    fans: 0, ticketPrice: 0, sponsor: 0, budget: 0,
    formation: '4-4-2', style: 'Equilibrado', lineup: [], bench: [],
    training: { focus: 'Equilibrado', intensity: 'Normal' },
    fictional: !!raw.fictional
  };
}

function fillClubEconomy(c, raw = {}) {
  c.fans = Number(raw.fans) || Math.round(c.stadium * (1.4 + c.rep / 100));
  c.ticketPrice = Number(raw.ticketPrice) || Math.round(30 + c.rep * 0.5);
  c.sponsor = Number(raw.sponsor) || Math.round(c.rep * c.rep * 30 / 1000) * 1000;
  c.budget = Number(raw.budget) || Math.round(c.rep ** 3 * 60 / 100000) * 100000;
}

// ---------- JSON ----------
export function importJSON(text) {
  const d = JSON.parse(text);
  if (d.format === 'mundo-compacto-1') return expandWorld(d); // mesmo formato do data/mundo.json
  if (!Array.isArray(d.clubs) || !(Array.isArray(d.players) || typeof d.players === 'object'))
    throw new Error('O JSON precisa ter "clubs" (lista) e "players".');
  const rawPlayers = Array.isArray(d.players) ? d.players : Object.values(d.players);
  const clubs = [];
  const idMap = {};
  d.clubs.forEach((rc, i) => {
    const id = 'c' + (i + 1);
    idMap[rc.id || rc.name] = id;
    idMap[rc.name] = id;
    if (rc.short) idMap[rc.short] = id;
    clubs.push(normalizeClub(rc, id));
  });
  const players = {};
  rawPlayers.forEach((rp, i) => {
    const cid = rp.clubId != null ? idMap[rp.clubId] : (rp.club ? idMap[rp.club] : null);
    const p = normalizePlayer(rp, 'p' + (i + 1), cid || null);
    players[p.id] = p;
  });
  d.clubs.forEach((rc, i) => fillClubEconomy(clubs[i], rc));
  // Ligas (opcional): { id, name, country, continent, clubIds: [...] }
  let leagues = null;
  if (Array.isArray(d.leagues) && d.leagues.length) {
    leagues = d.leagues.map((l, i) => ({
      id: String(l.id || 'L' + (i + 1)), name: String(l.name || 'Liga ' + (i + 1)),
      country: String(l.country || ''), continent: String(l.continent || 'Outros'),
      clubIds: (l.clubIds || []).map(x => idMap[x]).filter(Boolean)
    })).filter(l => l.clubIds.length >= 4);
  }
  return validate({ name: d.name || 'Banco importado', fictional: !!d.fictional, source: d.source || '', leagues, clubs, players });
}

// Exporta no mesmo formato que o jogo lê (com ligas, países e continentes)
export function exportJSON(db) {
  return JSON.stringify({
    name: db.name, fictional: !!db.fictional, source: db.source || '',
    leagues: (db.leagues || []).map(l => ({ id: l.id, name: l.name, country: l.country, continent: l.continent, clubIds: l.clubIds })),
    clubs: db.clubs.map(c => ({ id: c.id, name: c.name, short: c.short, colors: c.colors, rep: c.rep, stadium: c.stadium, stadiumName: c.stadiumName, fans: c.fans, ticketPrice: c.ticketPrice, sponsor: c.sponsor, budget: c.budget })),
    players: Object.values(db.players).map(p => ({ name: p.name, clubId: p.clubId, pos: p.pos, age: p.age, nat: p.nat, attrs: p.attrs, potential: p.potential, contract: p.contract }))
  });
}

// ---------- CSV ----------
function splitCSVLine(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function importCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV vazio.');
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = splitCSVLine(lines[0], sep).map(h => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const col = n => head.indexOf(n);
  for (const need of ['nome', 'clube', 'posicao']) if (col(need) < 0) throw new Error(`Coluna "${need}" não encontrada. Cabeçalho esperado: ${CSV_HEADER.join(sep)}`);

  const rows = lines.slice(1).map(l => splitCSVLine(l, sep));
  const clubNames = [...new Set(rows.map(r => r[col('clube')]).filter(Boolean))];
  const clubs = [];
  const idByName = {};
  const players = {};
  const errors = [];
  rows.forEach((r, i) => {
    const raw = { name: r[col('nome')], pos: r[col('posicao')], age: r[col('idade')], potential: col('potencial') >= 0 ? r[col('potencial')] : null };
    for (const k in ATTR_MAP) if (col(k) >= 0) raw[ATTR_MAP[k]] = r[col(k)];
    if (!raw.name) return;
    if (!normPos(raw.pos)) errors.push(`Linha ${i + 2}: posição "${raw.pos}" desconhecida (usei MEI).`);
    const cname = r[col('clube')];
    const p = normalizePlayer(raw, 'p' + (i + 1), cname || null);
    players[p.id] = p;
  });
  // Cria clubes com reputação estimada pela força do elenco
  clubNames.forEach((name, i) => {
    const id = 'c' + (i + 1);
    idByName[name] = id;
    const squad = Object.values(players).filter(p => p.clubId === name).map(p => overall(p)).sort((a, b) => b - a).slice(0, 14);
    const avg = squad.reduce((s, v) => s + v, 0) / (squad.length || 1);
    const c = normalizeClub({ name }, id, avg);
    fillClubEconomy(c);
    clubs.push(c);
  });
  for (const p of Object.values(players)) p.clubId = p.clubId ? idByName[p.clubId] : null;
  // Ligas: colunas opcionais "liga", "pais" e "continente". Sem elas, uma liga só.
  let leagues = null;
  if (col('liga') >= 0) {
    const byLeague = {};
    rows.forEach(r => {
      const cname = r[col('clube')], lname = r[col('liga')];
      if (!cname || !lname) return;
      const l = byLeague[lname] = byLeague[lname] || { id: 'L' + (Object.keys(byLeague).length + 1), name: lname,
        country: col('pais') >= 0 ? r[col('pais')] : '', continent: col('continente') >= 0 ? (r[col('continente')] || 'Outros') : 'Outros', clubIds: [] };
      const id = idByName[cname];
      if (id && !l.clubIds.includes(id)) l.clubIds.push(id);
    });
    leagues = Object.values(byLeague);
  }
  const db = validate({ name: 'Banco importado (CSV)', fictional: false, leagues, clubs, players });
  db.warnings = errors.slice(0, 10);
  return db;
}

export function exportCSV(db) {
  const sep = ';';
  const clubName = Object.fromEntries(db.clubs.map(c => [c.id, c.name]));
  const leagueOf = {};
  for (const l of db.leagues || []) for (const id of l.clubIds) leagueOf[id] = l;
  const lines = [CSV_HEADER.concat(['liga', 'pais', 'continente']).join(sep)];
  for (const p of Object.values(db.players)) {
    const a = p.attrs;
    const l = p.clubId ? leagueOf[p.clubId] : null;
    lines.push([p.name, p.clubId ? clubName[p.clubId] : '', p.pos, p.age, a.fin, a.pas, a.def, a.for, a.res, a.gk, p.potential,
      l ? l.name : '', l ? l.country : '', l ? l.continent : '']
      .map(v => /[;",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(sep));
  }
  return '﻿' + lines.join('\r\n'); // BOM: o Excel reconhece os acentos
}

// Confere se o banco dá para jogar
// (elencos curtos são completados pela IA com jogadores fictícios)
function validate(db) {
  if (db.clubs.length < 4) throw new Error('O banco precisa de pelo menos 4 clubes.');
  if (!db.leagues && db.clubs.length > 40) throw new Error('Sem a coluna/campo "liga", o máximo é 40 clubes.');
  for (const l of db.leagues || []) if (l.clubIds.length > 40) throw new Error(`A liga ${l.name} tem mais de 40 clubes.`);
  for (const c of db.clubs) {
    const sq = Object.values(db.players).filter(p => p.clubId === c.id);
    if (sq.length < 11) throw new Error(`${c.name} tem só ${sq.length} jogadores (mínimo 11).`);
  }
  return db;
}

export { POSITIONS };
