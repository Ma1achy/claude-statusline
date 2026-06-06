// Animated % bar. All styles rotate HUE at a moving crest; they differ only in
// how the crest travels. Cells are drawn per SL_BAR_STYLE. The colour at each
// sub-pixel comes from the active theme (hue-ramp or colormap).
import { ESC, R, DIM } from './ansi';
import { WHITE } from './themes';
import { TH } from './themes';
import { cfg } from './config';
import { hsv, cmapSample, shiftHue } from './color';
import { idiv, mod } from './util';
import type { RGB } from './types';

const MATRIX_CHARS = '01<>{}[]/\\|=+*'.split('');
const hashI = (n: number): number => Math.imul(n >>> 0, 2654435761) >>> 0;

/**
 * width   — number of character cells
 * filled  — how many are filled (the % length)
 * marker  — index of the white ┃ marker (-1 = none); never animates
 * phaseMs — per-bar offset so staggered bars don't move in lockstep
 */
export function drawBar(width: number, filled: number, marker: number, phaseMs = 0): string {
  const { shimmer, speed, glow, waveHue, barStyle, nowMs, baseFrame } = cfg;
  const t = nowMs + phaseMs;
  let span = filled; if (span < 1) span = 1;
  let posc = 0, hglob = 0;
  // Toroidal period for the flowing crests: the crest wraps from the right edge
  // straight back to the left (no gap, no restart), so the loop is seamless.
  const wrap = span * 100;

  if (shimmer === 'sweep' || shimmer === 'comet' || shimmer === 'wave') {
    posc = mod(idiv(t * speed, 10), wrap);
  } else if (shimmer === 'scan') {
    let cyclec = span * 200; if (cyclec < 1) cyclec = 1;
    posc = mod(idiv(t * speed, 10), cyclec);
    if (posc >= span * 100) posc = span * 200 - posc;
  } else if (shimmer === 'breathe') {
    let tri = mod(t, 2600); if (tri >= 1300) tri = 2600 - tri;
    hglob = idiv(waveHue * tri, 1300);
  }
  const snakeHead = idiv(mod(idiv(t * speed, 10), span * 100), 100);

  const px = (sx: number): RGB => {
    if (shimmer === 'disco') return hsv(idiv(sx * 3, 10) + idiv(t, 30), 95, 92);
    let posp = idiv(sx, width); if (posp > 100) posp = 100; if (posp < 0) posp = 0;
    let hoff = 0;
    // toroidal distance to the crest (wraps around the ends) → seamless loop
    const torus = (): number => { const d = Math.abs(sx - posc); return Math.min(d, wrap - d); };
    switch (shimmer) {
      case 'sweep': {
        const dc = torus();
        if (dc < glow) hoff = idiv(waveHue * (glow - dc) * (glow - dc), glow * glow);
        break;
      }
      case 'wave': {
        const dc = torus();
        if (dc < 450) hoff = idiv(waveHue * (450 - dc), 450);
        break;
      }
      case 'comet': {
        const lead = mod(posc - sx, wrap);   // distance behind the head, wrapping
        if (lead < 420) hoff = idiv(waveHue * (420 - lead), 420);
        if (torus() < 70) hoff = waveHue;     // the head itself
        break;
      }
      case 'scan': {
        const dc = Math.abs(sx - posc);       // scan bounces, so no wrap needed
        if (dc < 140) hoff = idiv(waveHue * (140 - dc), 140);
        break;
      }
      case 'breathe':
        hoff = hglob;
        break;
    }
    if (TH.cmap) {
      const c = cmapSample(TH.cmap, posp);
      return hoff ? shiftHue(c, hoff) : c;
    }
    const bh = (TH.hueHi as number) - idiv(posp * ((TH.hueHi as number) - (TH.hueLo as number)), 100);
    const vv = (TH.valLo as number) + idiv(((TH.valHi as number) - (TH.valLo as number)) * posp, 100);
    return hsv(bh + hoff, TH.sat as number, vv);
  };
  const fg = (sx: number): string => { const [r, g, b] = px(sx); return `${ESC}[38;2;${r};${g};${b}m`; };

  let out = '';
  for (let i = 0; i < width; i++) {
    if (marker >= 0 && i === marker) { out += `${WHITE}┃${R}`; continue; }
    const isFill = i < filled;

    if (barStyle === 'pacman') {
      if (isFill && i === filled - 1) out += `${ESC}[1m${fg(i * 100 + 50)}C${R}`;
      else if (isFill) out += `${fg(i * 100 + 50)}=${R}`;
      else out += `${DIM}·${R}`;
      continue;
    }
    if (barStyle === 'snake') {
      if (isFill) out += i === snakeHead ? `${ESC}[1m${fg(i * 100 + 50)}@${R}` : `${fg(i * 100 + 50)}~${R}`;
      else out += `${DIM}·${R}`;
      continue;
    }
    if (barStyle === 'matrix') {
      if (isFill) out += `${fg(i * 100 + 50)}█${R}`;
      else out += `${ESC}[2;38;2;0;120;0m${MATRIX_CHARS[hashI(i * 131 + baseFrame) % MATRIX_CHARS.length]}${R}`;
      continue;
    }
    // disco: solid blocks (the whole line is re-rainbowed in a post-process pass)
    if (isFill && shimmer === 'disco') {
      const [r, g, b] = px(i * 100 + 50);
      out += `${ESC}[38;2;${r};${g};${b}m█${R}`;
      continue;
    }
    // default: half-block, two colour samples per cell
    if (isFill) {
      const [lr, lg, lb] = px(i * 100 + 25);
      const [rr, rg, rb] = px(i * 100 + 75);
      out += `${ESC}[38;2;${lr};${lg};${lb};48;2;${rr};${rg};${rb}m▌${R}`;
    } else out += `${DIM}░${R}`;
  }
  return out;
}
