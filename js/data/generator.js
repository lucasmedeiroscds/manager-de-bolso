// =============================================================
// generator.js — cria o BANCO DE DADOS FICTÍCIO de exemplo
// =============================================================
// ATENÇÃO: todos os clubes e jogadores daqui são INVENTADOS.
// Servem só para o jogo funcionar. Para usar dados reais, vá em
// "Mais → Banco de dados" e importe um arquivo JSON ou CSV.
// =============================================================
import { seededRandom, randInt, pick, clamp } from '../util.js';
import { overall, marketValue, wageDemand } from '../engine/ratings.js';

const FIRST = ['Adriano','Alex','Anderson','André','Bruno','Caio','Carlos','Cauã','Cristian','Daniel',
  'Davi','Diego','Douglas','Eduardo','Elias','Emerson','Enzo','Everton','Fabrício','Felipe','Fernando',
  'Gabriel','Guilherme','Gustavo','Heitor','Henrique','Hugo','Igor','Ítalo','Jefferson','João','Jonas',
  'Jorge','José','Juan','Júlio','Kaio','Kauan','Leandro','Léo','Lucas','Luan','Luiz','Marcelo','Marcos',
  'Mateus','Maurício','Miguel','Murilo','Nathan','Nicolas','Otávio','Pablo','Patrick','Paulo','Pedro',
  'Rafael','Raul','Renan','Renato','Ricardo','Robson','Rodrigo','Rogério','Samuel','Sérgio','Thiago',
  'Tiago','Vinícius','Victor','Wallace','Wesley','William','Yago','Yuri'];
const LAST = ['Almeida','Alves','Andrade','Araújo','Barbosa','Barros','Batista','Borges','Brito','Campos',
  'Cardoso','Carvalho','Castro','Correia','Costa','Cunha','Dias','Duarte','Farias','Fernandes','Ferraz',
  'Ferreira','Freitas','Garcia','Gomes','Guedes','Lima','Lopes','Macedo','Machado','Martins','Melo',
  'Mendes','Miranda','Monteiro','Moraes','Moreira','Nascimento','Neves','Nogueira','Nunes','Oliveira',
  'Pacheco','Peixoto','Pereira','Pinheiro','Pinto','Queiroz','Ramos','Reis','Ribeiro','Rocha','Rodrigues',
  'Sales','Santana','Santos','Silva','Siqueira','Soares','Souza','Tavares','Teixeira','Torres','Vieira'];

// 20 clubes INVENTADOS: nome, sigla, cores, reputação (1–100), estádio
const CLUBS = [
  ['Atlético Serrano', 'ASE', '#c8102e', '#111111', 84, 62000],
  ['Real Planalto', 'RPL', '#ffffff', '#1d3c8f', 82, 58000],
  ['Esporte Clube Litoral', 'ECL', '#0a7a3b', '#ffffff', 80, 50000],
  ['União Paulistana', 'UPA', '#111111', '#ffffff', 79, 48000],
  ['Sociedade Esportiva Guará', 'SEG', '#0b5a2a', '#f2c200', 77, 45000],
  ['Clube Atlético Ribeirão', 'CAR', '#d4001a', '#ffffff', 75, 42000],
  ['Ipê Futebol Clube', 'IPE', '#7a1630', '#0b6b3a', 74, 40000],
  ['Cerrado Esporte Clube', 'CEC', '#0e4fa8', '#ffffff', 72, 38000],
  ['Araucária FC', 'ARA', '#2a63c4', '#000000', 71, 36000],
  ['Maré Alta FC', 'MAR', '#e30613', '#ffffff', 69, 33000],
  ['Trilhos FC', 'TRI', '#000000', '#ffffff', 67, 30000],
  ['Sertão Unido', 'SUN', '#8a5a00', '#f5f5f5', 66, 32000],
  ['Serra Azul FC', 'SAZ', '#1b4f9c', '#cccccc', 65, 28000],
  ['Baía de Todos EC', 'BTE', '#c4161c', '#000000', 64, 30000],
  ['Mata Verde FC', 'MVE', '#006633', '#ffffff', 62, 27000],
  ['Amazônia FC', 'AMZ', '#41a6e0', '#ffffff', 61, 26000],
  ['Carvoeiros FC', 'CVO', '#f7d000', '#000000', 59, 22000],
  ['Pequi Esporte Clube', 'PEQ', '#00843d', '#f2c200', 58, 22000],
  ['Pampa FC', 'PAM', '#007a33', '#ffffff', 56, 20000],
  ['Mantiqueira FC', 'MAN', '#4b2e83', '#f2c200', 54, 18000]
];

// Elenco padrão: quantos jogadores de cada posição
const SQUAD_TEMPLATE = { GOL: 3, ZAG: 5, LAT: 4, VOL: 4, MEI: 5, ATA: 5 };

// Perfil de atributos por posição: [fin, pas, def, for, res, gk] relativos à base
const PROFILE = {
  GOL: { fin: -35, pas: -15, def: -5, for: 0, res: -10, gk: 5 },
  ZAG: { fin: -20, pas: -8, def: 6, for: 5, res: 0, gk: -45 },
  LAT: { fin: -12, pas: 0, def: 2, for: -4, res: 6, gk: -45 },
  VOL: { fin: -10, pas: 2, def: 4, for: 2, res: 4, gk: -45 },
  MEI: { fin: 0, pas: 6, def: -12, for: -4, res: 2, gk: -45 },
  ATA: { fin: 6, pas: -4, def: -25, for: 3, res: 0, gk: -45 }
};

// Cria um jogador com atributos em torno de um "nível" desejado
export function makePlayer(r, id, pos, level, age, clubId) {
  const attrs = {};
  for (const k of ['fin', 'pas', 'def', 'for', 'res', 'gk']) {
    attrs[k] = clamp(Math.round(level + PROFILE[pos][k] + (r() - 0.5) * 16), 10, 95);
  }
  const p = {
    id, pos, age, clubId, attrs,
    name: pick(FIRST, r) + ' ' + pick(LAST, r),
    potential: 0,
    moral: 60, fitness: 100,
    injury: 0,        // semanas lesionado
    yellow: 0,        // amarelos acumulados (3 = suspenso)
    suspended: 0,     // jogos de suspensão
    goals: 0, assists: 0, apps: 0, seasonGoals: 0,
    contract: { wage: 0, years: randInt(1, 4, r) },
    loan: null,       // { from: clubId } quando está emprestado
    listed: false,    // está à venda?
    fictional: true   // marca de dado inventado
  };
  const ovr = overall(p);
  // Potencial: jovens podem crescer bastante; veteranos já chegaram ao teto
  const room = age <= 20 ? randInt(6, 22, r) : age <= 24 ? randInt(2, 12, r) : age <= 28 ? randInt(0, 4, r) : 0;
  p.potential = clamp(ovr + room, ovr, 94);
  p.contract.wage = wageDemand(p);
  p.value = marketValue(p);
  return p;
}

// Gera o banco de dados completo (sempre igual, graças à semente)
export function generateDatabase(seed = 2026) {
  const r = seededRandom(seed);
  const clubs = [];
  const players = {};
  let n = 0;

  CLUBS.forEach(([name, short, c1, c2, rep, stadium], i) => {
    const clubId = 'c' + (i + 1);
    const club = {
      id: clubId, name, short, colors: [c1, c2], rep, stadium,
      fans: Math.round(stadium * (1.4 + rep / 100)),       // torcedores que podem ir ao estádio
      ticketPrice: Math.round(30 + rep * 0.5),             // R$ por ingresso
      sponsor: Math.round(rep * rep * 30 / 1000) * 1000,  // R$ por rodada
      budget: Math.round(rep * rep * rep * 60 / 100000) * 100000, // caixa inicial (R$)
      formation: '4-4-2', style: 'Equilibrado',
      lineup: [], bench: [],
      training: { focus: 'Equilibrado', intensity: 'Normal' },
      fictional: true
    };
    // Nível médio do elenco de acordo com a reputação
    const level = 42 + rep * 0.32;
    for (const pos in SQUAD_TEMPLATE) {
      for (let k = 0; k < SQUAD_TEMPLATE[pos]; k++) {
        n++;
        const age = randInt(17, 34, r);
        // Primeiros de cada posição são titulares (mais fortes)
        const lvl = level + (k === 0 ? 5 : k === 1 ? 2 : -3) + (r() - 0.5) * 8 + (age < 21 ? -6 : 0);
        const p = makePlayer(r, 'p' + n, pos, lvl, age, clubId);
        players[p.id] = p;
      }
    }
    clubs.push(club);
  });

  // Alguns jogadores sem clube (agentes livres)
  for (let k = 0; k < 40; k++) {
    n++;
    const pos = pick(Object.keys(SQUAD_TEMPLATE), r);
    const p = makePlayer(r, 'p' + n, pos, randInt(40, 62, r), randInt(19, 35, r), null);
    p.contract.years = 0;
    players[p.id] = p;
  }

  return {
    name: 'Liga Nacional (dados fictícios de exemplo)',
    fictional: true,
    clubs, players
  };
}

// Gera garotos da base para um clube (fim de temporada)
export function youthIntake(r, club, startId, count = 3) {
  const out = [];
  const poss = ['GOL', 'ZAG', 'LAT', 'VOL', 'MEI', 'ATA'];
  for (let k = 0; k < count; k++) {
    const pos = poss[Math.floor(r() * poss.length)];
    const lvl = 30 + club.rep * 0.25 + (r() - 0.5) * 12;
    const p = makePlayer(r, startId + k, pos, lvl, randInt(16, 18, r), club.id);
    p.potential = clamp(overall(p) + randInt(12, 30, r), 0, 92);
    p.contract.years = 3;
    p.value = marketValue(p);
    out.push(p);
  }
  return out;
}
