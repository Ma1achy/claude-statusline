// ANSI attributes + width-aware layout. Accent colours live in themes.ts
// (they're theme-dependent); these are the static attributes and helpers.
import { execFileSync } from 'child_process';
import { env } from './util';
import { cfg } from './config';

export const ESC = '\x1b';
export const R = '\x1b[0m';
export const DIM = '\x1b[2m';
export const BOLD = '\x1b[1m';

/** Truecolor foreground escape. */
export const tc = (r: number, g: number, b: number): string => `${ESC}[38;2;${r};${g};${b}m`;

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
