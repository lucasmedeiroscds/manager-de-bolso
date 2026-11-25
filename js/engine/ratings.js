// =============================================================
// ratings.js — como os atributos viram "overall", valor e salário
// =============================================================
// Atributos de cada jogador (0 a 99):
//   fin = finalização   pas = passe       def = defesa
//   for = força         res = resistência gk  = goleiro (reflexos)
// =============================================================

// Posições usadas no jogo
export const POSITIONS = ['GOL', 'ZAG', 'LAT', 'VOL', 'MEI', 'ATA'];

export const POS_NAMES = {
  GOL: 'Goleiro', ZAG: 'Zagueiro', LAT: 'Lateral',
  VOL: 'Volante', MEI: 'Meia', ATA: 'Atacante'
};

// Peso de cada atributo no overall de cada posição (cada linha soma 1)
export const POS_WEIGHTS = {
  GOL: { gk: 0.75, def: 0.10, for: 0.10, pas: 0.05, fin: 0, res: 0 },
  ZAG: { def: 0.50, for: 0.25, pas: 0.10, res: 0.10, fin: 0.05, gk: 0 },
  LAT: { def: 0.35, res: 0.25, pas: 0.25, for: 0.10, fin: 0.05, gk: 0 },
  VOL: { def: 0.35, pas: 0.30, res: 0.20, for: 0.15, fin: 0, gk: 0 },
  MEI: { pas: 0.45, fin: 0.25, res: 0.15, for: 0.10, def: 0.05, gk: 0 },
  ATA: { fin: 0.55, for: 0.20, res: 0.15, pas: 0.10, def: 0, gk: 0 }
};

// Overall de um jogador jogando numa posição (padrão: a dele)
export function overall(p, pos = p.pos) {
  const w = POS_WEIGHTS[pos];
  let s = 0;
  for (const k in w) s += (p.attrs[k] || 0) * w[k];
  return Math.round(s);
}

// Quanto o jogador rende fora da posição de origem (1 = 100%)
// Ex.: um volante jogando de meia rende 90%; um goleiro na linha, 30%.
const NEAR = {
  GOL: { GOL: 1 },
  ZAG: { ZAG: 1, LAT: 0.85, VOL: 0.85 },
  LAT: { LAT: 1, ZAG: 0.85, VOL: 0.85, MEI: 0.8 },
  VOL: { VOL: 1, ZAG: 0.85, MEI: 0.9, LAT: 0.85 },
  MEI: { MEI: 1, VOL: 0.9, ATA: 0.85, LAT: 0.8 },
  ATA: { ATA: 1, MEI: 0.85 }
};
export function positionFit(natural, slot) {
  if (natural === slot) return 1;
  if (slot === 'GOL' || natural === 'GOL') return 0.3;
  return (NEAR[natural] && NEAR[natural][slot]) || 0.7;
}

// Rendimento real no jogo: overall na posição × encaixe × físico × moral
export function effectiveRating(p, slot) {
  const base = overall(p, slot) * positionFit(p.pos, slot);
  const fitness = 0.65 + 0.35 * (p.fitness / 100); // cansado rende menos
  const moral = 0.92 + 0.16 * (p.moral / 100);     // moral 50 = neutro
  return base * fitness * moral;
}

// Valor de mercado (R$) — cresce rápido com o overall, cai com a idade.
// Referência: overall 60 ≈ R$ 2,5 mi; 70 ≈ R$ 10 mi; 80 ≈ R$ 40 mi.
export function marketValue(p) {
  const ovr = overall(p);
  let v = 610 * Math.exp(0.1386 * ovr);
  if (p.age <= 21) v *= 1 + Math.max(0, p.potential - ovr) / 30; // jovens com potencial valem mais
  if (p.age >= 30) v *= Math.max(0.2, 1 - (p.age - 29) * 0.13);
  return Math.max(50000, Math.round(v / 10000) * 10000);
}

// Salário semanal (R$) que o jogador pede.
// Referência: overall 60 ≈ R$ 15 mil; 70 ≈ R$ 65 mil; 80 ≈ R$ 300 mil por semana.
export function wageDemand(p) {
  const ovr = overall(p);
  const w = 1.85 * Math.exp(0.15 * ovr);
  return Math.max(800, Math.round(w / 100) * 100);
}

// Cor da nota (para a interface)
export function ovrClass(v) {
  if (v >= 80) return 'ovr-a';
  if (v >= 70) return 'ovr-b';
  if (v >= 60) return 'ovr-c';
  return 'ovr-d';
}
