// Cost segment (amount + flair + burn rate + cross-session ratio) and session age.
import { R } from '../ansi';
import { ROLES } from '../themes';
import { rainbow } from '../rainbow';
import { cfg } from '../config';
import { idiv } from '../util';
import { st } from '../style';
import { readHistory, BURN_BASELINE_MIN_MS, BURN_MIN_SESSION_MS } from '../state';
import { median } from '../insight';
import type { Role } from '../types';

export interface CostSeg { seg: string; barPrefix: string; }

export function buildCost(COST: number, DURATION_MS: number): CostSeg {
  const COST_FMT = Number(COST).toFixed(3);
  const costNum = parseFloat(COST_FMT);
  const costRole: Role = costNum >= 0.50 ? 'bad' : costNum >= 0.10 ? 'warn' : 'ok';
  const COST_FLAIR = cfg.costFlair
    ? (costNum >= 1 ? '!$' : costNum >= 0.50 ? '$$' : costNum >= 0.10 ? '$' : '·') + ' '
    : '';
  let seg: string, barPrefix: string;
  if (COST_FMT === '0.000') { seg = st('cost.amount', '$0', { role: 'muted' }); barPrefix = `${ROLES.muted}∅ ${R}`; }
  else {
    const price = `${COST_FLAIR}$${COST_FMT}`;
    seg = cfg.rainbowStats && !cfg.accessible ? rainbow(price) : st('cost.amount', price, { role: costRole });
    barPrefix = '';
  }
  if (cfg.burn && DURATION_MS >= BURN_MIN_SESSION_MS && costNum > 0) {
    const ratePerHr = COST / (DURATION_MS / 3600000);
    seg += ` ${st('cost.rate', `$${ratePerHr.toFixed(2)}/hr`)}`;
    // cross-session baseline: how this session's burn compares to your own median.
    try {
      const rates = readHistory().filter((h) => h.dur >= BURN_BASELINE_MIN_MS && h.cost > 0).map((h) => h.cost / (h.dur / 3600000));
      if (rates.length >= 5) {
        const med = median(rates);
        if (med > 0) {
          const ratio = ratePerHr / med;
          const rRole: Role = ratio >= 1.5 ? 'bad' : ratio >= 1.1 ? 'warn' : 'muted';
          seg += ` ${st('cost.ratio', `${ratio.toFixed(1)}x`, { role: rRole })}`;
        }
      }
    } catch { /* baseline is best-effort */ }
  }
  return { seg, barPrefix };
}

export function buildAge(DURATION_MS: number): string {
  const DUR_S = idiv(DURATION_MS, 1000);
  let ageRole: Role, AGE_LABEL: string;
  if (DUR_S >= 7200) { ageRole = 'bad'; AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`; }
  else if (DUR_S >= 3600) { ageRole = 'warn'; AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`; }
  else if (DUR_S >= 60) { ageRole = 'ok'; AGE_LABEL = `${idiv(DUR_S, 60)}m`; }
  else { ageRole = 'muted'; AGE_LABEL = `${DUR_S}s`; }
  return cfg.rainbowStats && !cfg.accessible ? rainbow(AGE_LABEL) : st('age', AGE_LABEL, { role: ageRole });
}
