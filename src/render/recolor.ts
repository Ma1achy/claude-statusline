// Whole-line recolour passes that run after assembly and override per-element
// fills, so every coloured unit on a line moves together: the disco rainbow and
// the danger "safelight" red wash.
import { stripAnsi, tc, R } from '../ansi';
import { hueRgb } from '../color';
import { cfg } from '../config';
import { idiv } from '../util';
import type { RateLimit } from '../types';

// Group each glyph with any trailing variation selector, then recolour every
// visible unit via colour(col).
function recolor(line: string, colour: (col: number) => string): string {
  const glyphs: string[] = [];
  for (const ch of Array.from(stripAnsi(line))) {
    const code = ch.codePointAt(0) || 0;
    if (code >= 0xfe00 && code <= 0xfe0f && glyphs.length) glyphs[glyphs.length - 1] += ch;
    else glyphs.push(ch);
  }
  let out = '', col = 0;
  for (const g of glyphs) {
    if (g === ' ') { out += ' '; col++; continue; }
    out += `${colour(col)}${g}${R}`;
    col++;
  }
  return out;
}

// Apply the disco rainbow or the danger safelight wash to the assembled lines.
// Danger (SL_DANGER, or the silver-halide theme) kicks in once context or a usage
// limit is critical — a deep red wash that says "you can still work, carefully".
export function applyWashes(lines: string[], rl: StatuslineRateLimits, PCT: number): string[] {
  let dangerActive = false;
  if (cfg.danger || cfg.themeName === 'silver-halide') {
    const fh = (rl && rl.five_hour && rl.five_hour.used_percentage) || 0;
    const sd = (rl && rl.seven_day && rl.seven_day.used_percentage) || 0;
    dangerActive = PCT >= 90 || fh >= cfg.limitCrit || sd >= cfg.limitCrit;
  }
  if (cfg.shimmer === 'disco') {
    return lines.map((l) => recolor(l, (col) => { const [r, g, b] = hueRgb(col * 14 + idiv(cfg.nowMs, 6), 0); return tc(r, g, b); }));
  } else if (dangerActive) {
    const pulse = Math.abs((idiv(cfg.nowMs, 200) % 60) - 30);   // 0..30, slow throb
    return lines.map((l) => recolor(l, (col) => tc(150 + pulse + (col % 3) * 12, 18, 18)));
  }
  return lines;
}

type StatuslineRateLimits = { five_hour?: RateLimit; seven_day?: RateLimit } | null | undefined;
