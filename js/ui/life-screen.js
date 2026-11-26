// =============================================================
// life-screen.js — Vida pessoal: carteira, loja e equipe
// =============================================================
import { esc, money } from '../util.js';
import { ITEMS, SERVICES, life, perks, upkeep, sponsorIncome, netWorth, serviceCost } from '../engine/life.js';

const CATS = [['casa', '🏠 Casas'], ['carro', '🚗 Carros'], ['luxo', '💎 Luxo'], ['equipe', '🧑‍⚕️ Equipe'], ['banco', '🏦 Banco']];

export function lifeScreen(S) {
  const g = S.game, L = life(g), p = g.players[g.pc.id];
  const tab = S.lifeTab || 'casa';
  const pk = perks(g);
  const net = Math.round(p.contract.wage * 0.73);
  const owned = new Set(L.owned.map(o => o.id));
  let body = '';
  if (['casa', 'carro', 'luxo'].includes(tab)) {
    body = `<div class="list">${ITEMS.filter(x => x[1] === tab).map(([id, , emoji, name, price, up, , desc]) => {
      const has = owned.has(id), once = id === 'festa';
      return `<div class="item shop-item ${has ? 'owned' : ''}" style="display:block"><div class="row" style="gap:12px"><span style="font-size:30px">${emoji}</span>
        <div class="grow"><b>${esc(name)}</b><div class="tiny muted">${esc(desc)}</div>
        <div class="small mt"><b>${money(price)}</b>${up ? ` <span class="tiny muted">· manutenção ${money(Math.round(price * up))}/sem</span>` : ''}</div></div></div>
        <div class="mt">${has ? `<span class="tag good">✓ É seu</span> <button class="btn-sm" data-act="lifeSell" data-v="${id}">Vender por ${money(Math.round(price * 0.6))}</button>`
          : `<button class="btn-sm ${L.cash >= price ? 'btn-good' : ''}" data-act="lifeBuy" data-v="${id}" ${L.cash >= price ? '' : 'disabled'}>${once ? 'Fazer a festa' : 'Comprar'}</button>${L.cash < price ? ` <span class="tiny muted">faltam ${money(price - L.cash)}</span>` : ''}`}</div></div>`;
    }).join('')}</div>${tab === 'casa' ? '<p class="tiny muted">Só a melhor moradia conta para o descanso.</p>' : ''}`;
  } else if (tab === 'equipe') {
    body = `<div class="list">${SERVICES.map(([k, emoji, name, cost, desc]) => `<div class="item" style="display:block"><div class="row" style="gap:12px"><span style="font-size:28px">${emoji}</span><div class="grow"><b>${name}</b><div class="tiny muted">${desc}</div><div class="small mt">${money(serviceCost(g, cost))}/semana</div></div>
      <button class="btn-sm ${L.services[k] ? '' : 'btn-good'}" data-act="lifeService" data-v="${k}">${L.services[k] ? 'Dispensar' : 'Contratar'}</button></div></div>`).join('')}</div>`;
  } else {
    body = `<div class="card"><div class="row between"><b>Investimentos</b><b>${money(L.invest)}</b></div>
      <p class="tiny muted">Rende cerca de 8% ao ano. Se a conta ficar negativa, o banco tira daqui.</p>
      <div class="grid2">${[0.25, 0.5, 1].map(f => `<button class="btn-sm" data-act="lifeInvest" data-v="${f}">Investir ${f === 1 ? 'tudo' : Math.round(f * 100) + '%'}</button>`).join('')}<button class="btn-sm" data-act="lifeInvest" data-v="-1">Sacar tudo</button></div></div>
    <h3>Extrato</h3><div class="list">${L.log.length ? L.log.slice(0, 15).map(x => `<div class="item small" style="min-height:40px"><span class="grow">${esc(x.label)}</span><b class="${x.v >= 0 ? 'good' : 'bad'}">${x.v >= 0 ? '+' : ''}${money(x.v)}</b></div>`).join('') : '<div class="item muted small">Sem movimentação ainda.</div>'}</div>`;
  }
  return `<h1>Vida pessoal</h1>
  <div class="card hl">
    <div class="row between"><div><div class="tiny muted">NA CONTA</div><div style="font-size:28px;font-weight:900" class="${L.cash < 0 ? 'bad' : ''}">${money(L.cash)}</div></div>
      <div class="center"><div class="tiny muted">FAMA</div><div style="font-size:24px;font-weight:900">⭐ ${Math.round(L.fame)}</div></div></div>
    <div class="kv mt">
      <div><b>${money(net)}</b><span>Salário líquido/sem</span></div>
      <div><b>${money(sponsorIncome(L))}</b><span>Patrocínio/sem</span></div>
      <div><b class="${upkeep(g) ? 'bad' : ''}">${money(upkeep(g))}</b><span>Gastos/sem</span></div>
      <div><b>${money(netWorth(g))}</b><span>Patrimônio</span></div>
    </div>
    <p class="tiny muted" style="margin-bottom:0">Salário com 27% de impostos e empresário. Vitória e gol rendem bônus. Patrocínio pessoal cresce com a fama.${pk.rest ? ` · Descanso +${pk.rest}` : ''}${pk.xp ? ` · Experiência +${Math.round(pk.xp * 100)}%` : ''}</p>
  </div>
  <div class="chips scroll mb">${CATS.map(([k, l]) => `<button class="chip ${tab === k ? 'on' : ''}" data-act="lifeTab" data-v="${k}">${l}</button>`).join('')}</div>
  ${body}`;
}
