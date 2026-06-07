// ANSI attributes + width-aware layout. Accent colours live in themes.ts
// (they're theme-dependent); these are the static attributes and helpers.
import { execFileSync } from 'child_process';
import { env } from './util';
import { cfg } from './config';
import type { RGB } from './types';

export const ESC = '\x1b';
export const R = '\x1b[0m';
export const DIM = '\x1b[2m';
export const BOLD = '\x1b[1m';

// ── colour-depth quantizers (pure integer math, no deps) ──────────────────────
/** RGB → nearest xterm-256 index (6×6×6 cube, with the dedicated grey ramp). */
function rgbTo256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const q = (v: number): number => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}
/** RGB → an SGR param for the nearest of the 8/16 ANSI colours (fg or bg). */
function rgbTo16(r: number, g: number, b: number, isBg: boolean): number {
  const max = Math.max(r, g, b);
  if (max < 40) return isBg ? 40 : 30;            // black
  const thr = max / 2;
  const code = (r >= thr ? 1 : 0) | (g >= thr ? 2 : 0) | (b >= thr ? 4 : 0);
  const bright = max > 170;
  return (isBg ? (bright ? 100 : 40) : (bright ? 90 : 30)) + code;
}

/** Foreground escape for the active colour mode. */
export function tc(r: number, g: number, b: number): string {
  switch (cfg.colorMode) {
    case 'mono': return '';
    case '16': return `${ESC}[${rgbTo16(r, g, b, false)}m`;
    case '256': return `${ESC}[38;5;${rgbTo256(r, g, b)}m`;
    default: return `${ESC}[38;2;${r};${g};${b}m`;
  }
}
/** Background escape for the active colour mode. */
export function bg(r: number, g: number, b: number): string {
  switch (cfg.colorMode) {
    case 'mono': return '';
    case '16': return `${ESC}[${rgbTo16(r, g, b, true)}m`;
    case '256': return `${ESC}[48;5;${rgbTo256(r, g, b)}m`;
    default: return `${ESC}[48;2;${r};${g};${b}m`;
  }
}
/** Combined fg+bg (one SGR in truecolor — byte-identical to the old half-block
 *  escape; split into two escapes in 256/16; nothing in mono). */
export function fgbg(f: RGB, b: RGB): string {
  if (cfg.colorMode === 'truecolor') return `${ESC}[38;2;${f[0]};${f[1]};${f[2]};48;2;${b[0]};${b[1]};${b[2]}m`;
  return tc(f[0], f[1], f[2]) + bg(b[0], b[1], b[2]);
}
/** Dim + fg in one SGR (byte-identical to `\x1b[2;38;2;…m` in truecolor). */
export function dimFg(r: number, g: number, b: number): string {
  if (cfg.colorMode === 'truecolor') return `${ESC}[2;38;2;${r};${g};${b}m`;
  return DIM + tc(r, g, b);
}

// Text-presentation selector (U+FE0E): forces emoji-capable glyphs (⚡, arrows,
// squares…) to render as plain text so they obey our ANSI colour instead of
// showing as a fixed-colour emoji. Append it to any such glyph via txt().
export const VS = '︎';
export const txt = (glyph: string): string => glyph + VS;

export const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

/** Visible width in glyphs — strips ANSI and zero-width variation selectors. */
export const printLen = (s: string): number =>
  Array.from(stripAnsi(s).replace(/[︀-️]/g, '')).length;

export function termCols(): number {
  // `tput cols` first (reads the controlling terminal even when stdout is piped,
  // as Claude Code does); then a TTY stdout; then $COLUMNS; then a default.
  // tput is absent on Windows PowerShell (throws) → we fall through.
  let c = 0;
  try {
    c = parseInt(
      execFileSync('tput', ['cols'], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'ignore'], windowsHide: true }),
      10,
    );
  } catch { /* no tput */ }
  if (!c) c = process.stdout.columns || parseInt(env('COLUMNS', ''), 10) || 120;
  if (!Number.isFinite(c) || c < 20) c = 120;
  return c;
}

/** "left … right" right-flushed to the terminal width (minus the gutter margin). */
export function justified(left: string, right: string): string {
  if (stripAnsi(right).length === 0) return left;
  let pad = termCols() - printLen(left) - printLen(right) - cfg.margin;
  if (pad < 1) pad = 1;
  return left + ' '.repeat(pad) + right;
}
