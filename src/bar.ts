// Animated % bar. All styles rotate HUE at a moving crest; they differ only in
// how the crest travels. Cells are drawn per SL_BAR_STYLE. The colour at each
// sub-pixel comes from the active theme (hue-ramp or colormap).
import { ESC, R, BOLD, tc, fgbg, dimFg } from './ansi';
import { WHITE, ROLES } from './themes';
import { TH } from './themes';
import { cfg } from './config';
import { hsv, cmapSample, shiftHue } from './color';
import { idiv, mod } from './util';
import { HUE_SHIMMERS, BRIGHT_SHIMMERS, type ShimmerCtx } from './anim/shimmers';
import type { RGB } from './types';

const MATRIX_CHARS = '01<>{}[]/\\|=+*'.split('');
const EQ = '▁▂▃▄▅▆▇█'.split('');
const SHADE = '░▒▓█'.split('');
const hashI = (n: number): number => Math.imul(n >>> 0, 2654435761) >>> 0;

/** Cells to fill for a percentage. Linear is the original idiv (byte-stable);
 *  log/compact squares the fraction so the danger zone occupies more cells. */
export function scaleCells(pct: number, width: number): number {
  const p = Math.max(0, Math.min(100, pct));
  if (cfg.barScale === 'log' || cfg.barScale === 'compact') return Math.round(width * (p / 100) * (p / 100));
  return idiv(p * width, 100);
}

/**
 * width   — number of character cells
 * filled  — how many are filled (the % length)
 * marker  — index of the white ┃ marker (-1 = none); never animates
 * phaseMs — per-bar offset so staggered bars don't move in lockstep
 */
export function drawBar(width: number, filled: number, marker: number, phaseMs = 0): string {
  const { shimmer, speed, glow, waveHue, barStyle, nowMs, baseFrame, colorMode } = cfg;
  const t = nowMs + phaseMs;
  let span = filled; if (span < 1) span = 1;
  let posc = 0, hglob = 0;
  // Toroidal period for the flowing crests: the crest wraps from the right edge
  // straight back to the left (no gap, no restart), so the loop is seamless.
  const wrap = span * 100;
  // Triangle wave 0..100..0 over a period of 200 — the building block for the
  // continuous shimmers (drift/plasma/lumin) without floating-point sin.
  const tri = (x: number): number => { const m = mod(Math.round(x), 200); return m < 100 ? m : 200 - m; };

  if (shimmer === 'sweep' || shimmer === 'comet' || shimmer === 'wave') {
    posc = mod(idiv(t * speed, 10), wrap);
    // SL_EASING reshapes where the crest sits each tick (subtle at ≤1fps).
    if (cfg.easing) {
      const f = posc / wrap;
      let e = f;
      if (cfg.easing === 'ease') e = f * f * (3 - 2 * f);
      else if (cfg.easing === 'bounce') { const g = 1 - f; e = 1 - g * g * Math.abs(Math.cos(g * 6)); }
      else if (cfg.easing === 'elastic') e = Math.max(0, Math.min(1, f + 0.12 * Math.sin(f * 12)));
      posc = mod(Math.round(e * wrap), wrap);
    }
  } else if (shimmer === 'scan') {
    let cyclec = span * 200; if (cyclec < 1) cyclec = 1;
    posc = mod(idiv(t * speed, 10), cyclec);
    if (posc >= span * 100) posc = span * 200 - posc;
  } else if (shimmer === 'breathe') {
    let trib = mod(t, 2600); if (trib >= 1300) trib = 2600 - trib;
    hglob = idiv(waveHue * trib, 1300);
  }
  const snakeHead = idiv(mod(idiv(t * speed, 10), span * 100), 100);

  // Per-render context the shimmer strategies read (see anim/shimmers.ts).
  const sctx: ShimmerCtx = { t, speed, wrap, glow, waveHue, posc, hglob, filled, event: cfg.event, tri };

  const px = (sx: number): RGB => {
    if (shimmer === 'disco') return hsv(idiv(sx * 3, 10) + idiv(t, 30), 95, 92);
    let posp = idiv(sx, width); if (posp > 100) posp = 100; if (posp < 0) posp = 0;
    const hoff = HUE_SHIMMERS[shimmer]?.(sx, sctx) ?? 0;
    let base: RGB;
    if (TH.cmap) {
      const c = cmapSample(TH.cmap, posp);
      base = hoff ? shiftHue(c, hoff) : c;
    } else {
      const bh = (TH.hueHi as number) - idiv(posp * ((TH.hueHi as number) - (TH.hueLo as number)), 100);
      const vv = (TH.valLo as number) + idiv(((TH.valHi as number) - (TH.valLo as number)) * posp, 100);
      base = hsv(bh + hoff, TH.sat as number, vv);
    }
    // Brightness-channel shimmers (leave hue alone, modulate value over time/cell).
    const bf = BRIGHT_SHIMMERS[shimmer]?.(sx, sctx) ?? 100;
    if (bf !== 100) base = [Math.min(255, idiv(base[0] * bf, 100)), Math.min(255, idiv(base[1] * bf, 100)), Math.min(255, idiv(base[2] * bf, 100))];
    return base;
  };
  const fg = (sx: number): string => { const [r, g, b] = px(sx); return tc(r, g, b); };

  let out = '';
  for (let i = 0; i < width; i++) {
    if (marker >= 0 && i === marker) { out += `${WHITE}┃${R}`; continue; }
    const isFill = i < filled;

    if (barStyle === 'pacman') {
      if (isFill && i === filled - 1) out += `${ESC}[1m${fg(i * 100 + 50)}C${R}`;
      else if (isFill) out += `${fg(i * 100 + 50)}=${R}`;
      else out += `${ROLES.muted}·${R}`;
      continue;
    }
    if (barStyle === 'snake') {
      if (isFill) out += i === snakeHead ? `${ESC}[1m${fg(i * 100 + 50)}@${R}` : `${fg(i * 100 + 50)}~${R}`;
      else out += `${ROLES.muted}·${R}`;
      continue;
    }
    if (barStyle === 'matrix') {
      if (isFill) out += `${fg(i * 100 + 50)}█${R}`;
      else out += `${dimFg(0, 120, 0)}${MATRIX_CHARS[hashI(i * 131 + baseFrame) % MATRIX_CHARS.length]}${R}`;
      continue;
    }
    if (barStyle === 'braille') {
      out += isFill ? `${fg(i * 100 + 50)}⣿${R}` : `${ROLES.muted}⠄${R}`;
      continue;
    }
    if (barStyle === 'battery') {
      out += isFill ? `${fg(i * 100 + 50)}█${R}` : `${ROLES.muted}░${R}`;
      continue;
    }
    if (barStyle === 'thermo') {
      out += isFill ? `${fg(i * 100 + 50)}▰${R}` : `${ROLES.muted}▱${R}`;
      continue;
    }
    if (barStyle === 'shade') {
      if (isFill) out += `${fg(i * 100 + 50)}${SHADE[Math.min(3, idiv(i * 4, span))]}${R}`;
      else out += `${ROLES.muted}░${R}`;
      continue;
    }
    if (barStyle === 'lines' || barStyle === 'minimal') {
      out += isFill ? `${fg(i * 100 + 50)}━${R}` : `${ROLES.muted}─${R}`;
      continue;
    }
    if (barStyle === 'rule') {
      if (isFill) out += `${fg(i * 100 + 50)}${i % 5 === 0 ? '┼' : '─'}${R}`;
      else out += `${ROLES.muted}${i % 5 === 0 ? '┊' : '┄'}${R}`;
      continue;
    }
    if (barStyle === 'equalizer') {
      if (isFill) out += `${fg(i * 100 + 50)}${EQ[hashI(i * 17 + idiv(nowMs, 140)) % 8]}${R}`;
      else out += `${ROLES.muted}▁${R}`;
      continue;
    }
    if (barStyle === 'waveform') {
      // a frozen oscilloscope: per-cell heights seeded by the fill (static, not animated).
      if (isFill) out += `${fg(i * 100 + 50)}${EQ[hashI(i * 23 + filled) % 8]}${R}`;
      else out += `${ROLES.muted}▁${R}`;
      continue;
    }
    if (barStyle === 'retro') {
      // solid ASCII, mono-friendly: '#' filled, '-' track.
      out += isFill ? `${fg(i * 100 + 50)}#${R}` : `${ROLES.muted}-${R}`;
      continue;
    }
    if (barStyle === 'arrows') {
      out += isFill ? `${fg(i * 100 + 50)}→${R}` : `${ROLES.muted}·${R}`;
      continue;
    }
    if (barStyle === 'dna') {
      if (isFill) out += `${fg(i * 100 + 50)}${(i + idiv(nowMs, 200)) % 2 ? 'X' : 'x'}${R}`;
      else out += `${ROLES.muted}·${R}`;
      continue;
    }
    if (barStyle === 'train') {
      if (isFill && i === filled - 1) out += `${ESC}[1m${fg(i * 100 + 50)}O${R}`;
      else if (isFill) out += `${fg(i * 100 + 50)}=${R}`;
      else out += `${ROLES.muted}-${R}`;
      continue;
    }
    // disco: solid blocks (the whole line is re-rainbowed in a post-process pass)
    if (isFill && shimmer === 'disco') {
      const [r, g, b] = px(i * 100 + 50);
      out += `${tc(r, g, b)}█${R}`;
      continue;
    }
    // default: half-block, two colour samples per cell. Below truecolor the
    // fg/bg half-block trick is unreliable, so degrade to a solid block: a
    // single colour sample in 256/16, and a plain bold block in mono.
    if (isFill) {
      const left = px(i * 100 + 25);
      const right = px(i * 100 + 75);
      if (colorMode === 'mono') out += `${BOLD}█${R}`;
      else if (colorMode === '16') out += `${tc(left[0], left[1], left[2])}█${R}`;
      else out += `${fgbg(left, right)}▌${R}`;
    } else out += `${ROLES.muted}░${R}`;
  }
  return out;
}
