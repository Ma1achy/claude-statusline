// The one place colour/weight/typography/animation is applied. Every render site
// calls st(id, text) so the theme + accessibility profile + user config reach every
// element uniformly. All colour goes through tc()/the role escapes, so colour-mode
// degradation (truecolor/256/16/mono) is preserved automatically.
import { R, BOLD, DIM, ITALIC, UNDERLINE, tc } from './ansi';
import { TH, gradientColor } from './themes';
import { rainbow } from './rainbow';
import { cfg } from './config';
import { idiv, mod } from './util';
import { toCase, pseudoFont } from './textfx';
import { ELEMENT_DEFAULTS } from './elements';
import type { ElementId } from './elements';
import type { Role, Style } from './types';

interface StOpts { role?: Role; weight?: 'normal' | 'bold' | 'dim'; pct?: number; }

// Glyph/label resolution — same cascade as st(), highest-wins:
//   user elements[id] → user glyphs/labels map → theme elements[id] → theme map →
//   built-in default → the caller's fallback (the literal the segment used to hardcode).
// Lets a theme (or user config) swap any element's icon or wording. Returns the
// fallback unchanged when nothing overrides it, so default output is untouched.
function resolveGlyph(id: ElementId): string | undefined {
  return cfg.elements?.[id]?.glyph ?? cfg.glyphs?.[id]
    ?? TH.elements?.[id]?.glyph ?? TH.glyphs?.[id]
    ?? ELEMENT_DEFAULTS[id].glyph;
}
function resolveLabel(id: ElementId): string | undefined {
  return cfg.elements?.[id]?.label ?? cfg.labels?.[id]
    ?? TH.elements?.[id]?.label ?? TH.labels?.[id]
    ?? ELEMENT_DEFAULTS[id].label;
}
/** Theme/user glyph override for element `id`, else `fallback`. */
export function glyphFor(id: ElementId, fallback: string): string {
  return resolveGlyph(id) ?? fallback;
}
/** Theme/user label override for element `id`, else `fallback`. */
export function labelFor(id: ElementId, fallback: string): string {
  return resolveLabel(id) ?? fallback;
}

const hexRgb = (h: string): [number, number, number] =>
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Brightness throb 0.55→1.0 for pulse/breathe anims; deterministic on cfg.nowMs.
function throb(speed: number): number {
  const m = mod(idiv(cfg.nowMs * speed, 16), 100);
  const tri = m < 50 ? m : 100 - m;            // 0..50..0 triangle
  return 0.55 + 0.45 * (tri / 50);
}
// Modulate a truecolor escape's brightness; 256/16/mono escapes pass through (no RGB).
function modBright(esc: string, f: number): string {
  const m = esc.match(/38;2;(\d+);(\d+);(\d+)/);
  if (!m) return esc;
  const g = (v: number): number => Math.max(0, Math.min(255, Math.round(v * f)));
  return tc(g(+m[1]), g(+m[2]), g(+m[3]));
}

/** Style `text` as element `id`. opts.role overrides the element's default fill
 *  (for multi-state elements); opts.pct drives a `gradient` fill. */
export function st(id: ElementId, text: string, opts: StOpts = {}): string {
  if (text === '') return '';
  // cascade: built-in default ← theme override ← user config ← per-call opts
  const d: Style = { ...ELEMENT_DEFAULTS[id], ...(TH.elements && TH.elements[id]), ...(cfg.elements && cfg.elements[id]) };
  // accessibility profile: top of the cascade — kill motion + pseudo-fonts and
  // demote the colour-only rainbow to plain fg, on EVERY element. (Roles already
  // resolve to the AAA palette via themes.ts.) Case/weight/attrs are a11y-safe.
  const a11y = cfg.accessible;
  let fill = opts.role ?? d.fill ?? 'fg';
  if (a11y && fill === 'rainbow') fill = 'fg';
  const weight = opts.weight ?? d.weight ?? 'normal';
  const anim = a11y ? 'none' : ((d.anim && d.anim.kind) || 'none');
  const speed = (d.anim && d.anim.speed) || 1;

  // text transforms: case fold, then opt-in pseudo-font (off under accessibility)
  let t = toCase(text, d.case);
  if (!a11y && d.font && d.font !== 'none') t = pseudoFont(t, d.font);

  // weight + attribute prefix
  let pre = weight === 'bold' ? BOLD : weight === 'dim' ? DIM : '';
  if (d.attrs) for (const a of d.attrs) pre += a === 'italic' ? ITALIC : a === 'underline' ? UNDERLINE : '';

  // rainbow (as a fill or an animation) → animated per-letter; emits its own resets
  if (fill === 'rainbow' || anim === 'rainbow') return `${pre}${rainbow(t)}`;

  // base colour
  let pct = opts.pct ?? 0;
  if (anim === 'gradient-cycle') pct = mod(pct + idiv(cfg.nowMs * speed, 80), 100);
  let colour = fill === 'gradient' ? gradientColor(pct)
    : fill[0] === '#' ? tc(...hexRgb(fill))
      : (TH.roles && TH.roles[fill as Role]) || '';
  if (anim === 'pulse' || anim === 'breathe' || anim === 'wave') colour = modBright(colour, throb(speed));

  return `${pre}${colour}${t}${R}`;
}
