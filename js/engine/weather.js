// =============================================================
// weather.js — CLIMA, GRAMADO e ALTITUDE
// =============================================================
// Cada jogo tem um clima sorteado de forma FIXA (mesma previsão na
// tela antes do jogo e na partida), conforme o país e a época do ano:
//  • ☀️ Sol / ⛅ Nublado: normal.
//  • 🌧️ Chuva: bola mais rápida e escorregadia (mais erros, chutes menos
//    certeiros); 🌧️⛈️ chuva forte prejudica muito o toque de bola.
//  • 🥵 Calor: todos cansam mais (vale rodar o elenco).
//  • ❄️ Frio / neve: jogo mais truncado.
// GRAMADO: estádios de clubes mais ricos têm gramado melhor; gramado
// ruim atrapalha quem joga no "Toque de bola".
// ALTITUDE: cidades altas de verdade (Cidade do México, Toluca,
// Pachuca) cansam muito o time visitante.
// =============================================================

// Clima por país: 'trop' (tropical), 'temp' (temperado), 'cold' (frio)
const CLIMATE = {
  'Brasil': 'trop', 'México': 'trop', 'Arábia Saudita': 'hot', 'Austrália': 'temp', 'Estados Unidos': 'temp', 'Japão': 'temp', 'Coreia do Sul': 'temp',
  'Argentina': 'temp', 'Espanha': 'temp', 'Portugal': 'temp', 'Itália': 'temp', 'França': 'temp', 'Grécia': 'temp', 'Turquia': 'temp', 'Croácia': 'temp', 'Sérvia': 'temp', 'Romênia': 'temp',
  'Inglaterra': 'cold', 'Escócia': 'cold', 'Alemanha': 'cold', 'Holanda': 'cold', 'Bélgica': 'cold', 'Áustria': 'cold', 'Suíça': 'cold', 'Dinamarca': 'cold', 'Noruega': 'cold', 'Suécia': 'cold', 'Polônia': 'cold', 'Rússia': 'cold', 'Ucrânia': 'cold', 'Rep. Tcheca': 'cold'
};
const SOUTH = new Set(['Brasil', 'Argentina', 'Austrália']);
// Altitude real (metros, aproximado) de cidades-sede conhecidas
const ALTITUDE = { 'Deportivo Toluca': 2660, 'América': 2240, 'Cruz Azul': 2240, 'UNAM Pumas': 2240, 'Pachuca': 2400 };

export const WEATHER = {
  sol:     { emoji: '☀️', name: 'Sol', pass: 1, shot: 1, tire: 1, desc: 'Condições perfeitas.' },
  nublado: { emoji: '⛅', name: 'Nublado', pass: 1, shot: 1, tire: 0.97, desc: 'Tempo bom para jogar.' },
  chuva:   { emoji: '🌧️', name: 'Chuva', pass: 0.96, shot: 0.93, tire: 1.03, desc: 'Bola escorregadia: mais erros e chutes menos certeiros.' },
  forte:   { emoji: '⛈️', name: 'Chuva forte', pass: 0.9, shot: 0.86, tire: 1.08, desc: 'Gramado encharcado: o toque de bola sofre muito. Jogo de bola longa.' },
  calor:   { emoji: '🥵', name: 'Calor forte', pass: 0.99, shot: 1, tire: 1.25, desc: 'Todos cansam mais. Rode o elenco e use as substituições.' },
  frio:    { emoji: '❄️', name: 'Frio intenso', pass: 0.97, shot: 0.97, tire: 0.95, desc: 'Jogo truncado e de pouca técnica.' },
  neve:    { emoji: '🌨️', name: 'Neve', pass: 0.9, shot: 0.9, tire: 1.05, desc: 'Bola pesada e campo difícil.' }
};

// número "aleatório" fixo a partir de um texto
function seeded(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }

// mês aproximado da rodada (ligas do sul começam em abril; do norte, em agosto)
function monthOf(country, round) { return ((SOUTH.has(country) ? 3 : 7) + Math.floor(round / 4.3)) % 12; }

export function pitchOf(club) {
  const r = club.rep || 50;
  return r >= 75 ? { key: 'otimo', name: 'Gramado impecável', q: 1 } : r >= 55 ? { key: 'bom', name: 'Gramado bom', q: 0.99 } : { key: 'ruim', name: 'Gramado irregular', q: 0.96 };
}
export const altitudeOf = club => ALTITUDE[club.name] || 0;

export function weatherFor(game, home, round, tag = '') {
  const country = home.country || '';
  const zone = CLIMATE[country] || 'temp';
  const month = monthOf(country, round);
  const summer = SOUTH.has(country) ? [11, 0, 1, 2].includes(month) : [5, 6, 7].includes(month);
  const winter = SOUTH.has(country) ? [5, 6, 7].includes(month) : [11, 0, 1].includes(month);
  const x = seeded(`${game.season}|${round}|${home.id}|${tag}`);
  let key;
  if (zone === 'hot') key = x < 0.55 ? 'calor' : x < 0.95 ? 'sol' : 'nublado';
  else if (zone === 'trop') key = x < (summer ? 0.35 : 0.15) ? 'calor' : x < 0.55 ? 'sol' : x < 0.75 ? 'nublado' : x < 0.93 ? 'chuva' : 'forte';
  else if (zone === 'cold') key = winter ? (x < 0.15 ? 'neve' : x < 0.4 ? 'frio' : x < 0.65 ? 'chuva' : x < 0.72 ? 'forte' : 'nublado') : (x < 0.3 ? 'sol' : x < 0.65 ? 'nublado' : x < 0.9 ? 'chuva' : 'forte');
  else key = summer ? (x < 0.25 ? 'calor' : x < 0.75 ? 'sol' : x < 0.9 ? 'nublado' : 'chuva') : (x < 0.35 ? 'sol' : x < 0.65 ? 'nublado' : x < 0.88 ? 'chuva' : winter && x > 0.96 ? 'frio' : 'forte');
  return { key, ...WEATHER[key], pitch: pitchOf(home), alt: altitudeOf(home) };
}

// Multiplicadores para um time na partida
export function weatherFx(w, club, isHome) {
  if (!w) return { mid: 1, shot: 1, tire: 1 };
  let mid = w.pass, tire = w.tire;
  const tiki = club.style === 'Toque de bola';
  if (tiki) mid *= (w.pass < 1 ? w.pass : 1) * w.pitch.q;          // chuva e gramado ruim pesam dobrado
  if ((w.key === 'forte' || w.key === 'chuva') && (club.style === 'Contra-ataque' || club.focus === 'Pelas laterais')) mid *= 1.02; // bola longa funciona
  if (w.alt >= 2000 && !isHome) tire *= 1 + (w.alt - 1500) / 3500;   // visitante sofre na altitude
  return { mid, shot: w.shot, tire };
}

export function weatherLine(w) {
  return `${w.emoji} ${w.name} · ${w.pitch.name}${w.alt ? ` · ⛰️ ${w.alt.toLocaleString('pt-BR')} m de altitude` : ''}`;
}
