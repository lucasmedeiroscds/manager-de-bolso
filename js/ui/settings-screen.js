// =============================================================
// settings-screen.js — Aparência e som
// =============================================================
import { esc } from '../util.js';
import { icon } from './icons.js';
import { themeFor } from './theme.js';
import { badge } from './ui.js';

export function settingsScreen(S) {
  const st = S.settings;
  const uc = S.game ? S.game.clubs.find(c => c.id === S.game.userClubId) : null;
  const preview = uc ? themeFor(uc) : null;
  const chip = (k, v, l) => `<button class="chip ${String(st[k]) === String(v) ? 'on' : ''}" data-act="setSetting" data-k="${k}" data-v="${v}">${l}</button>`;
  return `
  <div class="row between"><h1 style="margin:0">Aparência e som</h1><button class="btn-sm" data-act="go" data-to="${S.game ? 'more' : 'start'}">${icon('back', 16)} Voltar</button></div>

  <div class="section-title"><h3>${icon('palette', 15)} Tema</h3></div>
  <div class="card">
    <div class="chips">${chip('theme', 'club', 'Cores do meu clube')}${chip('theme', 'default', 'Padrão (azul e dourado)')}</div>
    ${uc ? `<div class="row mt" style="gap:12px">${badge(uc, 'lg')}
      <div class="grow"><b>${esc(uc.name)}</b><div class="small muted">Destaque do tema: <span class="swatch" style="background:${preview.accent}"></span> ${preview.accent}</div>
      <div class="tiny muted">A cor é ajustada para ficar legível no fundo escuro. Clubes preto e branco ficam com destaque prateado.</div></div></div>` :
      '<p class="small muted mt">O tema do clube aparece depois que você escolhe um clube.</p>'}
  </div>

  <div class="section-title"><h3>${icon('sound', 15)} Som</h3></div>
  <div class="card">
    <label>Efeitos (apito, chute, cartão, cliques)</label>
    <div class="chips">${chip('sfx', 'true', 'Ligados')}${chip('sfx', 'false', 'Desligados')}</div>
    <label>Torcida (ambiente, gol, "uuuh")</label>
    <div class="chips">${chip('crowd', 'true', 'Ligada')}${chip('crowd', 'false', 'Desligada')}</div>
    <label>Volume</label>
    <div class="row"><input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-change="volume"><b class="num" id="vol-v" style="min-width:44px;text-align:right">${Math.round(st.volume * 100)}%</b></div>
    <div class="btn-row mt">
      <button class="btn-sm" data-act="testSound" data-v="whistle">${icon('whistle', 15)} Apito</button>
      <button class="btn-sm" data-act="testSound" data-v="goal">${icon('trophy', 15)} Gol</button>
      <button class="btn-sm" data-act="testSound" data-v="ooh">${icon('users', 15)} Torcida</button>
    </div>
    <p class="tiny muted mt">Os sons são gerados pelo próprio jogo (sem arquivos), funcionam offline e não gastam internet. No celular, o som respeita o volume e o modo silencioso do aparelho.</p>
  </div>`;
}
