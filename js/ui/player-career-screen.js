// =============================================================
// player-career-screen.js — telas do modo carreira como jogador
// =============================================================
import { esc, money } from '../util.js';
import { icon } from './icons.js';
import { badge, bar, ring } from './ui.js';
import { overall } from '../engine/ratings.js';
import { pcPlayer, starterClubs } from '../engine/player-career.js';
import { callUp } from '../engine/nations.js';
import { windowOpen } from '../engine/market.js';

const POS = [['GOL', 'Goleiro'], ['ZAG', 'Zagueiro'], ['LAT', 'Lateral'], ['VOL', 'Volante'], ['MEI', 'Meia'], ['ATA', 'Atacante']];
const ATTRS = [['fin', 'Finalização'], ['pas', 'Passe'], ['def', 'Defesa'], ['for', 'Força'], ['res', 'Resistência'], ['gk', 'Goleiro']];
const NATS = [['Brasil', 'Brasil'], ['Argentina', 'Argentina'], ['Portugal', 'Portugal'], ['Espanha', 'Espanha'], ['Inglaterra', 'Inglaterra'], ['Itália', 'Itália'], ['Alemanha', 'Alemanha'], ['França', 'França'], ['Uruguai', 'Uruguai'], ['Colômbia', 'Colômbia']];

// ---------- Criação do jogador ----------
export function newPlayerScreen(S) {
  const np = S.np || (S.np = { pos: 'ATA', nat: 'Brasil', name: '' });
  const db = S.db;
  // clubes iniciais: os mais modestos do país (se houver liga dele)
  const country = db && db.leagues && db.leagues.some(l => l.country === np.nat) ? np.nat : null;
  const clubs = db ? starterClubs(db, country) : [];
  return `<div class="row between"><h1>Carreira de jogador</h1><button class="btn-sm" data-act="go" data-to="start">‹ Voltar</button></div>
  <p class="small muted">Crie um garoto de 17 anos e leve-o do time pequeno até a Seleção.</p>
  <div class="card">
    <label>Nome do jogador</label><input id="np-name" maxlength="28" placeholder="Ex.: Lucas Medeiros" value="${esc(np.name)}" data-change="npName">
    <label class="mt">Posição</label>
    <div class="chips">${POS.map(([k, l]) => `<button class="chip ${np.pos === k ? 'on' : ''}" data-act="npSet" data-k="pos" data-v="${k}">${l}</button>`).join('')}</div>
    <label class="mt">Nacionalidade</label>
    <div class="chips">${NATS.map(([k, l]) => `<button class="chip ${np.nat === k ? 'on' : ''}" data-act="npSet" data-k="nat" data-v="${k}">${l}</button>`).join('')}</div>
  </div>
  <h3>Escolha o clube onde começar</h3>
  <p class="tiny muted">Clubes modestos${country ? ' do seu país' : ''}: mais chance de jogar cedo.</p>
  <div class="list">${clubs.map(c => `<div class="item tap" data-act="npStart" data-id="${esc(c.id)}">${badge(c)}<span class="grow"><b>${esc(c.name)}</b><div class="tiny muted">Reputação ${c.rep}</div></span>${icon('chevron', 18, 'chev')}</div>`).join('') || '<div class="item muted">Carregando clubes…</div>'}</div>`;
}

// ---------- Cartão no Início ----------
export function pcCard(S) {
  const g = S.game, pc = g.pc, p = pcPlayer(g);
  const ovr = overall(p);
  return `<div class="card tap-card pc-card" data-act="go" data-to="pcareer">
    <div class="row between"><div class="row" style="gap:10px"><div class="pc-ovr">${ovr}</div>
      <div><b>${esc(p.name)}</b><div class="tiny muted">${p.pos} · ${p.age} anos · <span class="${pc.role === 'Titular' ? 'good' : pc.role === 'Reserva' ? 'warn' : 'bad'}">${pc.role}</span></div></div></div>${icon('chevron', 18, 'chev')}</div>
    <div class="mini-meters">
      <div><span class="tiny muted">CONFIANÇA DO TÉCNICO</span><div class="bar"><i style="width:${pc.trust}%;background:${pc.trust >= 65 ? 'var(--good)' : pc.trust >= 35 ? 'var(--warn)' : 'var(--bad)'}"></i></div></div>
      <div><span class="tiny muted">EXPERIÊNCIA</span><div class="bar"><i style="width:${pc.xp}%"></i></div></div>
    </div>
    ${pc.pts ? `<div class="tag good" style="margin-top:10px;display:inline-block">🎯 ${pc.pts} ponto(s) de treino</div>` : ''}
    ${pc.offers.length ? `<div class="tag warn" style="margin-top:10px;display:inline-block">📨 ${pc.offers.length} proposta(s)</div>` : ''}
  </div>`;
}

// ---------- Tela Carreira ----------
export function pcareerScreen(S) {
  const g = S.game, pc = g.pc, p = pcPlayer(g);
  const club = g.clubs.find(c => c.id === p.clubId);
  const ovr = overall(p);
  const ss = p.ss;
  const avg = pc.ratings.length ? pc.ratings.reduce((s, x) => s + x, 0) / pc.ratings.length : null;
  const squad = p.nat ? callUp(g, p.nat) : [];
  const called = squad.some(x => x.id === p.id);
  const rank = squad.length ? Object.values(g.players).filter(x => x.nat === p.nat && x.pos === p.pos && x.clubId).sort((a, b) => overall(b) - overall(a)).findIndex(x => x.id === p.id) + 1 : 0;
  const attrs = ATTRS.filter(([k]) => k !== 'gk' || p.pos === 'GOL');
  return `<h1>Carreira</h1>
  <div class="card hl">
    <div class="row" style="gap:12px">${badge(club, 'lg')}<div class="grow"><h2 style="margin:0">${esc(p.name)}</h2>
      <div class="small muted">${p.pos} · ${p.age} anos · ${esc(p.nat || '')} · ${esc(club.name)}</div>
      <div class="small">Contrato: ${money(p.contract.wage)}/sem · ${p.contract.years} ano(s)</div></div>
      <div class="center"><div class="pc-ovr big">${ovr}</div><div class="tiny muted">pot. ${p.potential}</div></div></div>
    <div class="attr mt"><span class="small">Confiança do técnico</span>${bar(Math.round(pc.trust), 100)}<b class="right">${Math.round(pc.trust)}</b></div>
    <p class="tiny muted" style="margin:2px 0 0">Situação: <b>${pc.role}</b>. Acima de 65 você vira titular; abaixo de 30, perde a vaga. Notas boas aumentam a confiança.</p>
  </div>
  <div class="kv mb">
    <div><b>${ss ? ss.j : 0}</b><span>Jogos (temp.)</span></div>
    <div><b>${ss ? ss.g : 0}</b><span>Gols (temp.)</span></div>
    <div><b>${ss ? ss.a : 0}</b><span>Assist. (temp.)</span></div>
    <div><b>${avg ? avg.toFixed(2) : '—'}</b><span>Nota recente</span></div>
    <div><b>${p.goals}</b><span>Gols carreira</span></div>
    <div><b>${p.apps}</b><span>Jogos carreira</span></div>
  </div>

  <div class="section-title"><h3>${icon('bolt', 15)} Treino</h3><span class="tag ${pc.pts ? 'good' : ''}">${pc.pts} ponto(s)</span></div>
  <div class="card">
    <div class="attr"><span class="small">Experiência</span>${bar(pc.xp, 100)}<b class="right">${pc.xp}/100</b></div>
    ${attrs.map(([k, l]) => `<div class="pc-train"><span class="small">${l}</span>${bar(p.attrs[k], 99)}<b>${p.attrs[k]}</b><button class="btn-sm" data-act="pcTrain" data-v="${k}" ${pc.pts ? '' : 'disabled'}>+1</button></div>`).join('')}
    <p class="tiny muted" style="margin-bottom:0">Cada jogo dá experiência (mais com nota alta, gols e assistências). A cada 100, 1 ponto de treino. O teto é o seu potencial (${p.potential}).</p>
  </div>

  <div class="section-title"><h3>${icon('news', 15)} Propostas</h3>${windowOpen(g) ? '<span class="tag good">janela aberta</span>' : '<span class="tag">janela fechada</span>'}</div>
  <div class="list">${pc.offers.length ? pc.offers.map(o => {
    const c = g.clubs.find(x => x.id === o.clubId);
    return `<div class="item" style="display:block"><div class="row" style="gap:8px">${badge(c)}<b class="grow">${o.renew ? 'Renovação com o ' : ''}${esc(c.name)}</b><span class="tag">${esc(o.role)}</span></div>
      <div class="small mt">Salário <b>${money(o.wage)}/sem</b> · ${o.years} anos${o.fee ? ` · o clube paga ${money(o.fee)}` : ''}</div>
      <div class="grid2 mt"><button class="btn-sm btn-good" data-act="pcAccept" data-id="${esc(o.clubId)}">Aceitar</button><button class="btn-sm" data-act="pcReject" data-id="${esc(o.clubId)}">Recusar</button></div></div>`;
  }).join('') : '<div class="item muted small">Nenhuma proposta agora. Jogue bem e elas aparecem!</div>'}</div>
  <button class="btn-block btn-sm mt" data-act="pcRequest">${icon('swap', 15)} Pedir para ser negociado</button>
  <p class="tiny muted">Pedir transferência irrita um pouco o técnico (confiança −8).</p>

  <div class="section-title"><h3>${icon('globe', 15)} Seleção</h3></div>
  <div class="card small">${called ? `🧢 <b class="good">Você está entre os convocados da seleção ${esc(p.nat)}!</b>` : `Você é o <b>${rank || '—'}º</b> melhor ${p.pos} de ${esc(p.nat || '')} no jogo. Os melhores de cada posição são convocados.`}
    ${p.trophies && p.trophies.length ? `<div class="mt">${p.trophies.slice().reverse().map(t => `<div>${icon('medal', 14)} ${esc(t)}</div>`).join('')}</div>` : ''}</div>

  <div class="section-title"><h3>${icon('list', 15)} Últimos jogos</h3></div>
  <div class="list">${pc.log.length ? pc.log.slice(0, 10).map(l => `<div class="item small" style="min-height:40px"><span class="grow">vs ${esc(l.vs)} <span class="tiny muted">· ${l.season}</span></span>${l.g ? `⚽${l.g > 1 ? '×' + l.g : ''} ` : ''}${l.a ? `👟${l.a > 1 ? '×' + l.a : ''} ` : ''}<b class="${l.r >= 7.5 ? 'good' : l.r < 5.8 ? 'bad' : ''}">${l.r.toFixed(1)}</b></div>`).join('') : '<div class="item muted small">Você ainda não entrou em campo.</div>'}</div>`;
}

// ---------- Lance decisivo (durante a partida) ----------
export function pcMomentModal(S) {
  const p = pcPlayer(S.game);
  const opt = (v, ic, t, d) => `<button class="talk-opt" data-act="pcPick" data-v="${v}"><span class="ic-box">${icon(ic, 20)}</span><span class="grow" style="text-align:left"><b>${t}</b><span class="small muted" style="display:block">${d}</span></span></button>`;
  return `<div class="center"><div class="pc-ovr big" style="margin:0 auto 8px">${overall(p)}</div>
    <h2 style="margin:0">Sua jogada!</h2><p class="small muted">${esc(p.name)} recebe a bola perto da área. O que fazer?</p></div>
    <div class="talk-list">
      ${opt('colocado', 'target', 'Chute colocado', 'Mais chance de acertar o gol.')}
      ${opt('forte', 'fire', 'Chute forte', 'Mais difícil de defender, mas pode ir para fora.')}
      ${opt('driblar', 'bolt', 'Driblar o marcador', 'Se passar, chuta em ótima posição. Se errar, perde a bola.')}
      ${opt('passar', 'users', 'Passar para um companheiro', 'Ele finaliza melhor posicionado. Vale assistência.')}
    </div>`;
}
