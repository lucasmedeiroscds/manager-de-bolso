// =============================================================
// awards-screen.js — Prêmios: corrida ao vivo e premiações passadas
// =============================================================
import { esc } from '../util.js';
import { standings, userLeague } from '../engine/season.js';
import { leagueAwards, worldAwards, titleBonus } from '../engine/awards.js';
import { clubById } from '../engine/market.js';
import { badge, posTag } from './ui.js';
import { flag } from './screens.js';

function personRow(g, e, label, extra = '') {
  if (!e) return '';
  const c = e.clubId ? clubById(g, e.clubId) : null;
  return `<div class="item tap" data-act="player" data-id="${e.id}">
    ${c ? badge(c, 'sm') : ''}
    <div class="grow"><div class="tiny muted">${label}</div><b>${esc(e.name)}</b>
      <div class="small muted">${esc(e.club)} · ${e.pos}${e.nat ? ' · ' + esc(e.nat) : ''}</div></div>
    <div class="right small">${extra}</div>
  </div>`;
}

function leagueBlock(g, a) {
  if (!a) return '<p class="muted">Ainda sem jogos suficientes para a premiação.</p>';
  return `<div class="list">
    ${personRow(g, a.mvp, '🏅 Melhor jogador', `nota <b>${a.mvp.avg}</b><br>${a.mvp.lg} gols`)}
    ${personRow(g, a.top, '👟 Artilheiro', `<b>${a.top ? a.top.lg : 0}</b> gols`)}
    ${personRow(g, a.young, '🌟 Melhor jovem (até 21)', a.young ? `nota <b>${a.young.avg}</b>` : '')}
    ${personRow(g, a.gk, '🧤 Melhor goleiro', a.gk ? `nota <b>${a.gk.avg}</b>` : '')}
  </div>
  <h3>Seleção do campeonato (4-3-3)</h3>
  <div class="list">${a.team.map(e => `<div class="item tap" data-act="player" data-id="${e.id}" style="min-height:44px">${posTag(e.pos)}
    <div class="grow ellipsis"><b>${esc(e.name)}</b> <span class="small muted">${esc(e.club)}</span></div><span class="small">${e.avg}</span></div>`).join('')}</div>`;
}

function worldBlock(g, list) {
  if (!list || !list.length) return '<p class="muted">Ainda sem jogos suficientes.</p>';
  const medal = ['🥇', '🥈', '🥉'];
  const podium = list.slice(0, 3).map((e, i) => {
    const c = e.clubId ? clubById(g, e.clubId) : null;
    return `<div class="podium p${i + 1} tap" data-act="player" data-id="${e.id}">
      <div style="font-size:28px">${medal[i]}</div>${c ? badge(c) : ''}
      <b class="small">${esc(e.name)}</b><span class="tiny muted">${esc(e.club)}</span><span class="tiny">nota ${e.avg} · ${e.g} gols</span></div>`;
  });
  // ordem visual do pódio: 2º, 1º, 3º
  return `<div class="podium-row">${[podium[1] || '', podium[0], podium[2] || ''].join('')}</div>
  <div class="list mt">${list.slice(3).map((e, i) => `<div class="item tap" data-act="player" data-id="${e.id}" style="min-height:44px">
    <b style="width:22px">${i + 4}º</b><div class="grow ellipsis"><b>${esc(e.name)}</b> <span class="small muted">${esc(e.club)}</span></div>
    <span class="small">${e.avg} · ${e.g}g</span></div>`).join('')}</div>`;
}

export function awardsScreen(S) {
  const g = S.game;
  const view = S.params.view || 'race';
  const lid = S.params.league || userLeague(g).id;
  const L = g.leagues.find(l => l.id === lid);
  const tabs = `<div class="tabs">
    <button class="${view === 'race' ? 'on' : ''}" data-act="go" data-to="awards" data-view="race" data-league="${esc(lid)}">Corrida ${g.season}</button>
    <button class="${view === 'past' ? 'on' : ''}" data-act="go" data-to="awards" data-view="past" data-league="${esc(lid)}">Premiações</button>
  </div>`;
  const leagueSel = `<select class="mb" data-change="awardsLeague">${g.leagues.slice().sort((a, b) => a.country.localeCompare(b.country))
    .map(l => `<option value="${esc(l.id)}" ${l.id === lid ? 'selected' : ''}>${flag(l.country)} ${esc(l.country)} — ${esc(l.name)}</option>`).join('')}</select>`;
  let body = '';
  if (view === 'race') {
    // Corrida ao vivo: quem lidera AGORA (muda a cada rodada)
    const played = Math.min(g.round, L.fixtures.length);
    const table = standings(g, lid).map(s => s.id);
    const la = played ? leagueAwards(g, L, table, played) : null;
    const world = g.round ? worldAwards(g, titleBonus(g, {}), g.round) : [];
    body = `<p class="small muted">Quem lidera agora. A premiação oficial acontece no fim da temporada.</p>
      <h2>🌍 Melhor do Mundo — parcial</h2>${worldBlock(g, world)}
      <h2 class="mt">${flag(L.country)} ${esc(L.name)} — parcial</h2>${leagueSel}${leagueBlock(g, la)}`;
  } else {
    const hist = g.awards || [];
    if (!hist.length) body = '<p class="muted">A primeira premiação acontece no fim desta temporada.</p>';
    else {
      const season = Number(S.params.season || hist[0].season);
      const aw = hist.find(h => h.season === season) || hist[0];
      body = `<select class="mb" data-change="awardsSeason">${hist.map(h => `<option ${h.season === aw.season ? 'selected' : ''}>${h.season}</option>`).join('')}</select>
        <h2>🌍 Melhor do Mundo ${aw.season}</h2>${worldBlock(g, aw.world)}
        <h2 class="mt">${flag(L.country)} ${esc(L.name)} ${aw.season}</h2>${leagueSel}${leagueBlock(g, aw.leagues[lid])}`;
    }
  }
  return `<div class="row between"><h1>🏅 Prêmios</h1><button class="btn-sm" data-act="go" data-to="more">‹ Mais</button></div>${tabs}${body}`;
}

// Bloco da cerimônia no fim da temporada (resumo)
export function ceremonyBlock(g, awards) {
  if (!awards) return '';
  const a = awards.league, w = awards.world || [];
  return `<div class="card hl">
    <h2 class="center">🎉 Premiação da temporada</h2>
    ${w[0] ? `<p class="center">🌍 <b>MELHOR DO MUNDO:</b><br><span style="font-size:20px"><b>${esc(w[0].name)}</b></span><br><span class="small muted">${esc(w[0].club)} · nota ${w[0].avg} · ${w[0].g} gols</span></p>
      <p class="center small">🥈 ${esc(w[1] ? w[1].name : '-')} &nbsp; 🥉 ${esc(w[2] ? w[2].name : '-')}</p>` : ''}
    ${a ? `<div class="list">
      ${personRow(g, a.mvp, '🏅 Melhor jogador da liga', `nota <b>${a.mvp.avg}</b>`)}
      ${personRow(g, a.top, '👟 Artilheiro', `<b>${a.top ? a.top.lg : 0}</b> gols`)}
      ${personRow(g, a.young, '🌟 Melhor jovem', '')}
      ${personRow(g, a.gk, '🧤 Melhor goleiro', '')}
    </div>` : ''}
    <button class="btn-block btn-sm mt" data-act="go" data-to="awards" data-view="past">Ver premiação completa</button>
  </div>`;
}
