// The element registry: a canonical id for every styleable thing the statusline
// draws, with its built-in default Style. style.ts resolves a cascade keyed on
// these ids (built-in default ← theme ← accessibility profile ← user config), so
// every element is themeable/recolourable/animatable through one place.
//
// `fill` is a semantic role (fg/muted/accent/ok/warn/bad/info/gold) unless noted
// (`gradient` = value-driven along the theme; `rainbow` = animated per-letter).
// Multi-state elements (pet/effort/cost/risk/…) keep a sensible default here but
// the render site passes the live role via st(id, text, { role }).
import type { Style } from './types';

export const ELEMENTS = [
  // line 1 — lead + model bracket
  'lead.fast', 'lead.vim', 'pet', 'bracket.delim', 'crest',
  'model.tier', 'model.version', 'model.badge1m', 'effort', 'thinking',
  'moon', 'clock', 'sysinfo',
  // line 2 — context bar + stats
  'bar.empty', 'ctx.pct', 'ctx.weather', 'ctx.size', 'ctx.compactLabel',
  'trend.spark', 'trend.eta', 'trend.compactions',
  'tokens.hit', 'tokens.read', 'tokens.write', 'tokens.in', 'tokens.out',
  'usage.label', 'usage.pct', 'usage.warn', 'usage.countdown',
  // line 3 — dir + git + identity
  'dir', 'file',
  'git.branch', 'git.mood', 'git.state', 'git.today', 'git.ahead', 'git.behind',
  'git.age', 'git.email', 'git.added', 'git.removed', 'git.dirty', 'git.staged',
  'git.untracked', 'git.stash', 'git.risk',
  'name', 'cost.amount', 'cost.flair', 'cost.rate', 'cost.ratio', 'age',
  'separator',
] as const;

export type ElementId = typeof ELEMENTS[number];

export const ELEMENT_DEFAULTS: Record<ElementId, Style> = {
  'lead.fast': { fill: 'gold' }, 'lead.vim': { fill: 'accent' }, 'pet': { fill: 'ok' },
  'bracket.delim': { fill: 'muted' }, 'crest': { fill: 'gold' },
  'model.tier': { fill: 'accent' }, 'model.version': { fill: 'accent' }, 'model.badge1m': { fill: 'muted' },
  'effort': { fill: 'fg' }, 'thinking': { fill: 'muted' },
  'moon': { fill: 'muted' }, 'clock': { fill: 'muted' }, 'sysinfo': { fill: 'muted' },

  'bar.empty': { fill: 'muted' }, 'ctx.pct': { fill: 'gradient' }, 'ctx.weather': { fill: 'gradient' },
  'ctx.size': { fill: 'muted' }, 'ctx.compactLabel': { fill: 'muted' },
  'trend.spark': { fill: 'muted' }, 'trend.eta': { fill: 'gradient' }, 'trend.compactions': { fill: 'muted' },
  'tokens.hit': { fill: 'ok' }, 'tokens.read': { fill: 'ok' }, 'tokens.write': { fill: 'warn' },
  'tokens.in': { fill: 'muted' }, 'tokens.out': { fill: 'muted' },
  'usage.label': { fill: 'muted' }, 'usage.pct': { fill: 'gradient' },
  'usage.warn': { fill: 'bad', weight: 'bold' }, 'usage.countdown': { fill: 'muted' },

  'dir': { fill: 'muted' }, 'file': { fill: 'muted' },
  'git.branch': { fill: 'accent' }, 'git.mood': { fill: 'muted' }, 'git.state': { fill: 'bad', weight: 'bold' },
  'git.today': { fill: 'ok' }, 'git.ahead': { fill: 'ok' }, 'git.behind': { fill: 'bad' },
  'git.age': { fill: 'muted' }, 'git.email': { fill: 'muted' }, 'git.added': { fill: 'ok' },
  'git.removed': { fill: 'bad' }, 'git.dirty': { fill: 'warn' }, 'git.staged': { fill: 'ok' },
  'git.untracked': { fill: 'warn' }, 'git.stash': { fill: 'muted' }, 'git.risk': { fill: 'ok' },
  'name': { fill: 'rainbow' }, 'cost.amount': { fill: 'ok' }, 'cost.flair': { fill: 'ok' },
  'cost.rate': { fill: 'muted' }, 'cost.ratio': { fill: 'muted' }, 'age': { fill: 'ok' },
  'separator': { fill: 'muted' },
};
