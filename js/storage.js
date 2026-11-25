// =============================================================
// storage.js — salvar e carregar jogos no próprio aparelho
// =============================================================
// O jogo com o mundo inteiro tem ~6 MB: grande demais para o
// localStorage (limite ~5 MB). Por isso o jogo vai para o IndexedDB
// (um banco de dados do navegador, sem limite apertado) e só um
// resumo (nome do clube, data) fica no localStorage.
// Dica: use "Exportar jogo" de vez em quando para ter um backup.
// =============================================================
import { SAVE_VERSION } from './engine/season.js';
import { initCoach } from './engine/career.js';

const META = 'brasfoot_meta_';
export const SLOTS = ['auto', '1', '2', '3'];

// ---------- IndexedDB (com fallback para localStorage) ----------
let dbPromise = null;
function idb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('sem IndexedDB'));
    const req = indexedDB.open('manager-de-bolso', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function kvSet(key, value) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch {
    try { localStorage.setItem('brasfoot_kv_' + key, value); return true; } catch { return false; }
  }
}
async function kvGet(key) {
  try {
    const db = await idb();
    const v = await new Promise((res, rej) => {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    if (v != null) return v;
  } catch { /* tenta o localStorage */ }
  try { return localStorage.getItem('brasfoot_kv_' + key); } catch { return null; }
}
async function kvDel(key) {
  try {
    const db = await idb();
    db.transaction('kv', 'readwrite').objectStore('kv').delete(key);
  } catch { /* ignora */ }
  try { localStorage.removeItem('brasfoot_kv_' + key); } catch { /* ignora */ }
}

// ---------- Jogos salvos ----------
export async function saveGame(game, slot = 'auto') {
  const uc = game.clubs.find(c => c.id === game.userClubId);
  const ok = await kvSet('save_' + slot, JSON.stringify(game));
  if (ok) {
    try {
      localStorage.setItem(META + slot, JSON.stringify({
        savedAt: new Date().toISOString(), label: `${uc.name} — ${game.season}, semana ${game.round + 1}`
      }));
    } catch { /* sem resumo, sem problema */ }
  }
  return ok;
}

// Resumo do espaço (rápido, sem abrir o jogo inteiro)
export function slotInfo(slot) {
  try {
    const t = localStorage.getItem(META + slot);
    if (t) return JSON.parse(t);
    // jogo salvo pela versão 1 (ficava inteiro no localStorage)
    const old = localStorage.getItem('brasfoot_slot_' + slot);
    if (old) { const d = JSON.parse(old); return { savedAt: d.savedAt, label: d.label + ' (versão antiga)' }; }
  } catch { /* ignora */ }
  return null;
}

export async function loadGame(slot) {
  let raw = await kvGet('save_' + slot);
  try {
    if (!raw) {
      const old = localStorage.getItem('brasfoot_slot_' + slot);
      if (!old) return null;
      return migrate(JSON.parse(old).game);
    }
    return migrate(JSON.parse(raw));
  } catch { return null; }
}

export async function deleteSlot(slot) {
  await kvDel('save_' + slot);
  try { localStorage.removeItem(META + slot); } catch { /* ignora */ }
}

// Banco de dados importado pelo usuário (para os próximos "Novo jogo")
export async function saveCustomDB(db) { return kvSet('custom_db', JSON.stringify(db)); }
export async function loadCustomDB() {
  const t = await kvGet('custom_db');
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}
export async function deleteCustomDB() { return kvDel('custom_db'); }

// Para jogos salvos em versões antigas
export function migrate(game) {
  if (!game || !game.clubs || !game.players) throw new Error('Arquivo de jogo inválido.');
  if (!game.leagues) {
    // versão 1: uma liga só, calendário em game.fixtures
    game.leagues = [{ id: 'L1', name: game.dbName || 'Liga', country: 'Brasil', continent: 'América do Sul',
      clubIds: game.clubs.map(c => c.id), fixtures: game.fixtures || [] }];
    for (const c of game.clubs) c.leagueId = 'L1';
    delete game.fixtures;
  }
  for (const c of game.clubs) { c.marking = c.marking || 'Média'; c.focus = c.focus || 'Geral'; }
  // Jogos salvos antes das copas: as copas começam na próxima temporada
  if (!game.cups) { game.cups = []; game.cupWeekDone = -1; }
  // Jogos salvos antes da carreira do técnico
  if (!game.coach) initCoach(game, 'Técnico');
  game.version = SAVE_VERSION;
  game.inbox = game.inbox || [];
  game.news = game.news || [];
  game.ledger = game.ledger || [];
  game.history = game.history || [];
  game.nextPlayerId = game.nextPlayerId || 1;
  return game;
}

// Baixa um arquivo (backup do jogo, banco de dados, CSV)
export function downloadFile(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// Abre o seletor de arquivos e devolve o texto do arquivo escolhido.
// Se o arquivo não for UTF-8 (CSV salvo pelo Excel), relê como Windows-1252.
export function pickFile(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return reject(new Error('Nenhum arquivo escolhido.'));
      const r = new FileReader();
      r.onload = () => {
        const txt = r.result;
        if (txt.includes('�')) {
          const r2 = new FileReader();
          r2.onload = () => resolve({ name: file.name, text: r2.result });
          r2.readAsText(file, 'windows-1252');
        } else resolve({ name: file.name, text: txt });
      };
      r.onerror = () => reject(r.error);
      r.readAsText(file, 'utf-8');
    };
    input.click();
  });
}
