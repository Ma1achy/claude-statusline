// Animated % bar. All styles rotate HUE at a moving crest; they differ only in
// how the crest travels. Cells are drawn per SL_BAR_STYLE. The colour at each
// sub-pixel comes from the active theme (hue-ramp or colormap).
import { ESC, R, DIM, BOLD, tc, fgbg, dimFg } from './ansi';
import { WHITE } from './themes';
import { TH } from './themes';
import { cfg } from './config';
import { hsv, cmapSample, shiftHue } from './color';
import { idiv, mod } from './util';
import type { RGB } from './types';

const MATRIX_CHARS = '01<>{}[]/\\|=+*'.split('');
const EQ = '▁▂▃▄▅▆▇█'.split('');
const SHADE = '░▒▓█'.split('');
const hashI = (n: number): number => Math.imul(n >>> 0, 2654435761) >>> 0;

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
      case 'drift': case 'aurora':
        hoff = idiv(waveHue * tri(idiv(sx, 8) + idiv(t * speed, 25)), 100);
        break;
      case 'plasma':
        hoff = idiv(waveHue * (tri(idiv(sx, 6) + idiv(t, 30)) + tri(idiv(sx, 11) - idiv(t, 45))), 200);
        break;
      case 'glitch': {
        // brief broken hue jumps on pseudo-random cells, re-seeded each time bucket
        const bk = idiv(t, 220);
        if (hashI(sx * 13 + bk) % 100 < 12) hoff = hashI(sx + bk) % 2 ? waveHue * 3 : -waveHue * 2;
        break;
      }
    }
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
    let bf = 100;
    if (shimmer === 'lumin') bf = 55 + idiv(45 * tri(idiv(t, 12)), 100);
    else if (shimmer === 'heartbeat') { const m = mod(t, 1400); const bump = (c: number, w: number): number => { const d = Math.abs(m - c); return d < w ? w - d : 0; }; bf = 70 + idiv(60 * Math.max(bump(150, 150), bump(450, 120)), 150); }
    else if (shimmer === 'twinkle') bf = hashI(sx * 29 + idiv(t, 180)) % 100 < 14 ? 165 : 75;
    else if (shimmer === 'storm') {
      const flash = mod(idiv(t * speed, 8), wrap); const d = Math.abs(sx - flash); const dd = Math.min(d, wrap - d);
      bf = dd < 120 ? 150 : 68; if (hashI(idiv(t, 400)) % 100 < 8) bf = 185;
    } else if (shimmer === 'morse') bf = MORSE_SEQ[idiv(t, 160) % MORSE_SEQ.length] ? 100 : 22;
    else if (shimmer === 'flash') bf = cfg.event ? 175 : 100;            // bright pulse the tick the % changes
    else if (shimmer === 'ripple') bf = cfg.event ? (Math.abs(sx - filled * 100) < 250 ? 175 : 88) : 88;   // ring at the fill edge on update
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
      else out += `${dimFg(0, 120, 0)}${MATRIX_CHARS[hashI(i * 131 + baseFrame) % MATRIX_CHARS.length]}${R}`;
      continue;
    }
    if (barStyle === 'braille') {
      out += isFill ? `${fg(i * 100 + 50)}⣿${R}` : `${DIM}⠄${R}`;
      continue;
    }
    if (barStyle === 'battery') {
      out += isFill ? `${fg(i * 100 + 50)}█${R}` : `${DIM}░${R}`;
      continue;
    }
    if (barStyle === 'thermo') {
      out += isFill ? `${fg(i * 100 + 50)}▰${R}` : `${DIM}▱${R}`;
      continue;
    }
    if (barStyle === 'shade') {
      if (isFill) out += `${fg(i * 100 + 50)}${SHADE[Math.min(3, idiv(i * 4, span))]}${R}`;
      else out += `${DIM}░${R}`;
      continue;
    }
    if (barStyle === 'lines' || barStyle === 'minimal') {
      out += isFill ? `${fg(i * 100 + 50)}━${R}` : `${DIM}─${R}`;
      continue;
    }
    if (barStyle === 'rule') {
      if (isFill) out += `${fg(i * 100 + 50)}${i % 5 === 0 ? '┼' : '─'}${R}`;
      else out += `${DIM}${i % 5 === 0 ? '┊' : '┄'}${R}`;
      continue;
    }
    if (barStyle === 'equalizer' || barStyle === 'waveform') {
      if (isFill) out += `${fg(i * 100 + 50)}${EQ[hashI(i * 17 + idiv(nowMs, 140)) % 8]}${R}`;
      else out += `${DIM}▁${R}`;
      continue;
    }
    if (barStyle === 'dna') {
      if (isFill) out += `${fg(i * 100 + 50)}${(i + idiv(nowMs, 200)) % 2 ? 'X' : 'x'}${R}`;
      else out += `${DIM}·${R}`;
      continue;
    }
    if (barStyle === 'train') {
      if (isFill && i === filled - 1) out += `${ESC}[1m${fg(i * 100 + 50)}O${R}`;
      else if (isFill) out += `${fg(i * 100 + 50)}=${R}`;
      else out += `${DIM}-${R}`;
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
    } else out += `${DIM}░${R}`;
  }
  return out;
}
