// Layout assembly: choose how many lines to emit and justify each left/right pair.
// Compact forms reuse the segments already built; SL_RESPONSIVE picks a layout from
// the terminal width to avoid wrapping. All variants are no-ops at defaults (3line).
import { justified, termCols } from '../ansi';
import { cfg } from '../config';

// The pre-built segment strings the layouts compose.
export interface LayoutParts {
  LEAD: string; BAR: string; PCT_SEG: string; PCT_FULL: string; BRACKET: string; COST_SEG: string;
  L1_LEFT: string; L1_RIGHT: string; L2_LEFT: string; L2_RIGHT: string; L3_LEFT: string; L3_RIGHT: string;
}

export function assembleLayout(p: LayoutParts, sh: (name: string, val: string) => string): string[] {
  const J = justified;
  let layout = cfg.layout;
  if (cfg.responsive) { const c = termCols(); layout = c < 70 ? 'tiny' : c < 100 ? '1line' : c < 140 ? '2line' : '3line'; }
  switch (layout) {
    case 'tiny':
      return [J(`${p.BAR} ${p.PCT_SEG}`, sh('cost', p.COST_SEG))];
    case '1line':
      return [J(`${p.LEAD} ${p.BAR}  ${p.PCT_FULL}  ${p.BRACKET}`, p.L3_RIGHT)];
    case '2line':
      return [J(p.L1_LEFT, p.L1_RIGHT), J(p.L2_LEFT, p.L3_RIGHT)];
    default:   // 3line
      return [J(p.L1_LEFT, p.L1_RIGHT), J(p.L2_LEFT, p.L2_RIGHT), J(p.L3_LEFT, p.L3_RIGHT)];
  }
}
