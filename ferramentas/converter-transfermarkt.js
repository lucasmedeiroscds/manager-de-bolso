// =============================================================
// converter-transfermarkt.js
// Converte a base aberta do Transfermarkt (licença CC0, projeto
// github.com/dcaribou/transfermarkt-datasets) no banco do jogo:
//   data/mundo.json  → continentes, países, ligas, clubes, jogadores
//
// Uso: node ferramentas/converter-transfermarkt.js dados-origem/transfermarkt data/mundo.json
//
// COMO OS ATRIBUTOS SÃO CALCULADOS (a base não tem atributos técnicos):
//  1. Overall vem do VALOR DE MERCADO real (escala logarítmica):
//       €100 mil ≈ 50 · €1 mi ≈ 63 · €10 mi ≈ 76 · €50 mi ≈ 85 · €150 mi ≈ 91
//  2. Ajuste por idade: jovem vale pelo potencial (desconta), veterano
//     vale menos do que joga (acrescenta).
//  3. Os atributos (finalização, passe, defesa...) são distribuídos
//     pelo perfil da posição real, com pequena variação fixa por jogador.
//  ⇒ São ESTIMATIVAS. O jogador pode corrigir qualquer um no jogo.
// =============================================================
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { seededRandom, clamp } from '../js/util.js';
import { overall, wageDemand, marketValue } from '../js/engine/ratings.js';

const [srcDir, outFile] = process.argv.slice(2);
if (!srcDir || !outFile) { console.log('Uso: node ferramentas/converter-transfermarkt.js <pasta-origem> <saida.json>'); process.exit(1); }

// ---------- Leitura de CSV (com aspas) ----------
function readCSV(name) {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(srcDir, name))).toString('utf8');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// ---------- Nomes em português ----------
const LEAGUES = {
  BRA1: ['Brasileirão Série A', 'Brasil'], ARG1: ['Liga Profesional (Argentina)', 'Argentina'],
  MEX1: ['Liga MX', 'México'], MLS1: ['MLS', 'Estados Unidos'],
  GB1: ['Premier League', 'Inglaterra'], ES1: ['LaLiga', 'Espanha'], IT1: ['Serie A (Itália)', 'Itália'],
  L1: ['Bundesliga', 'Alemanha'], FR1: ['Ligue 1', 'França'], PO1: ['Liga Portugal', 'Portugal'],
  NL1: ['Eredivisie', 'Holanda'], BE1: ['Pro League (Bélgica)', 'Bélgica'], TR1: ['Süper Lig', 'Turquia'],
  SC1: ['Scottish Premiership', 'Escócia'], GR1: ['Super League (Grécia)', 'Grécia'],
  RU1: ['Premier Liga (Rússia)', 'Rússia'], UKR1: ['Premier Liga (Ucrânia)', 'Ucrânia'],
  A1: ['Bundesliga (Áustria)', 'Áustria'], C1: ['Super League (Suíça)', 'Suíça'],
  DK1: ['Superliga (Dinamarca)', 'Dinamarca'], NO1: ['Eliteserien', 'Noruega'], SE1: ['Allsvenskan', 'Suécia'],
  PL1: ['Ekstraklasa', 'Polônia'], TS1: ['Chance Liga', 'Rep. Tcheca'], KR1: ['HNL (Croácia)', 'Croácia'],
  SER1: ['Superliga (Sérvia)', 'Sérvia'], RO1: ['Superliga (Romênia)', 'Romênia'],
  JAP1: ['J1 League', 'Japão'], RSK1: ['K League 1', 'Coreia do Sul'], SA1: ['Saudi Pro League', 'Arábia Saudita'],
  AUS1: ['A-League', 'Austrália']
};
const CONTINENT = {
  'Brasil': 'América do Sul', 'Argentina': 'América do Sul',
  'México': 'América do Norte', 'Estados Unidos': 'América do Norte',
  'Japão': 'Ásia', 'Coreia do Sul': 'Ásia', 'Arábia Saudita': 'Ásia', 'Austrália': 'Oceania'
};
const continentOf = c => CONTINENT[c] || 'Europa';

// Nacionalidades em português (as que faltarem ficam como na base)
const NAT_PT = {
  'Brazil': 'Brasil', 'Spain': 'Espanha', 'England': 'Inglaterra', 'France': 'França', 'Germany': 'Alemanha',
  'Italy': 'Itália', 'Netherlands': 'Holanda', 'Belgium': 'Bélgica', 'Uruguay': 'Uruguai', 'Colombia': 'Colômbia',
  'United States': 'Estados Unidos', 'Mexico': 'México', 'Japan': 'Japão', 'Korea, South': 'Coreia do Sul',
  'Croatia': 'Croácia', 'Serbia': 'Sérvia', 'Norway': 'Noruega', 'Denmark': 'Dinamarca', 'Sweden': 'Suécia',
  'Poland': 'Polônia', 'Switzerland': 'Suíça', 'Austria': 'Áustria', 'Türkiye': 'Turquia', 'Turkey': 'Turquia',
  'Morocco': 'Marrocos', 'Nigeria': 'Nigéria', 'Ghana': 'Gana', "Cote d'Ivoire": 'Costa do Marfim', 'Ivory Coast': 'Costa do Marfim',
  'Cameroon': 'Camarões', 'Egypt': 'Egito', 'Algeria': 'Argélia', 'Ecuador': 'Equador', 'Paraguay': 'Paraguai',
  'Scotland': 'Escócia', 'Wales': 'País de Gales', 'Ireland': 'Irlanda', 'Northern Ireland': 'Irlanda do Norte',
  'Greece': 'Grécia', 'Russia': 'Rússia', 'Ukraine': 'Ucrânia', 'Czech Republic': 'Rep. Tcheca', 'Romania': 'Romênia',
  'Saudi Arabia': 'Arábia Saudita', 'Australia': 'Austrália', 'Canada': 'Canadá', 'Georgia': 'Geórgia', 'Hungary': 'Hungria',
  'Slovenia': 'Eslovênia', 'Slovakia': 'Eslováquia', 'Bosnia-Herzegovina': 'Bósnia', 'Albania': 'Albânia', 'Iceland': 'Islândia',
  'Finland': 'Finlândia', 'Tunisia': 'Tunísia', 'Mali': 'Mali', 'Senegal': 'Senegal', 'Guinea': 'Guiné', 'DR Congo': 'RD Congo',
  'South Africa': 'África do Sul', 'Venezuela': 'Venezuela', 'Chile': 'Chile', 'Peru': 'Peru', 'Bolivia': 'Bolívia',
  'Costa Rica': 'Costa Rica', 'Honduras': 'Honduras', 'Panama': 'Panamá', 'Jamaica': 'Jamaica', 'China': 'China',
  'Iran': 'Irã', 'Iraq': 'Iraque', 'North Macedonia': 'Macedônia do Norte', 'Montenegro': 'Montenegro', 'Bulgaria': 'Bulgária',
  'Israel': 'Israel', 'Cape Verde': 'Cabo Verde', 'Angola': 'Angola', 'Mozambique': 'Moçambique', 'New Zealand': 'Nova Zelândia'
};

// Nomes curtos, siglas e cores (conhecimento público). Os demais clubes
// recebem nome encurtado automaticamente e cores geradas pelo nome.
const CLUB_OVERRIDE = {
  'Esporte Clube Bahia': ['Bahia', 'BAH', '#0057a8', '#e30613'],
  'Sociedade Esportiva Palmeiras': ['Palmeiras', 'PAL', '#006437', '#ffffff'],
  'Clube do Remo': ['Remo', 'REM', '#1b2a56', '#ffffff'],
  'Associação Chapecoense de Futebol': ['Chapecoense', 'CHA', '#00843d', '#ffffff'],
  'Sport Club Corinthians Paulista': ['Corinthians', 'COR', '#111111', '#ffffff'],
  'Grêmio Foot-Ball Porto Alegrense': ['Grêmio', 'GRE', '#0d80bf', '#111111'],
  'Esporte Clube Vitória': ['Vitória', 'VIT', '#d71920', '#111111'],
  'Santos Futebol Clube': ['Santos', 'SAN', '#ffffff', '#111111'],
  'Fluminense Football Club': ['Fluminense', 'FLU', '#7a1e3a', '#00613c'],
  'Clube Atlético Mineiro': ['Atlético-MG', 'CAM', '#111111', '#ffffff'],
  'Mirasol Futebol Clube': ['Mirassol', 'MIR', '#f6d500', '#006b3f'],
  'S. A. F. Botafogo': ['Botafogo', 'BOT', '#111111', '#ffffff'],
  'São Paulo Futebol Clube': ['São Paulo', 'SAO', '#e30613', '#111111'],
  'Cruzeiro Esporte Clube': ['Cruzeiro', 'CRU', '#003da5', '#ffffff'],
  'Clube de Regatas do Flamengo': ['Flamengo', 'FLA', '#c4161c', '#111111'],
  'Sport Club Internacional': ['Internacional', 'INT', '#e30613', '#ffffff'],
  'Clube Atlético Paranaense': ['Athletico-PR', 'CAP', '#c8102e', '#111111'],
  'Coritiba Foot Ball Club': ['Coritiba', 'CFC', '#00613c', '#ffffff'],
  'Red Bull Bragantino': ['Bragantino', 'RBB', '#ffffff', '#d50032'],
  'Club de Regatas Vasco da Gama': ['Vasco', 'VAS', '#111111', '#ffffff'],
  'Arsenal FC': ['Arsenal', 'ARS', '#ef0107', '#ffffff'], 'Chelsea FC': ['Chelsea', 'CHE', '#034694', '#ffffff'],
  'Liverpool FC': ['Liverpool', 'LIV', '#c8102e', '#ffffff'], 'Manchester City': ['Manchester City', 'MCI', '#6cabdd', '#ffffff'],
  'Manchester United': ['Manchester United', 'MUN', '#da291c', '#111111'], 'Tottenham Hotspur': ['Tottenham', 'TOT', '#ffffff', '#132257'],
  'Newcastle United': ['Newcastle', 'NEW', '#111111', '#ffffff'], 'Aston Villa': ['Aston Villa', 'AVL', '#670e36', '#95bfe5'],
  'Everton FC': ['Everton', 'EVE', '#003399', '#ffffff'], 'West Ham United': ['West Ham', 'WHU', '#7a263a', '#1bb1e7'],
  'Real Madrid Club de Fútbol': ['Real Madrid', 'RMA', '#ffffff', '#febe10'], 'Futbol Club Barcelona': ['Barcelona', 'BAR', '#a50044', '#004d98'],
  'Club Atlético de Madrid S.A.D.': ['Atlético de Madrid', 'ATM', '#cb3524', '#ffffff'],
  'Inter Milan': ['Inter de Milão', 'INT', '#0068a8', '#111111'], 'AC Milan': ['Milan', 'MIL', '#fb090b', '#111111'],
  'Juventus FC': ['Juventus', 'JUV', '#111111', '#ffffff'], 'SSC Napoli': ['Napoli', 'NAP', '#12a0d7', '#ffffff'],
  'Associazione Sportiva Roma': ['Roma', 'ROM', '#8e1f2f', '#f0bc42'], 'Società Sportiva Lazio S.p.A.': ['Lazio', 'LAZ', '#87d8f7', '#ffffff'],
  'FC Bayern München': ['Bayern de Munique', 'BAY', '#dc052d', '#ffffff'], 'Borussia Dortmund': ['Borussia Dortmund', 'BVB', '#fde100', '#111111'],
  'Paris Saint-Germain Football Club': ['Paris Saint-Germain', 'PSG', '#004170', '#da291c'],
  'Sport Lisboa e Benfica': ['Benfica', 'BEN', '#e20e0e', '#ffffff'], 'Futebol Clube do Porto': ['Porto', 'POR', '#003893', '#ffffff'],
  'Sporting Clube de Portugal': ['Sporting', 'SCP', '#008057', '#ffffff'],
  'Club Atlético Boca Juniors': ['Boca Juniors', 'BOC', '#103f79', '#f3b229'],
  'Club Atlético River Plate': ['River Plate', 'RIV', '#ffffff', '#e30613'],
  // nomes como aparecem na base
  'Real Madrid': ['Real Madrid', 'RMA', '#ffffff', '#febe10'], 'FC Barcelona': ['Barcelona', 'BAR', '#a50044', '#004d98'],
  'Atlético de Madrid': ['Atlético de Madrid', 'ATM', '#cb3524', '#ffffff'], 'Sevilla FC': ['Sevilla', 'SEV', '#ffffff', '#d81920'],
  'Real Betis Balompié': ['Betis', 'BET', '#00954c', '#ffffff'], 'Villarreal CF': ['Villarreal', 'VIL', '#ffe667', '#005187'],
  'Athletic Bilbao': ['Athletic Bilbao', 'ATH', '#ee2523', '#ffffff'], 'Real Sociedad': ['Real Sociedad', 'RSO', '#0067b1', '#ffffff'],
  'Paris Saint-Germain': ['Paris Saint-Germain', 'PSG', '#004170', '#da291c'], 'Olympique Marseille': ['Olympique de Marselha', 'OM', '#2faee0', '#ffffff'],
  'Olympique Lyon': ['Lyon', 'OL', '#ffffff', '#da0812'], 'AS Monaco': ['Monaco', 'MON', '#e7192b', '#ffffff'], 'LOSC Lille': ['Lille', 'LIL', '#e01e13', '#20325f'],
  'Bayern Munich': ['Bayern de Munique', 'FCB', '#dc052d', '#ffffff'], 'Bayer 04 Leverkusen': ['Bayer Leverkusen', 'B04', '#e32221', '#000000'],
  'RB Leipzig': ['RB Leipzig', 'RBL', '#ffffff', '#dd0741'], 'Eintracht Frankfurt': ['Eintracht Frankfurt', 'SGE', '#e1000f', '#000000'],
  'VfB Stuttgart': ['Stuttgart', 'VFB', '#ffffff', '#e32219'],
  'SL Benfica': ['Benfica', 'SLB', '#e20e0e', '#ffffff'], 'Sporting CP': ['Sporting', 'SCP', '#008057', '#ffffff'], 'FC Porto': ['Porto', 'FCP', '#003893', '#ffffff'],
  'PSV Eindhoven': ['PSV', 'PSV', '#ed1c24', '#ffffff'], 'Feyenoord Rotterdam': ['Feyenoord', 'FEY', '#ff0000', '#ffffff'],
  'Leeds United': ['Leeds United', 'LEE', '#ffffff', '#1d428a'], 'Wolverhampton Wanderers': ['Wolverhampton', 'WOL', '#fdb913', '#231f20'],
  'Fulham FC': ['Fulham', 'FUL', '#ffffff', '#000000'], 'Brighton & Hove Albion': ['Brighton', 'BHA', '#0057b8', '#ffffff'],
  'Crystal Palace': ['Crystal Palace', 'CRY', '#1b458f', '#c4122e'], 'Nottingham Forest': ['Nottingham Forest', 'NFO', '#dd0000', '#ffffff'],
  'AFC Bournemouth': ['Bournemouth', 'BOU', '#da291c', '#000000'], 'Brentford FC': ['Brentford', 'BRE', '#e30613', '#ffffff'],
  'Burnley FC': ['Burnley', 'BUR', '#6c1d45', '#99d6ea'], 'Sunderland AFC': ['Sunderland', 'SUN', '#eb172b', '#ffffff'],
  'ACF Fiorentina': ['Fiorentina', 'FIO', '#482e92', '#ffffff'], 'Atalanta BC': ['Atalanta', 'ATA', '#1e71b8', '#000000'],
  'Bologna Football Club 1909': ['Bologna', 'BOL', '#a21c26', '#1a2f48'], 'Como 1907': ['Como', 'COM', '#0a2a5c', '#ffffff'],
  'Galatasaray': ['Galatasaray', 'GAL', '#a90432', '#fdb912'], 'Fenerbahce': ['Fenerbahçe', 'FEN', '#002d72', '#ffed00'],
  'Beşiktaş Jimnastik Kulübü': ['Beşiktaş', 'BJK', '#000000', '#ffffff'],
  'Al-Hilal Saudi Football Club': ['Al-Hilal', 'HIL', '#005daa', '#ffffff'], 'Al-Nassr Football Club': ['Al-Nassr', 'NAS', '#fcd116', '#1e3a8a'],
  'Al-Ahli Saudi Football Club': ['Al-Ahli', 'AHL', '#00843d', '#ffffff'], 'Club Brugge KV': ['Club Brugge', 'BRU', '#0067b1', '#000000']
};
const STRIP = [
  /\b(19|20)\d\d\b/g, /\bS\.?\s?A\.?\s?D\.?\b/gi, /\bS\.p\.A\.?/gi, /\bS\.\s?A\.\s?F\.?/gi,
  /\bFootball Club\b/gi, /\bFutebol Clube\b/gi, /\bFutbol Club\b/gi, /\bClub de Fútbol\b/gi, /\bClub de Futbol\b/gi,
  /\bAssociazione Sportiva\b/gi, /\bSocietà Sportiva\b/gi, /\bSociedade Esportiva\b/gi, /\bEsporte Clube\b/gi,
  /\bSport Club\b/gi, /\bSporting Club\b/gi, /\bAssociação\b/gi, /\bCalcio\b/gi, /\bFußball-Club\b/gi,
  /\b(FC|CF|AFC|SC|AC|SSC|US|ACF|BC|FK|NK|SK|KV|KRC|RSC|AS|CD|UD|SD|RCD|RC|CA|OGC|VfB|VfL|TSG|SV|1\.|FCO|AJ|SM|HNK|GNK|PFC|JK)\b\.?/g
];
STRIP.push(/\bClub Atlético\b/gi, /\bClub Atletico\b/gi, /\bSportklub\b/gi, /\bFotballklubben\b/gi, /\bBallklubb\b/gi,
  /\bFotball\b/gi, /\bBoldklub\b/gi, /\bFotbollförening\b/gi, /\bIdrottsföreningen\b/gi, /\bSpor Kulübü\b/gi,
  /\bFußballclub\b/gi, /\bClub\b/gi, /\bClube\b/gi, /\bSyndesmos Filathlon\b/gi, /\bAO\b/g, /\bPFK\b/g);
function cleanName(s) {
  for (const re of STRIP) s = s.replace(re, ' ');
  return s.replace(/\s+/g, ' ').replace(/^[\s\-–.,]+|[\s\-–.,]+$/g, '');
}
// Nome curto: limpa o nome oficial; se ficar longo ou em outro alfabeto,
// usa o "código" da URL do Transfermarkt (ex.: lokomotiv-moskau → Lokomotiv Moskau)
function shortName(full, code = '') {
  if (CLUB_OVERRIDE[full]) return CLUB_OVERRIDE[full][0];
  const s = cleanName(full);
  const latin = /^[\p{Script=Latin}\d\s.'&\-/]+$/u.test(s);
  if (s.length >= 3 && s.length <= 22 && latin) return s;
  const fromCode = cleanName(code.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' '));
  if (fromCode.length >= 3) return fromCode;
  return s.length >= 3 ? s : full;
}
function hashColor(name, salt) {
  let h = 0;
  for (const c of name + salt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, ${45 + (h >> 8) % 40}%, ${salt ? 85 : 35 + (h >> 16) % 20}%)`;
}

// ---------- Posições ----------
const SUBPOS = {
  'Goalkeeper': 'GOL', 'Centre-Back': 'ZAG', 'Left-Back': 'LAT', 'Right-Back': 'LAT',
  'Defensive Midfield': 'VOL', 'Central Midfield': 'MEI', 'Attacking Midfield': 'MEI',
  'Left Midfield': 'MEI', 'Right Midfield': 'MEI', 'Left Winger': 'ATA', 'Right Winger': 'ATA',
  'Second Striker': 'ATA', 'Centre-Forward': 'ATA'
};
const POSGEN = { Goalkeeper: 'GOL', Defender: 'ZAG', Midfield: 'MEI', Attack: 'ATA' };
const PROFILE = {
  GOL: { fin: -35, pas: -15, def: -5, for: 0, res: -10, gk: 5 },
  ZAG: { fin: -20, pas: -8, def: 6, for: 5, res: 0, gk: -45 },
  LAT: { fin: -12, pas: 0, def: 2, for: -4, res: 6, gk: -45 },
  VOL: { fin: -10, pas: 2, def: 4, for: 2, res: 4, gk: -45 },
  MEI: { fin: 0, pas: 6, def: -12, for: -4, res: 2, gk: -45 },
  ATA: { fin: 6, pas: -4, def: -25, for: 3, res: 0, gk: -45 }
};

const GAME_YEAR = 2026;

// Valor de mercado (€) → overall estimado
function valueToOverall(v, age) {
  let o = 63 + 13 * (Math.log10(Math.max(v, 25000)) - 6);
  if (age < 23) o -= (23 - age) * 1.4;              // jovem: valor inclui potencial
  if (age > 29) o += Math.min(12, (age - 29) * 1.8); // veterano: valor cai mais que o futebol
  return clamp(Math.round(o), 38, 93);
}

function buildAttrs(pos, target, r) {
  const attrs = {};
  for (const k of ['fin', 'pas', 'def', 'for', 'res', 'gk']) {
    attrs[k] = clamp(Math.round(target + PROFILE[pos][k] + (r() - 0.5) * 12), 5, 99);
  }
  // Ajusta para o overall bater com o alvo
  for (let i = 0; i < 6; i++) {
    const diff = target - overall({ attrs, pos });
    if (diff === 0) break;
    for (const k in attrs) {
      if (pos === 'GOL' ? k === 'gk' || k === 'def' || k === 'for' : k !== 'gk')
        attrs[k] = clamp(attrs[k] + diff, 5, 99);
    }
  }
  return attrs;
}

// ---------- Conversão ----------
const comps = readCSV('competitions.csv.gz').filter(c => c.type === 'domestic_league' && LEAGUES[c.competition_id]);
const clubsRaw = readCSV('clubs.csv.gz');
const playersRaw = readCSV('players.csv.gz');

const leagues = [];
const clubs = [];
const players = {};
let pn = 0;

for (const comp of comps) {
  const cid = comp.competition_id;
  const [lname, country] = LEAGUES[cid];
  // Só clubes que estão na liga na temporada mais recente
  const all = clubsRaw.filter(c => c.domestic_competition_id === cid);
  const lastSeason = Math.max(...all.map(c => Number(c.last_season) || 0));
  const lclubs = all.filter(c => Number(c.last_season) === lastSeason);
  const league = {
    id: cid, name: lname, country, continent: continentOf(country),
    clubIds: [], season: lastSeason, source: 'Transfermarkt (CC0)'
  };
  const usedShort = new Set();
  for (const c of lclubs) {
    const id = 'c' + c.club_id;
    const ov = CLUB_OVERRIDE[c.name];
    let short = ov ? ov[1] : shortName(c.name, c.club_code).normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    while (usedShort.has(short)) short = short.slice(0, 2) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
    usedShort.add(short);
    // Elenco atual: quem jogou na última temporada; no máximo os 30 mais valiosos
    // (a base inclui juniores e emprestados, que deixamos de fora)
    let squad = playersRaw.filter(p => p.current_club_id === c.club_id && Number(p.last_season) >= lastSeason);
    if (squad.length < 22) squad = playersRaw.filter(p => p.current_club_id === c.club_id && Number(p.last_season) >= lastSeason - 1);
    squad = squad.sort((a, b) => (Number(b.market_value_in_eur) || 0) - (Number(a.market_value_in_eur) || 0)).slice(0, 30);
    // Garante ao menos 2 goleiros se existirem na base
    const gks = squad.filter(p => p.position === 'Goalkeeper').length;
    if (gks < 2) {
      const extra = playersRaw.filter(p => p.current_club_id === c.club_id && p.position === 'Goalkeeper' && !squad.includes(p))
        .sort((a, b) => Number(b.last_season) - Number(a.last_season)).slice(0, 2 - gks);
      squad = squad.concat(extra);
    }
    const vals = squad.map(p => Number(p.market_value_in_eur) || 0).filter(v => v > 0).sort((a, b) => a - b);
    const fallbackValue = vals.length ? vals[Math.floor(vals.length * 0.2)] : 100000;
    for (const p of squad) {
      const r = seededRandom(Number(p.player_id) || ++pn);
      const birth = Number((p.date_of_birth || '').slice(0, 4));
      const age = birth ? clamp(GAME_YEAR - birth, 15, 45) : 26;
      const pos = SUBPOS[p.sub_position] || POSGEN[p.position] || 'MEI';
      const value = Number(p.market_value_in_eur) || fallbackValue;
      const ovr = valueToOverall(value, age);
      const attrs = buildAttrs(pos, ovr, r);
      const pl = {
        id: 'p' + p.player_id, name: p.name || `${p.first_name} ${p.last_name}`.trim(), pos, age, clubId: id, attrs,
        nat: NAT_PT[p.country_of_citizenship] || p.country_of_citizenship || '',
        potential: 0, moral: 60, fitness: 100, injury: 0, yellow: 0, suspended: 0,
        goals: 0, assists: 0, apps: 0, seasonGoals: 0,
        contract: { wage: 0, years: 2 }, loan: null, listed: false,
        realValueEUR: Number(p.market_value_in_eur) || null
      };
      const real = overall(pl);
      pl.potential = clamp(real + (age <= 19 ? 14 : age <= 21 ? 10 : age <= 23 ? 6 : age <= 26 ? 2 : 0) + Math.floor(r() * 4), real, 95);
      const exp = Number((p.contract_expiration_date || '').slice(0, 4));
      pl.contract.years = exp ? clamp(exp - GAME_YEAR, 1, 5) : 1 + Math.floor(r() * 3);
      pl.contract.wage = wageDemand(pl);
      pl.value = marketValue(pl);
      players[pl.id] = pl;
    }
    const top = squad.map(p => overall(players['p' + p.player_id])).sort((a, b) => b - a).slice(0, 14);
    const avg = top.reduce((s, v) => s + v, 0) / (top.length || 1);
    const rep = clamp(Math.round((avg - 49) / 0.32), 20, 99);
    const stadium = Number(c.stadium_seats) || Math.round(8000 + rep * 300);
    const wages = squad.reduce((s, p) => s + players['p' + p.player_id].contract.wage, 0);
    const club = {
      id, name: shortName(c.name, c.club_code), fullName: c.name, short,
      colors: ov ? [ov[2], ov[3]] : [hashColor(c.name, ''), hashColor(c.name, 'x')],
      leagueId: cid, country, rep, stadium, stadiumName: c.stadium_name || '',
      fans: Math.round(stadium * (1.3 + rep / 100)),
      ticketPrice: Math.round(20 + rep * 0.6),
      sponsor: Math.round(wages * 0.7 / 1000) * 1000,   // patrocínio cobre boa parte da folha
      budget: Math.round(wages * 14 / 100000) * 100000, // caixa ≈ 3 meses de folha
      formation: '4-4-2', style: 'Equilibrado', marking: 'Média', focus: 'Geral',
      lineup: [], bench: [], training: { focus: 'Equilibrado', intensity: 'Normal' }
    };
    clubs.push(club);
    league.clubIds.push(id);
  }
  leagues.push(league);
}

// Formato COMPACTO para o arquivo ficar pequeno (o jogo expande ao carregar,
// ver js/data/world.js): cada jogador vira uma lista
// [id, nome, pos, idade, clubeId, fin, pas, def, for, res, gk, potencial, anosContrato, nacionalidade, valorReal€]
const compact = Object.values(players).map(p => [
  p.id, p.name, p.pos, p.age, p.clubId, p.attrs.fin, p.attrs.pas, p.attrs.def, p.attrs.for, p.attrs.res, p.attrs.gk,
  p.potential, p.contract.years, p.nat, p.realValueEUR
]);
const db = {
  format: 'mundo-compacto-1',
  name: 'Mundo real — elencos de julho/2026 (Transfermarkt, CC0)',
  fictional: false,
  source: 'Dados: github.com/dcaribou/transfermarkt-datasets (CC0-1.0), originados do Transfermarkt. Atributos técnicos são estimativas calculadas pelo valor de mercado.',
  leagues, clubs, players: compact
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(db));

// Relatório
console.log(`Ligas: ${leagues.length} · Clubes: ${clubs.length} · Jogadores: ${Object.keys(players).length}`);
console.log(`Arquivo: ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB)`);
for (const l of leagues) {
  const cs = clubs.filter(c => c.leagueId === l.id);
  const sizes = cs.map(c => Object.values(players).filter(p => p.clubId === c.id).length);
  const best = cs.slice().sort((a, b) => b.rep - a.rep)[0];
  console.log(`  ${l.continent.padEnd(16)} ${l.country.padEnd(15)} ${l.name.padEnd(30)} ${cs.length} clubes · elencos ${Math.min(...sizes)}–${Math.max(...sizes)} · rep ${Math.min(...cs.map(c => c.rep))}–${best.rep} (${best.name})`);
}
const top = Object.values(players).sort((a, b) => overall(b) - overall(a)).slice(0, 12);
console.log('\nMelhores:', top.map(p => `${p.name} ${overall(p)}`).join(', '));
const bra = Object.values(players).filter(p => clubs.find(c => c.id === p.clubId).leagueId === 'BRA1').sort((a, b) => overall(b) - overall(a)).slice(0, 10);
console.log('Brasil:', bra.map(p => `${p.name} (${clubs.find(c => c.id === p.clubId).short}) ${overall(p)}`).join(', '));
console.log('Nomes curtos (amostra):', clubs.filter((c, i) => i % 9 === 0).map(c => c.name).join(' | '));

