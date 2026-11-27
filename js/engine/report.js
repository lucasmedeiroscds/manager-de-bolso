// =============================================================
// report.js — RELATÓRIO DO ADVERSÁRIO (feito pelo auxiliar técnico)
// =============================================================
// Quanto melhor o AUXILIAR TÉCNICO (comissão técnica), mais completo:
//  nível 0: só formação e fase;
//  nível 1: + estilo, marcação e os 3 melhores jogadores;
//  nível 2: + setor mais fraco/forte e sugestões de tática;
//  nível 3: + artilheiro, perigo na bola parada e desfalques.
// A sugestão pode ser aplicada com um toque.
// =============================================================
import { overall } from './ratings.js';
import { staffLevel } from './staff.js';
import { clubById } from './market.js';
import { headerScore } from './setpieces.js';

const SECT = { def: ['ZAG', 'LAT'], mid: ['VOL', 'MEI'], att: ['ATA'] };
const SECT_NAME = { def: 'defesa', mid: 'meio-campo', att: 'ataque' };

function form(game, cid, n = 5) {
  const l = game.leagues.find(x => x.clubIds.includes(cid));
  const out = [];
  if (!l) return out;
  for (let r = game.round - 1; r >= 0 && out.length < n; r--) {
    const f = (l.fixtures[r] || []).find(x => (x.h === cid || x.a === cid) && x.r);
    if (!f) continue;
    const my = f.h === cid ? f.r.hg : f.r.ag, ot = f.h === cid ? f.r.ag : f.r.hg;
    out.unshift(my > ot ? 'V' : my < ot ? 'D' : 'E');
  }
  return out;
}
function sectors(game, club) {
  const xi = (club.lineup || []).map(id => game.players[id]).filter(Boolean);
  const s = {};
  for (const k in SECT) { const ps = xi.filter(p => SECT[k].includes(p.pos)); s[k] = ps.length ? ps.reduce((a, p) => a + overall(p), 0) / ps.length : 0; }
  return s;
}

export function opponentReport(game, opp) {
  const me = clubById(game, game.userClubId);
  const lvl = staffLevel(game, me.id, 'aux');
  const r = { lvl, club: opp, formation: opp.formation, form: form(game, opp.id) };
  if (lvl >= 1) {
    r.style = opp.style; r.marking = opp.marking; r.focus = opp.focus;
    r.best = (opp.lineup || []).map(id => game.players[id]).filter(Boolean).sort((a, b) => overall(b) - overall(a)).slice(0, 3);
  }
  if (lvl >= 2) {
    const so = sectors(game, opp), sm = sectors(game, me);
    const ks = Object.keys(SECT).filter(k => so[k] > 0);
    r.weak = ks.sort((a, b) => so[a] - so[b])[0]; r.strong = ks[ks.length - 1];
    r.sect = so; r.mySect = sm;
    // sugestões
    const tips = [], apply = {};
    if (r.weak === 'def') { tips.push('A defesa deles é o ponto fraco: vale atacar mais.'); apply.style = 'Ofensivo'; }
    if (r.strong === 'att' || opp.style === 'Ofensivo') { tips.push('Eles atacam muito: marcação pesada ajuda a segurar.'); apply.marking = 'Pesada'; }
    if (opp.style === 'Pressão alta' || opp.style === 'Ofensivo') { tips.push('Time que se lança deixa espaço atrás: o contra-ataque funciona.'); apply.style = apply.style || 'Contra-ataque'; }
    if (r.weak === 'mid') { tips.push('Meio-campo fraco: o toque de bola pode dominar o jogo.'); apply.style = apply.style || 'Toque de bola'; }
    const wide = (opp.lineup || []).map(id => game.players[id]).filter(p => p && p.pos === 'LAT');
    const center = (opp.lineup || []).map(id => game.players[id]).filter(p => p && p.pos === 'ZAG');
    const avg = l => l.length ? l.reduce((a, p) => a + overall(p), 0) / l.length : 99;
    if (avg(wide) + 3 < avg(center)) { tips.push('Os laterais deles são mais fracos que os zagueiros: ataque pelas pontas.'); apply.focus = 'Pelas laterais'; }
    else if (avg(center) + 3 < avg(wide)) { tips.push('Zagueiros mais fracos que os laterais: concentre pelo meio.'); apply.focus = 'Pelo meio'; }
    if (!tips.length) tips.push('Time equilibrado. Mantenha o seu plano.');
    r.tips = tips; r.apply = apply;
  }
  if (lvl >= 3) {
    const sq = Object.values(game.players).filter(p => p.clubId === opp.id);
    r.scorer = sq.slice().sort((a, b) => (b.seasonGoals || 0) - (a.seasonGoals || 0))[0];
    r.header = (opp.lineup || []).map(id => game.players[id]).filter(p => p && p.pos !== 'GOL').sort((a, b) => headerScore(b) - headerScore(a))[0];
    r.out = sq.filter(p => p.injury > 0 || p.suspended > 0).sort((a, b) => overall(b) - overall(a)).slice(0, 4);
  }
  return r;
}
