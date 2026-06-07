// Layout assembly: choose how many lines to emit and justify each left/right pair.
// Compact forms reuse the segments already built; SL_RESPONSIVE picks a layout from
// the terminal width to avoid wrapping. All variants are no-ops at defaults (3line).
import { justified, termCols } from '../ansi';
import { cfg } from '../config';

// The pre-built segment strings the layouts compose.
export interface LayoutParts {
  LEAD: string; BAR: string; PCT_SEG: string; PCT_FULL: string; BRACKET: string; COST_SEG: string;
  L1_LEFT: string; L1_RIGHT: string; L2_LEFT: string; L2_RIGHT: string; L3_LEFT: string; L3_RIGHT: string;
  WIDE_BAR: string; USAGE_SEG: string;   // a terminal-width bar + the raw usage gauges, for the dashboard layouts
}

export function assembleLayout(p: LayoutParts, sh: (name: string, val: string) => string, override?: string): string[] {
  const J = justified;
  // `override` (adaptive, by context) wins over SL_RESPONSIVE (by width) wins over SL_LAYOUT.
  let layout = override || cfg.layout;
  if (!override && cfg.responsive) { const c = termCols(); layout = c < 70 ? 'tiny' : c < 100 ? '1line' : c < 140 ? '2line' : '3line'; }
  switch (layout) {
    case 'tiny':
      return [J(`${p.BAR} ${p.PCT_SEG}`, sh('cost', p.COST_SEG))];
    case '1line':
      return [J(`${p.LEAD} ${p.BAR}  ${p.PCT_FULL}  ${p.BRACKET}`, p.L3_RIGHT)];
    case '2line':
      return [J(p.L1_LEFT, p.L1_RIGHT), J(p.L2_LEFT, p.L3_RIGHT)];
    // consequences first: identity/cost, then the bar, then model/git/path.
    case 'inverse':
      return [J(p.L3_LEFT, p.L3_RIGHT), J(p.L2_LEFT, p.L2_RIGHT), J(p.L1_LEFT, p.L1_RIGHT)];
    // model + path/git on one row, the bar + stats on the next.
    case 'merged':
      return [J(`${p.L1_LEFT}  ${p.L3_LEFT}`, p.L1_RIGHT), J(p.L2_LEFT, p.L3_RIGHT)];
    // two columns: left = what Claude is doing, right = where you are.
    case 'bicolumn':
      return [J(p.L1_LEFT, p.L3_LEFT), J(p.L2_LEFT, p.L3_RIGHT)];
    // a full-width ambient bar up top, metadata beneath.
    case 'barfirst':
      return [`${p.WIDE_BAR}  ${p.PCT_FULL}`, J(`${p.L1_LEFT}  ${p.L3_LEFT}`, p.L3_RIGHT)];
    // a heavy bar banner like a window title, then two dense metadata rows.
    case 'header':
      return [p.WIDE_BAR, J(p.L1_LEFT, p.L1_RIGHT), J(p.L3_LEFT, p.L3_RIGHT)];
    // dashboard: identity, a full-width context bar, the usage gauges, then project.
    case 'split':
      return [J(p.L1_LEFT, p.L1_RIGHT), `${p.WIDE_BAR}  ${p.PCT_FULL}`,
        sh('usage', p.USAGE_SEG), J(p.L3_LEFT, p.L3_RIGHT)].filter((l) => l !== '');
    default:   // 3line
      return [J(p.L1_LEFT, p.L1_RIGHT), J(p.L2_LEFT, p.L2_RIGHT), J(p.L3_LEFT, p.L3_RIGHT)];
  }
}
