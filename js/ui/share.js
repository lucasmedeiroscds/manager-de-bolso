// =============================================================
// share.js — COMPARTILHAR: cria uma imagem (1080×1350) da sua
// carreira e abre o "compartilhar" do celular (WhatsApp etc.).
// Sem suporte a compartilhar arquivo: baixa a imagem.
// =============================================================
import { coachRecord } from '../engine/records.js';
import { achList } from '../engine/achievements.js';
import { rankingList } from '../engine/ranking.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function careerCard(game) {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d2a5c'); bg.addColorStop(1, '#050f24');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const gold = ctx.createLinearGradient(0, 0, W, 0); gold.addColorStop(0, '#ffe58a'); gold.addColorStop(0.5, '#d79a1e'); gold.addColorStop(1, '#ffd34d');
  ctx.fillStyle = gold; ctx.fillRect(0, 0, W, 14); ctx.fillRect(0, H - 14, W, 14);
  ctx.textAlign = 'center';
  ctx.fillStyle = gold; ctx.font = '900 italic 74px system-ui, sans-serif'; ctx.fillText('ESTRATÉGIA FC', W / 2, 130);
  ctx.fillStyle = '#9fb3d9'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('MINHA CARREIRA', W / 2, 180);

  const c = game.coach, pc = game.mode === 'player' ? game.players[game.pc.id] : null;
  const club = game.clubs.find(x => x.id === (pc ? pc.clubId : game.userClubId));
  const name = pc ? pc.name : (c ? c.name : 'Técnico');
  ctx.fillStyle = '#fff'; ctx.font = '800 72px system-ui, sans-serif'; ctx.fillText(name.slice(0, 22), W / 2, 300);
  ctx.fillStyle = '#ffd34d'; ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText(`${pc ? pc.pos + ' · ' + pc.age + ' anos · ' : ''}${club ? club.name : ''} · ${game.season}`, W / 2, 360);

  // caixas de números
  let stats;
  if (pc) stats = [['Jogos', pc.apps], ['Gols', pc.goals], ['Títulos', (pc.trophies || []).length]];
  else { const r = coachRecord(game); stats = [['Jogos', r.games], ['Vitórias', r.w], ['Títulos', c ? c.trophies.length : 0]]; }
  stats.forEach(([k, v], i) => {
    const x = 90 + i * 310, y = 430;
    ctx.fillStyle = 'rgba(255,255,255,.07)'; roundRect(ctx, x, y, 280, 220, 28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '900 96px system-ui, sans-serif'; ctx.fillText(String(v), x + 140, y + 125);
    ctx.fillStyle = '#9fb3d9'; ctx.font = '700 32px system-ui, sans-serif'; ctx.fillText(k.toUpperCase(), x + 140, y + 182);
  });

  // linhas de destaque
  const lines = [];
  if (!pc && c) {
    const rk = rankingList(game).find(x => x.me);
    if (rk) lines.push(`🌍 ${rk.pos}º no ranking mundial de técnicos`);
    const r = coachRecord(game);
    if (r.bestWin) lines.push(`🔥 Maior goleada: ${r.bestWin.gf} x ${r.bestWin.ga} no ${r.bestWin.opp}`);
    if (c.trophies.length) lines.push(`🏆 ${c.trophies.slice(-2).map(t => t.name + ' ' + t.season).join(' · ')}`);
  }
  const ach = achList(game), got = ach.filter(a => a.got).length;
  lines.push(`🏅 ${got} de ${ach.length} conquistas`);
  if (game.challenge) lines.push(`${game.challenge.emoji} Desafio: ${game.challenge.name}${game.challenge.result === 'win' ? ' — CUMPRIDO!' : ''}`);
  ctx.textAlign = 'left'; ctx.font = '600 38px system-ui, sans-serif';
  lines.slice(0, 5).forEach((l, i) => {
    const y = 760 + i * 100;
    ctx.fillStyle = 'rgba(255,255,255,.05)'; roundRect(ctx, 90, y - 62, W - 180, 84, 20); ctx.fill();
    ctx.fillStyle = '#e8eefc'; ctx.fillText(l.length > 44 ? l.slice(0, 43) + '…' : l, 120, y - 6);
  });
  ctx.textAlign = 'center'; ctx.fillStyle = '#9fb3d9'; ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillText('lucasmedeiroscds.github.io/manager-de-bolso', W / 2, H - 50);
  return cv;
}

export async function shareCareer(game) {
  const cv = careerCard(game);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const file = new File([blob], 'estrategia-fc.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Estratégia FC', text: 'Olha a minha carreira no Estratégia FC! ⚽' }); return 'shared'; }
    catch { return 'cancel'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'estrategia-fc.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'download';
}
