// Command-line helpers: `statusline.js --preview | --doctor | --report`.
// preview re-runs THIS script as a child with different SL_* env (so it shows the
// real rendered output); doctor/report just inspect the environment and history.
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { ESC, R, DIM, BOLD } from './ansi';
import { cfg } from './config';
import { THEMES_DATA } from './themes.data';
import { readHistory } from './state';
import { median } from './insight';

const SAMPLE = JSON.stringify({
  session_id: 'preview',
  model: { id: 'claude-opus-4-8', display_name: 'Opus' },
  workspace: { current_dir: process.cwd() },
  context_window: { used_percentage: 58, context_window_size: 200000, current_usage: { cache_read_input_tokens: 61000, input_tokens: 380, output_tokens: 210 } },
  cost: { total_cost_usd: 0.34, total_duration_ms: 1860000, total_lines_added: 124, total_lines_removed: 18 },
  fast_mode: true,
  rate_limits: { five_hour: { used_percentage: 63, resets_at: 9999999999 }, seven_day: { used_percentage: 38, resets_at: 9999999999 } },
});

/** Run this script as a child with extra env; return its second line (the bar). */
function renderBar(env: Record<string, string>): string {
  try {
    const out = execFileSync(process.execPath, [process.argv[1]], {
      input: SAMPLE, encoding: 'utf8',
      env: { ...process.env, COLUMNS: '120', SL_FRAME_MS: '1700000000123', SL_COLOR_MODE: 'truecolor', ...env },
    });
    return out.split('\n')[1] || '';
  } catch { return `${DIM}(error)${R}`; }
}

export function runPreview(): void {
  const pad = (s: string): string => (s + ' '.repeat(22)).slice(0, 22);
  const section = (title: string, rows: Array<[string, Record<string, string>]>): void => {
    process.stdout.write(`\n${BOLD}${title}${R}\n`);
    for (const [label, env] of rows) process.stdout.write(`  ${DIM}${pad(label)}${R} ${renderBar(env)}\n`);
  };
  section('Themes (SL_THEME)', Object.keys(THEMES_DATA).map((t) => [t, { SL_THEME: t }] as [string, Record<string, string>]));
  section('Bar styles (SL_BAR_STYLE)', ['blocks', 'pacman', 'snake', 'matrix', 'braille', 'battery', 'thermo', 'shade', 'lines', 'rule', 'equalizer', 'dna', 'train'].map((b) => [b, { SL_BAR_STYLE: b }] as [string, Record<string, string>]));
  section('Shimmer (SL_SHIMMER)', ['sweep', 'wave', 'comet', 'breathe', 'scan', 'drift', 'plasma', 'lumin', 'heartbeat', 'twinkle', 'storm', 'glitch', 'off'].map((s) => [s, { SL_SHIMMER: s }] as [string, Record<string, string>]));
  process.stdout.write('\n');
}

export function runDoctor(): void {
  const ok = (b: boolean): string => (b ? `${ESC}[32m✓${R}` : `${ESC}[31m✗${R}`);
  const line = (k: string, v: string): void => { process.stdout.write(`  ${DIM}${(k + ' '.repeat(16)).slice(0, 16)}${R} ${v}\n`); };
  process.stdout.write(`${BOLD}claude-statusline --doctor${R}\n`);
  const ct = (process.env.COLORTERM || '').toLowerCase();
  const truecolor = ct.includes('truecolor') || ct.includes('24bit');
  let gitVer = '';
  try { gitVer = execFileSync('git', ['--version'], { encoding: 'utf8' }).trim(); } catch { /* no git */ }
  line('node', process.version);
  line('truecolor', `${ok(truecolor)} ${DIM}(COLORTERM=${process.env.COLORTERM || 'unset'})${R}`);
  line('resolved mode', cfg.colorMode);
  line('TERM', process.env.TERM || 'unset');
  line('tmux', process.env.TMUX ? `${ok(true)} (multiplexer — truecolor may need passthrough)` : 'no');
  line('git', gitVer ? `${ok(true)} ${gitVer}` : `${ok(false)} not found`);
  line('git mode', `${DIM}cached + background refresh (off the hot path; refreshInterval-safe)${R}`);
  line('NO_COLOR', process.env.NO_COLOR ? 'set (forces mono)' : 'unset');
  const active = Object.keys(process.env).filter((k) => k.startsWith('SL_')).sort();
  process.stdout.write(`\n${BOLD}Active SL_* vars${R}\n`);
  if (!active.length) process.stdout.write(`  ${DIM}(none)${R}\n`);
  for (const k of active) process.stdout.write(`  ${DIM}${k}${R}=${process.env[k]}\n`);
  // conflicts
  const warn: string[] = [];
  if (process.env.NO_COLOR && process.env.SL_THEME) warn.push('NO_COLOR forces mono — SL_THEME has no visible effect.');
  if (cfg.colorMode === 'mono' && cfg.shimmer === 'disco') warn.push('disco needs colour but SL_COLOR_MODE=mono — animation will be invisible.');
  if (cfg.colorMode !== 'truecolor' && process.env.SL_THEME) warn.push(`Colour mode is ${cfg.colorMode}; themes are approximated below truecolor.`);
  if (warn.length) { process.stdout.write(`\n${BOLD}Notes${R}\n`); for (const w of warn) process.stdout.write(`  ${ESC}[33m!${R} ${w}\n`); }
  process.stdout.write('\n');
}

export function runReport(): void {
  process.stdout.write(`${BOLD}claude-statusline --report${R}\n`);
  const hist = readHistory();
  if (!hist.length) { process.stdout.write(`  ${DIM}no cross-session history yet (enable SL_BURN to start recording)${R}\n`); return; }
  const rates = hist.filter((h) => h.dur >= 60000 && h.cost > 0).map((h) => h.cost / (h.dur / 3600000));
  const totalCost = hist.reduce((m, h) => Math.max(m, h.cost), 0);
  const line = (k: string, v: string): void => { process.stdout.write(`  ${DIM}${(k + ' '.repeat(18)).slice(0, 18)}${R} ${v}\n`); };
  line('samples', String(hist.length));
  line('peak cost seen', `$${totalCost.toFixed(2)}`);
  if (rates.length) {
    line('median burn', `$${median(rates).toFixed(2)}/hr`);
    line('fastest burn', `$${Math.max(...rates).toFixed(2)}/hr`);
  }
  line('peak context', `${Math.max(...hist.map((h) => h.ctx))}%`);
  process.stdout.write('\n');
}
