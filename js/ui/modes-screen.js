// =============================================================
// modes-screen.js — Desafios e Ranking de técnicos
// =============================================================
import { esc } from '../util.js';
import { icon } from './icons.js';
import { badge } from './ui.js';
import { CHALLENGES, challengeClub } from '../engine/modes.js';
import { rankingList } from '../engine/ranking.js';

export function challengesScreen(S) {
  const db = S.db;
  const real = db && S.dbKind === 'world';
  return `<div class="row between"><h1>Desafios</h1><button class="btn-sm" data-act="go" data-to="start">‹ Voltar</button></div>
  <p class="small muted">Situações prontas, com uma meta para a temporada. Cumpra e ganhe a medalha do desafio.</p>
  ${real ? '' : '<div class="card small warn">Os desafios usam os clubes reais. Escolha "🌍 Mundo real" na tela inicial.</div>'}
  <div class="list">${CHALLENGES.map(ch => {
    const c = real ? challengeClub(db, ch.id) : null;
    return `<div class="item ${c ? 'tap' : ''}" ${c ? `data-act="startChallenge" data-v="${ch.id}"` : 'style="opacity:.5"'} style="display:block">
      <div class="row" style="gap:12px"><span style="font-size:34px">${ch.emoji}</span><div class="grow"><b>${esc(ch.name)}</b><div class="small muted">${esc(ch.desc)}</div>
      ${c ? `<div class="row tiny mt" style="gap:6px">${badge(c, 'sm')} <b>${esc(c.name)}</b></div>` : ''}</div>${c ? icon('chevron', 18, 'chev') : ''}</div></div>`;
  }).join('')}</div>`;
}

export function challengeBanner(g) {
  const ch = g.challenge;
  if (!ch) return '';
  const st = ch.result === 'win' ? '<span class="tag good">CUMPRIDO</span>' : ch.result === 'fail' ? '<span class="tag bad">PERDIDO</span>' : `<span class="tag warn">até o fim de ${ch.season}</span>`;
  return `<div class="challenge-line"><span style="font-size:22px">${ch.emoji}</span><div class="grow"><div class="tiny muted">DESAFIO · ${esc(ch.name)}</div><b class="small">${esc(ch.goal.text)}</b></div>${st}</div>`;
}

export function rankingScreen(S) {
  const g = S.game;
  const list = rankingList(g);
  const me = list.find(x => x.me);
  const top = list.slice(0, 30);
  const row = x => `<div class="item small ${x.me ? 'rank-me' : ''}" style="min-height:46px"><span class="rank ${x.pos <= 3 ? 'top' : ''}">${x.pos}</span>${x.club ? badge(x.club, 'sm') : ''}<span class="grow ellipsis"><b>${esc(x.name)}</b>${x.me ? ' <span class="tag good">você</span>' : ''}</span><b>${Math.round(x.pts)}</b></div>`;
  return `<div class="row between"><h1>Ranking de técnicos</h1><button class="btn-sm" data-act="go" data-to="more">‹ Mais</button></div>
  ${me ? `<div class="card hl center"><div class="tiny muted">SUA POSIÇÃO NO MUNDO</div><div style="font-size:44px;font-weight:900">${me.pos}º</div><div class="small muted">${Math.round(me.pts)} pontos</div></div>` : ''}
  <p class="tiny muted">Pontos por posição na liga (ligas mais fortes valem mais) e por títulos. Pontos antigos valem menos a cada temporada. Os técnicos da IA aparecem pelo clube.${g.history && g.history.length ? '' : ' Até a primeira temporada acabar, a ordem segue a força dos clubes.'}</p>
  <div class="list">${top.map(row).join('')}${me && me.pos > 30 ? `<div class="item tiny muted center">…</div>${row(me)}` : ''}</div>
  <button class="btn-block btn-sm mt" data-act="shareCareer">${icon('share', 16)} Compartilhar minha carreira</button>`;
}
