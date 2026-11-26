// =============================================================
// divisions.js — SEGUNDAS DIVISÕES, acesso e rebaixamento
// =============================================================
// A base real (Transfermarkt) só tem a 1ª divisão. Aqui criamos a 2ª
// divisão de 8 países com NOMES REAIS de clubes (lista de memória,
// pode estar desatualizada) e ELENCOS GERADOS (jogadores fictícios,
// marcados com fictional: true). Ao fim de cada temporada, os piores
// da 1ª caem e os melhores da 2ª sobem.
// =============================================================
import { rnd, randInt, pick, clamp } from '../util.js';
import { overall, marketValue, wageDemand } from './ratings.js';
import { makePlayer } from '../data/generator.js';
import { touchPlayers } from './tactics.js';
import { clubById } from './market.js';

// país → [id da 1ª divisão, id da 2ª, nome, vagas de acesso/rebaixamento, clubes]
export const SECOND = {
  'Brasil': ['BRA1', 'BRA2', 'Brasileirão Série B', 4, ['Sport', 'Fortaleza', 'Ceará', 'Juventude', 'Goiás', 'Novorizontino', 'Cuiabá', 'Avaí', 'Criciúma', 'Atlético-GO', 'América-MG', 'Operário-PR', 'Vila Nova', 'Botafogo-SP', 'CRB', 'Ponte Preta', 'Náutico', 'Londrina', 'São Bernardo', 'Athletic-MG', 'Paysandu', 'Amazonas', 'Guarani']],
  'Argentina': ['ARG1', 'ARG2', 'Primera Nacional', 2, ['Quilmes', 'Chacarita', 'Ferro Carril Oeste', 'Almirante Brown', 'All Boys', 'Atlanta', 'Deportivo Morón', 'Temperley', 'Agropecuario', 'Gimnasia de Jujuy', 'San Martín de Tucumán', 'Chaco For Ever', 'Deportivo Maipú', 'Colón', 'Patronato', 'Mitre', 'Tristán Suárez', 'Defensores de Belgrano', 'Arsenal de Sarandí', 'Nueva Chicago', 'Estudiantes de Buenos Aires']],
  'Inglaterra': ['GB1', 'GB2', 'Championship', 3, ['Leicester City', 'Ipswich Town', 'Southampton', 'Sheffield United', 'Middlesbrough', 'Coventry City', 'Bristol City', 'Norwich City', 'West Bromwich', 'Millwall', 'Hull City', 'Watford', 'Swansea City', 'Stoke City', 'Queens Park Rangers', 'Preston North End', 'Blackburn Rovers', 'Portsmouth', 'Derby County', 'Sheffield Wednesday', 'Oxford United', 'Wrexham', 'Charlton Athletic', 'Birmingham City', 'Cardiff City', 'Luton Town']],
  'Espanha': ['ES1', 'ES2', 'LaLiga 2', 3, ['Las Palmas', 'Leganés', 'Real Valladolid', 'Racing Santander', 'Almería', 'Málaga', 'Sporting Gijón', 'Granada', 'Cádiz', 'Eibar', 'Deportivo La Coruña', 'Huesca', 'Real Zaragoza', 'Albacete', 'Burgos', 'Castellón', 'Córdoba', 'Mirandés', 'Andorra', 'Cultural Leonesa', 'Ceuta', 'Tenerife', 'Elche', 'Levante']],
  'Itália': ['IT1', 'IT2', 'Serie B', 3, ['Empoli', 'Monza', 'Venezia', 'Palermo', 'Sampdoria', 'Bari', 'Spezia', 'Modena', 'Cesena', 'Catanzaro', 'Südtirol', 'Juve Stabia', 'Carrarese', 'Reggiana', 'Frosinone', 'Mantova', 'Padova', 'Virtus Entella', 'Avellino', 'Pescara', 'Salernitana', 'Brescia']],
  'Alemanha': ['L1', 'L2', '2. Bundesliga', 3, ['Holstein Kiel', 'VfL Bochum', 'Schalke 04', 'Hertha BSC', 'Hannover 96', 'Fortuna Düsseldorf', 'Karlsruher SC', 'Kaiserslautern', 'Nürnberg', 'Paderborn', 'Darmstadt 98', 'Magdeburg', 'Greuther Fürth', 'Elversberg', 'Preußen Münster', 'Eintracht Braunschweig', 'Arminia Bielefeld', 'Dynamo Dresden', 'Hamburger SV', 'Köln']],
  'França': ['FR1', 'FR2', 'Ligue 2', 3, ['Montpellier', 'Saint-Étienne', 'Reims', 'Troyes', 'Guingamp', 'Pau', 'Red Star', 'Annecy', 'Laval', 'Amiens', 'Rodez', 'Grenoble', 'Clermont', 'Bastia', 'Boulogne', 'Le Mans', 'Nancy', 'Dunkerque', 'Metz', 'Lorient']],
  'Portugal': ['PO1', 'PO2', 'Liga Portugal 2', 2, ['Farense', 'Portimonense', 'Académico de Viseu', 'Leixões', 'Feirense', 'Torreense', 'Chaves', 'Penafiel', 'Paços de Ferreira', 'Marítimo', 'Vizela', 'Oliveirense', 'União de Leiria', 'Felgueiras', 'Lusitânia', 'Belenenses', 'Boavista', 'Varzim', 'Trofense', 'Mafra']]
};
const TARGET_SIZE = { BRA2: 20, ARG2: 20, GB2: 24, ES2: 22, IT2: 20, L2: 18, FR2: 18, PO2: 18 };

// Cores conhecidas de alguns clubes; os demais usam cores geradas
const COLORS = {
  'Sport': ['#d71920', '#111111'], 'Fortaleza': ['#1b4fa3', '#d71920'], 'Ceará': ['#111111', '#ffffff'], 'Juventude': ['#006b3f', '#ffffff'],
  'Goiás': ['#00843d', '#ffffff'], 'Cuiabá': ['#00843d', '#f7d117'], 'Avaí': ['#0057a8', '#ffffff'], 'Criciúma': ['#f7d117', '#111111'],
  'Atlético-GO': ['#d71920', '#111111'], 'América-MG': ['#00843d', '#111111'], 'Ponte Preta': ['#111111', '#ffffff'], 'Guarani': ['#00843d', '#ffffff'],
  'Paysandu': ['#4cb4ff', '#ffffff'], 'Náutico': ['#d71920', '#ffffff'],
  'Leicester City': ['#003090', '#fdbe11'], 'Southampton': ['#d71920', '#ffffff'], 'Ipswich Town': ['#0033a0', '#ffffff'], 'Sheffield United': ['#ee2737', '#111111'],
  'Middlesbrough': ['#e11b22', '#ffffff'], 'Norwich City': ['#fff200', '#00a650'], 'West Bromwich': ['#122f67', '#ffffff'], 'Watford': ['#fbee23', '#ed2127'],
  'Schalke 04': ['#004d9d', '#ffffff'], 'Hertha BSC': ['#005ca9', '#ffffff'], 'Hamburger SV': ['#0a3f86', '#ffffff'], 'Köln': ['#ffffff', '#ed1c24'],
  'Kaiserslautern': ['#e2001a', '#ffffff'], 'Hannover 96': ['#00843d', '#111111'], 'Fortuna Düsseldorf': ['#e2001a', '#ffffff'],
  'Sampdoria': ['#1b5faa', '#ffffff'], 'Palermo': ['#f5a3c7', '#111111'], 'Bari': ['#ffffff', '#d71920'], 'Empoli': ['#005baa', '#ffffff'], 'Venezia': ['#111111', '#f47b20'],
  'Saint-Étienne': ['#00843d', '#ffffff'], 'Montpellier': ['#003c71', '#f47b20'], 'Reims': ['#e2001a', '#ffffff'], 'Bastia': ['#0055a4', '#ffffff'],
  'Málaga': ['#4cb4ff', '#ffffff'], 'Deportivo La Coruña': ['#0057a8', '#ffffff'], 'Sporting Gijón': ['#d71920', '#ffffff'], 'Real Zaragoza': ['#ffffff', '#0033a0'],
  'Cádiz': ['#f7d117', '#0033a0'], 'Granada': ['#d71920', '#ffffff'], 'Real Valladolid': ['#6a1b9a', '#ffffff'],
  'Boavista': ['#111111', '#ffffff'], 'Marítimo': ['#00843d', '#d71920'], 'Belenenses': ['#0057a8', '#ffffff'],
  'Colón': ['#111111', '#d71920'], 'Quilmes': ['#ffffff', '#0033a0'], 'Chacarita': ['#d71920', '#111111'], 'Ferro Carril Oeste': ['#00843d', '#ffffff']
};

// Nomes de jogadores típicos de cada país (para os elencos gerados)
const NAMES = {
  'Brasil': [['Gabriel', 'Lucas', 'Matheus', 'Pedro', 'Rafael', 'Vitor', 'Igor', 'Caio', 'Diego', 'Thiago', 'Felipe', 'Bruno', 'Wesley', 'Renan', 'Yuri', 'Luan', 'Kauã'], ['Silva', 'Santos', 'Souza', 'Oliveira', 'Lima', 'Costa', 'Ferreira', 'Rocha', 'Alves', 'Pereira', 'Gomes', 'Martins', 'Barbosa', 'Ribeiro', 'Nunes']],
  'Argentina': [['Matías', 'Lautaro', 'Nicolás', 'Facundo', 'Agustín', 'Tomás', 'Franco', 'Joaquín', 'Santiago', 'Gonzalo', 'Ezequiel', 'Brian', 'Lucas', 'Ramiro'], ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Díaz', 'Pérez', 'Sosa', 'Romero', 'Álvarez', 'Benítez', 'Acosta', 'Medina', 'Herrera']],
  'Inglaterra': [['James', 'Harry', 'Jack', 'Tom', 'Charlie', 'George', 'Ben', 'Sam', 'Josh', 'Callum', 'Reece', 'Lewis', 'Ryan', 'Connor', 'Jordan'], ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Evans', 'Walker', 'Wright', 'Hughes', 'Clarke', 'Hall', 'Morris', 'Turner', 'Barnes', 'Cooper']],
  'Espanha': [['Pablo', 'Álvaro', 'Sergio', 'Javier', 'Adrián', 'Iván', 'Rubén', 'Marcos', 'Hugo', 'Raúl', 'Alejandro', 'Dani', 'Iker', 'Unai', 'Jorge'], ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Hernández', 'Jiménez', 'Moreno', 'Muñoz', 'Navarro', 'Romero', 'Torres', 'Gil']],
  'Itália': [['Lorenzo', 'Matteo', 'Andrea', 'Luca', 'Marco', 'Giovanni', 'Davide', 'Alessandro', 'Federico', 'Simone', 'Riccardo', 'Gabriele', 'Nicolò', 'Tommaso'], ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Costa']],
  'Alemanha': [['Lukas', 'Jonas', 'Leon', 'Felix', 'Maximilian', 'Paul', 'Niklas', 'Tim', 'Jan', 'Finn', 'Moritz', 'Julian', 'Marvin', 'Tobias', 'Kevin'], ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Schulz', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann']],
  'França': [['Lucas', 'Hugo', 'Théo', 'Nathan', 'Louis', 'Enzo', 'Mathis', 'Clément', 'Maxime', 'Antoine', 'Yanis', 'Kylian', 'Rayan', 'Bastien'], ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia']],
  'Portugal': [['João', 'Tiago', 'Diogo', 'Rui', 'Gonçalo', 'André', 'Miguel', 'Ricardo', 'Bruno', 'Nuno', 'Rafael', 'Francisco', 'Hugo', 'Fábio'], ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Almeida']]
};
const NAT_OF = { 'Inglaterra': 'Inglaterra' };

function hashColor(name, light) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, ${45 + (h >> 8) % 40}%, ${light ? 88 : 35 + (h >> 16) % 18}%)`;
}
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Os elencos das 2ªs divisões ficam um pouco abaixo dos piores da 1ª
function levelFor(game, l1) {
  const reps = l1.clubIds.map(id => clubById(game, id).rep).sort((a, b) => a - b);
  const low = reps.slice(0, 4).reduce((s, v) => s + v, 0) / Math.min(4, reps.length);
  return clamp(42 + low * 0.32 - 4, 45, 72);
}

// Cria as 2ªs divisões que ainda não existem (jogo novo ou jogo salvo antigo)
export function addSecondDivisions(game) {
  let added = 0;
  for (const [country, [id1, id2, name, , clubNames]] of Object.entries(SECOND)) {
    const l1 = game.leagues.find(l => l.id === id1);
    // só no banco do mundo real (a liga fictícia também usa o id "L1")
    if (!l1 || l1.country !== country || game.leagues.some(l => l.id === id2)) continue;
    l1.tier = 1; l1.lowerId = id2;
    const taken = new Set(game.clubs.filter(c => c.country === country || l1.clubIds.includes(c.id)).map(c => norm(c.name)));
    const level = levelFor(game, l1);
    const ids = [];
    for (const cname of clubNames) {
      if (ids.length >= TARGET_SIZE[id2]) break;
      // pula clubes que já estão na 1ª divisão da base
      const n = norm(cname);
      if ([...taken].some(t => t.includes(n) || n.includes(t))) continue;
      const id = 'd' + id2 + '_' + n.slice(0, 12);
      const rep = Math.round(clamp((level - 42) / 0.32 + randInt(-5, 5), 20, 70));
      const stadium = randInt(9, 32) * 1000;
      const club = {
        id, name: cname, fullName: cname, short: cname.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(),
        colors: COLORS[cname] || [hashColor(cname, false), hashColor(cname, true)],
        leagueId: id2, country, rep, stadium, stadiumName: '',
        fans: Math.round(stadium * (1.3 + rep / 100)), ticketPrice: Math.round(15 + rep * 0.45),
        sponsor: 0, budget: 0, formation: '4-4-2', style: 'Equilibrado', marking: 'Média', focus: 'Geral',
        lineup: [], bench: [], training: { focus: 'Equilibrado', intensity: 'Normal' },
        squadFictional: true // nome real, elenco gerado
      };
      // Elenco gerado (FICTÍCIO)
      const [fn, ln] = NAMES[country] || NAMES['Brasil'];
      const quota = { GOL: 3, ZAG: 5, LAT: 4, VOL: 4, MEI: 5, ATA: 5 };
      let wages = 0;
      for (const pos in quota) for (let k = 0; k < quota[pos]; k++) {
        const lvl = level + (k === 0 ? 4 : k === 1 ? 1 : -4) + (rnd() - 0.5) * 8;
        const p = makePlayer(rnd, 'g' + (game.nextPlayerId++), pos, lvl, randInt(18, 33), id);
        p.name = `${pick(fn)} ${pick(ln)}`;
        p.nat = NAT_OF[country] || country;
        p.fictional = true;
        p.contract.wage = wageDemand(p); p.value = marketValue(p);
        game.players[p.id] = p;
        wages += p.contract.wage;
      }
      club.sponsor = Math.round(wages * 0.75 / 1000) * 1000;
      club.budget = Math.round(wages * 10 / 100000) * 100000;
      game.clubs.push(club);
      ids.push(id);
    }
    game.leagues.push({ id: id2, name, country, continent: l1.continent, clubIds: ids, tier: 2, upperId: id1, season: game.season, fixtures: [] });
    added++;
  }
  touchPlayers(game);
  return added;
}

// Fim de temporada: troca os rebaixados da 1ª com os promovidos da 2ª.
// tables: { leagueId: [ids na ordem final] }. Devolve mensagens.
export function promoteRelegate(game, tables) {
  const msgs = [];
  for (const [country, [id1, id2, name2, n]] of Object.entries(SECOND)) {
    const l1 = game.leagues.find(l => l.id === id1), l2 = game.leagues.find(l => l.id === id2);
    if (!l1 || !l2 || !tables[id1] || !tables[id2]) continue;
    const down = tables[id1].slice(-n), up = tables[id2].slice(0, n);
    l1.clubIds = l1.clubIds.filter(id => !down.includes(id)).concat(up);
    l2.clubIds = l2.clubIds.filter(id => !up.includes(id)).concat(down);
    for (const id of up) { const c = clubById(game, id); c.leagueId = id1; c.rep = Math.min(99, c.rep + 3); }
    for (const id of down) { const c = clubById(game, id); c.leagueId = id2; c.rep = Math.max(20, c.rep - 3); }
    const names = ids => ids.map(id => clubById(game, id).name).join(', ');
    msgs.push(`⬆️ Sobem para a ${l1.name}: ${names(up)}. ⬇️ Caem para a ${name2}: ${names(down)}.`);
    if (up.includes(game.userClubId)) msgs.unshift(`🎉 ACESSO! Seu clube subiu para a ${l1.name}!`);
    if (down.includes(game.userClubId)) msgs.unshift(`💔 Seu clube foi rebaixado para a ${name2}.`);
  }
  return msgs;
}

// Quantos sobem/caem numa liga (para colorir a tabela)
export function zoneSizes(game, leagueId) {
  for (const [, [id1, id2, , n]] of Object.entries(SECOND)) {
    if (leagueId === id1 && game.leagues.some(l => l.id === id2)) return { relegate: n, promote: 0 };
    if (leagueId === id2) return { relegate: 0, promote: n };
  }
  return null;
}
