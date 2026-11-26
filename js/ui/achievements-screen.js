// =============================================================
// achievements-screen.js — Conquistas
// =============================================================
import { esc } from '../util.js';
import { achList, checkAchievements } from '../engine/achievements.js';

export function achievementsScreen(S) {
  checkAchievements(S.game);   // saves antigos: marca o que já foi feito
  const list = achList(S.game);
  const n = list.filter(a => a.got).length;
  return `<div class="row between"><h1>Conquistas</h1><button class="btn-sm" data-act="go" data-to="more">‹ Mais</button></div>
  <div class="card hl center"><div style="font-size:30px">🏅</div><h2 style="margin:4px 0">${n} de ${list.length}</h2>
    <div class="bar"><i style="width:${Math.round(n / list.length * 100)}%"></i></div></div>
  <div class="ach-grid">${list.map(a => `<div class="ach ${a.got ? 'on' : ''}"><div class="ach-ic">${a.got ? a.emoji : '🔒'}</div><b>${esc(a.name)}</b><div class="tiny muted">${esc(a.desc)}</div>${a.got ? `<div class="tiny good">✓ ${a.got.season}</div>` : ''}</div>`).join('')}</div>`;
}
