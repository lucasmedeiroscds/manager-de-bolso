// =============================================================
// backup.js — BACKUP DO JOGO (compactado) para guardar fora do app
// =============================================================
// • Compacta o save (fica ~10× menor) e abre o "compartilhar" do
//   celular: dá para mandar para você mesmo no WhatsApp, salvar no
//   Google Drive, e-mail etc. Sem compartilhar: baixa o arquivo.
// • Importar aceita o arquivo compactado (.efc) e o antigo (.json).
// • Lembrete no Início a cada 10 semanas sem backup.
// =============================================================

async function gzip(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).blob();
}
async function gunzip(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export function backupName(game) {
  const uc = game.clubs.find(c => c.id === game.userClubId);
  return `estrategia-fc-${(uc && uc.short) || 'jogo'}-${game.season}-sem${game.round + 1}`;
}

// Devolve 'shared' | 'download' | 'cancel'
export async function exportBackup(game) {
  game.lastBackup = { season: game.season, round: game.round, at: Date.now() };
  const text = JSON.stringify(game);
  const gz = await gzip(text);
  const name = backupName(game) + (gz ? '.efc' : '.json');
  const blob = gz || new Blob([text], { type: 'application/json' });
  const file = new File([blob], name, { type: gz ? 'application/octet-stream' : 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Backup Estratégia FC', text: 'Backup do meu jogo no Estratégia FC' }); return { r: 'shared', size: blob.size }; }
    catch (e) { if (e && e.name === 'AbortError') return { r: 'cancel' }; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { r: 'download', size: blob.size, name };
}

// Abre o seletor e devolve o texto JSON do save
export function pickBackup() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.efc,.json,.gz,application/json,application/octet-stream';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return reject(new Error('Nenhum arquivo escolhido.'));
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        if (buf[0] === 0x1f && buf[1] === 0x8b) resolve(await gunzip(buf));
        else resolve(new TextDecoder().decode(buf));
      } catch (e) { reject(new Error('Arquivo inválido ou corrompido.')); }
    };
    input.click();
  });
}

// Semanas desde o último backup (null = nunca)
export function weeksSinceBackup(game) {
  const b = game.lastBackup;
  if (!b) return null;
  return (game.season - b.season) * 60 + (game.round - b.round);
}
export function needsBackupReminder(game) {
  const w = weeksSinceBackup(game);
  return w == null ? game.round >= 6 || (game.history && game.history.length > 0) : w >= 10;
}
