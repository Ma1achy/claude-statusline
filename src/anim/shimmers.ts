// Shimmer strategies. Each shimmer is a deterministic function of cfg.nowMs and the
// sub-pixel position; drawBar computes a ShimmerCtx once per render and looks the
// strategy up here. Two families:
//   • HUE_SHIMMERS    — return a hue offset added to the base colour at sub-pixel sx.
//   • BRIGHT_SHIMMERS — return a brightness factor (100 = unchanged) over time/cell.
// Adding a shimmer is one map entry. Math is integer-only and copied verbatim from
// the original drawBar switch so output stays byte-identical.
import { idiv, mod } from '../util';

export interface ShimmerCtx {
  t: number;          // nowMs + per-bar phase offset
  speed: number;
  wrap: number;       // toroidal period (span * 100)
  glow: number;
  waveHue: number;
  posc: number;       // crest position for the flowing shimmers
  hglob: number;      // global hue offset for `breathe`
  filled: number;     // filled cell count (for `ripple`)
  event: boolean;     // the context % changed this tick (for flash/ripple)
  tri: (x: number) => number;   // triangle wave 0..100..0, period 200
}

// FNV-ish integer scramble for the pseudo-random shimmers (glitch/twinkle/storm).
const hashI = (n: number): number => Math.imul(n >>> 0, 2654435761) >>> 0;

// Toroidal distance to the crest (wraps around the ends) → seamless loop.
const torus = (sx: number, c: ShimmerCtx): number => { const d = Math.abs(sx - c.posc); return Math.min(d, c.wrap - d); };

// Morse on/off timeline (1 unit/dot, 3/dash, 1 gap between symbols, 3 between
// letters, 7 at the end) — used by the `morse` shimmer to blink "CLAUDE".
const MORSE: Record<string, string> = { C: '-.-.', L: '.-..', A: '.-', U: '..-', D: '-..', E: '.' };
const MORSE_SEQ: boolean[] = (() => {
  const out: boolean[] = [];
  const push = (on: boolean, n: number): void => { for (let i = 0; i < n; i++) out.push(on); };
  const word = 'CLAUDE'.split('');
  word.forEach((ch, li) => {
    const code = MORSE[ch] || '';
    code.split('').forEach((sym, si) => { push(true, sym === '-' ? 3 : 1); if (si < code.length - 1) push(false, 1); });
    push(false, li < word.length - 1 ? 3 : 7);
  });
  return out;
})();

// Hue-offset shimmers: the colour at each sub-pixel keeps the theme's value but
// rotates hue near a travelling crest.
export const HUE_SHIMMERS: Record<string, (sx: number, c: ShimmerCtx) => number> = {
  sweep(sx, c) {
    const dc = torus(sx, c);
    return dc < c.glow ? idiv(c.waveHue * (c.glow - dc) * (c.glow - dc), c.glow * c.glow) : 0;
  },
  wave(sx, c) {
    const dc = torus(sx, c);
    return dc < 450 ? idiv(c.waveHue * (450 - dc), 450) : 0;
  },
  comet(sx, c) {
    let hoff = 0;
    const lead = mod(c.posc - sx, c.wrap);   // distance behind the head, wrapping
    if (lead < 420) hoff = idiv(c.waveHue * (420 - lead), 420);
    if (torus(sx, c) < 70) hoff = c.waveHue;     // the head itself
    return hoff;
  },
  scan(sx, c) {
    const dc = Math.abs(sx - c.posc);       // scan bounces, so no wrap needed
    return dc < 140 ? idiv(c.waveHue * (140 - dc), 140) : 0;
  },
  breathe(_sx, c) { return c.hglob; },
  drift(sx, c) { return idiv(c.waveHue * c.tri(idiv(sx, 8) + idiv(c.t * c.speed, 25)), 100); },
  plasma(sx, c) { return idiv(c.waveHue * (c.tri(idiv(sx, 6) + idiv(c.t, 30)) + c.tri(idiv(sx, 11) - idiv(c.t, 45))), 200); },
  glitch(sx, c) {
    // brief broken hue jumps on pseudo-random cells, re-seeded each time bucket
    const bk = idiv(c.t, 220);
    if (hashI(sx * 13 + bk) % 100 < 12) return hashI(sx + bk) % 2 ? c.waveHue * 3 : -c.waveHue * 2;
    return 0;
  },
};
HUE_SHIMMERS.aurora = HUE_SHIMMERS.drift;   // aurora shares drift's crest

// Brightness-channel shimmers: leave hue alone, modulate value over time/cell.
export const BRIGHT_SHIMMERS: Record<string, (sx: number, c: ShimmerCtx) => number> = {
  lumin(_sx, c) { return 55 + idiv(45 * c.tri(idiv(c.t, 12)), 100); },
  heartbeat(_sx, c) {
    const m = mod(c.t, 1400);
    const bump = (k: number, w: number): number => { const d = Math.abs(m - k); return d < w ? w - d : 0; };
    return 70 + idiv(60 * Math.max(bump(150, 150), bump(450, 120)), 150);
  },
  twinkle(sx, c) { return hashI(sx * 29 + idiv(c.t, 180)) % 100 < 14 ? 165 : 75; },
  storm(sx, c) {
    const flash = mod(idiv(c.t * c.speed, 8), c.wrap); const d = Math.abs(sx - flash); const dd = Math.min(d, c.wrap - d);
    let bf = dd < 120 ? 150 : 68; if (hashI(idiv(c.t, 400)) % 100 < 8) bf = 185;
    return bf;
  },
  morse(_sx, c) { return MORSE_SEQ[idiv(c.t, 160) % MORSE_SEQ.length] ? 100 : 22; },
  flash(_sx, c) { return c.event ? 175 : 100; },            // bright pulse the tick the % changes
  ripple(sx, c) { return c.event ? (Math.abs(sx - c.filled * 100) < 250 ? 175 : 88) : 88; },   // ring at the fill edge on update
};
