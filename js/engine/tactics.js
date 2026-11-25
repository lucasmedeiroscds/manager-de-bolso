// =============================================================
// tactics.js — formações, estilos de jogo e escalação automática
// =============================================================
import { effectiveRating, overall } from './ratings.js';

// Cada formação é a lista de 11 "vagas" (posições) em campo
export const FORMATIONS = {
  '4-4-2':   ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA'],
  '4-3-3':   ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA', 'ATA'],
  '4-2-3-1': ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'VOL', 'MEI', 'MEI', 'MEI', 'ATA'],
  '3-5-2':   ['GOL', 'ZAG', 'ZAG', 'ZAG', 'LAT', 'LAT', 'VOL', 'VOL', 'MEI', 'ATA', 'ATA'],
  '5-3-2':   ['GOL', 'LAT', 'ZAG', 'ZAG', 'ZAG', 'LAT', 'VOL', 'MEI', 'MEI', 'ATA', 'ATA'],
  '4-5-1':   ['GOL', 'LAT', 'ZAG', 'ZAG', 'LAT', 'VOL', 'VOL', 'MEI', 'MEI', 'MEI', 'ATA']
};

// Estilos de jogo: multiplicam ataque (att), meio-campo (mid) e defesa (def)
export const STYLES = {
  'Equilibrado':   { att: 1.00, mid: 1.00, def: 1.00, tire: 1.00, desc: 'Sem riscos extras.' },
  'Ofensivo':      { att: 1.12, mid: 1.00, def: 0.90, tire: 1.08, desc: 'Mais chances criadas, defesa exposta.' },
  'Defensivo':     { att: 0.88, mid: 0.98, def: 1.12, tire: 0.95, desc: 'Fecha a casinha, ataca pouco.' },
  'Contra-ataque': { att: 1.06, mid: 0.90, def: 1.06, tire: 1.00, desc: 'Cede a bola e sai em velocidade.' },
  'Toque de bola': { att: 0.97, mid: 1.12, def: 0.98, tire: 1.03, desc: 'Domina a posse, chances de qualidade.' },
  'Pressão alta':  { att: 1.06, mid: 1.06, def: 0.95, tire: 1.20, desc: 'Sufoca o rival, mas cansa muito.' }
};

// Marcação: mais pesada defende melhor, mas faz mais faltas e cansa
export const MARKING = {
  'Leve':   { def: 0.95, fouls: 0.75, tire: 0.92, desc: 'Poucas faltas e cartões, defesa mais frouxa.' },
  'Média':  { def: 1.00, fouls: 1.00, tire: 1.00, desc: 'Equilíbrio.' },
  'Pesada': { def: 1.06, fouls: 1.45, tire: 1.10, desc: 'Defende melhor, mas faz mais faltas e cansa.' }
};
// Por onde concentrar os ataques: rende mais onde o rival é fraco
export const FOCUS = {
  'Geral': 'Ataca por todos os lados.',
  'Pelo meio': 'Bom contra zagueiros e volantes fracos.',
  'Pelas laterais': 'Bom contra laterais fracos. Mais cruzamentos e escanteios.'
};

// Pode jogar? (sem lesão, sem suspensão e pertence ao clube)
export function isAvailable(p, clubId) {
  return p && p.clubId === clubId && p.injury <= 0 && p.suspended <= 0;
}

// ---- Índice "clube → jogadores" ----
// Com ~15 mil jogadores, procurar na lista inteira toda hora fica lento.
// Guardamos um índice e o reconstruímos quando alguém muda de clube
// (quem muda chama touchPlayers).
const INDEX = new WeakMap();
export function touchPlayers(game) { INDEX.delete(game); }
// Muda um jogador de clube atualizando o índice na hora (sem reconstruir tudo)
export function setClub(game, p, clubId) {
  const map = INDEX.get(game);
  if (map && p.clubId !== clubId) {
    const old = map.get(p.clubId);
    if (old) { const i = old.indexOf(p); if (i >= 0) old.splice(i, 1); }
    if (clubId) { let l = map.get(clubId); if (!l) map.set(clubId, l = []); if (!l.includes(p)) l.push(p); }
  }
  p.clubId = clubId;
}
function buildIndex(game) {
  const map = new Map();
  for (const p of Object.values(game.players)) {
    if (!p.clubId) continue;
    let l = map.get(p.clubId);
    if (!l) map.set(p.clubId, l = []);
    l.push(p);
  }
  INDEX.set(game, map);
  return map;
}
export function clubPlayers(game, clubId) {
  const map = INDEX.get(game) || buildIndex(game);
  // o filtro final protege contra índice desatualizado
  return (map.get(clubId) || []).filter(p => p.clubId === clubId && game.players[p.id] === p);
}

// Monta a escalação automática: primeiro jogadores da posição certa,
// depois completa as vagas restantes com o melhor encaixe possível.
export function autoLineup(game, club) {
  const slots = FORMATIONS[club.formation] || FORMATIONS['4-4-2'];
  const pool = clubPlayers(game, club.id).filter(p => isAvailable(p, club.id));
  const used = new Set();
  const lineup = new Array(slots.length).fill(null);

  // Passo 1: posição natural (para cada vaga, o melhor ainda livre)
  slots.forEach((slot, i) => {
    const best = pool
      .filter(p => !used.has(p.id) && p.pos === slot)
      .sort((a, b) => effectiveRating(b, slot) - effectiveRating(a, slot))[0];
    if (best) { lineup[i] = best.id; used.add(best.id); }
  });
  // Passo 2: completa vagas vazias com quem render mais naquela vaga
  slots.forEach((slot, i) => {
    if (lineup[i]) return;
    const best = pool
      .filter(p => !used.has(p.id))
      .sort((a, b) => effectiveRating(b, slot) - effectiveRating(a, slot))[0];
    if (best) { lineup[i] = best.id; used.add(best.id); }
  });

  club.lineup = lineup;
  club.bench = autoBench(pool, used);
}

// Banco: 1 goleiro reserva + os 6 melhores restantes
function autoBench(pool, used) {
  const rest = pool.filter(p => !used.has(p.id)).sort((a, b) => overall(b) - overall(a));
  const bench = [];
  const gk = rest.find(p => p.pos === 'GOL');
  if (gk) bench.push(gk.id);
  for (const p of rest) {
    if (bench.length >= 7) break;
    if (!bench.includes(p.id)) bench.push(p.id);
  }
  return bench;
}

// Corrige a escalação do usuário antes do jogo: troca quem está
// lesionado/suspenso/vendido e completa vagas vazias.
// Devolve a lista de mensagens com o que foi alterado.
export function fixLineup(game, club) {
  const slots = FORMATIONS[club.formation];
  const msgs = [];
  if (!club.lineup || club.lineup.length !== slots.length) {
    autoLineup(game, club);
    return ['Escalação montada automaticamente.'];
  }
  const pool = clubPlayers(game, club.id).filter(p => isAvailable(p, club.id));
  const used = new Set();
  club.lineup = club.lineup.map(id => {
    const p = game.players[id];
    if (isAvailable(p, club.id) && !used.has(id)) { used.add(id); return id; }
    if (p) msgs.push(`${p.name} não pode jogar e foi substituído.`);
    return null;
  });
  slots.forEach((slot, i) => {
    if (club.lineup[i]) return;
    const best = pool
      .filter(p => !used.has(p.id))
      .sort((a, b) => effectiveRating(b, slot) - effectiveRating(a, slot))[0];
    if (best) { club.lineup[i] = best.id; used.add(best.id); }
  });
  club.bench = (club.bench || []).filter(id => isAvailable(game.players[id], club.id) && !used.has(id));
  if (club.bench.length < 5) club.bench = autoBench(pool, used);
  return msgs;
}

// Força média dos titulares (para mostrar na tela)
export function teamStrength(game, club) {
  const slots = FORMATIONS[club.formation];
  let s = 0, n = 0;
  (club.lineup || []).forEach((id, i) => {
    const p = game.players[id];
    if (p) { s += effectiveRating(p, slots[i]); n++; }
  });
  return n ? Math.round(s / 11) : 0;
}
