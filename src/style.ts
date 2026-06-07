// The one place colour/weight is applied. Every render site calls st(id, text) so
// the theme + accessibility profile + user config reach every element uniformly.
// All colour goes through tc()/the role escapes, so colour-mode degradation
// (truecolor/256/16/mono) is preserved automatically.
//
// (Stage B: fill + weight. case/attrs/font/anim and the theme/user cascade land in
// later stages; the resolver shape already anticipates them.)
import { R, BOLD, DIM, tc } from './ansi';
import { TH, gradientColor } from './themes';
import { rainbow } from './rainbow';
import { ELEMENT_DEFAULTS } from './elements';
import type { ElementId } from './elements';
import type { Role } from './types';

interface StOpts { role?: Role; weight?: 'normal' | 'bold' | 'dim'; pct?: number; }

const hexRgb = (h: string): [number, number, number] =>
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Style `text` as element `id`. opts.role overrides the element's default fill
 *  (for multi-state elements); opts.pct drives a `gradient` fill. */
export function st(id: ElementId, text: string, opts: StOpts = {}): string {
  if (text === '') return '';
  // cascade: built-in default ← active theme's per-element override ← per-call opts
  const d = { ...ELEMENT_DEFAULTS[id], ...(TH.elements && TH.elements[id]) };
  const fill = opts.role ?? d.fill ?? 'fg';
  const weight = opts.weight ?? d.weight ?? 'normal';
  const w = weight === 'bold' ? BOLD : weight === 'dim' ? DIM : '';

  if (fill === 'rainbow') return `${w}${rainbow(text)}`;   // rainbow emits its own colours + reset
  let colour: string;
  if (fill === 'gradient') colour = gradientColor(opts.pct ?? 0);
  else if (fill[0] === '#') { const [r, g, b] = hexRgb(fill); colour = tc(r, g, b); }
  else colour = (TH.roles && TH.roles[fill as Role]) || '';
  return `${w}${colour}${text}${R}`;
}
