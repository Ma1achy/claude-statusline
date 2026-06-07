// Parse every SL_* env var (and the wall-clock frame) into one typed config.
import { env, idiv } from './util';
import { PRESETS } from './presets';
import type { Config, ColorMode } from './types';

// A named preset (SL_PRESET) supplies fallback values for any SL_* var. The
// three preset-aware readers below enforce: explicit env > preset > default.
const preset = PRESETS[(process.env.SL_PRESET || '').toLowerCase()] || {};
const penv = (k: string, d: string): string => {
  const e = process.env[k];
  if (e !== undefined && e !== '') return e;       // an explicit env var always wins
  if (preset[k] !== undefined) return preset[k];   // then the active preset
  return d;                                         // then the hardcoded default
};
const pbool = (k: string): boolean => /^(on|1|true|yes)$/i.test(penv(k, ''));
const pint = (k: string, d: number): number => {
  const v = parseInt(penv(k, ''), 10);
  return Number.isFinite(v) ? v : d;
};

// Colour depth: honour the NO_COLOR convention, then an explicit SL_COLOR_MODE,
// then auto-detect from COLORTERM/TERM. When uncertain we assume truecolor —
// Claude Code targets modern terminals, and this keeps the default output (and
// the golden snapshots) on the full-colour path.
function resolveColorMode(): ColorMode {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return 'mono';
  const m = penv('SL_COLOR_MODE', 'auto').toLowerCase();
  if (m === 'truecolor' || m === '256' || m === '16' || m === 'mono') return m;
  const ct = (process.env.COLORTERM || '').toLowerCase();
  if (ct.includes('truecolor') || ct.includes('24bit')) return 'truecolor';
  const term = (process.env.TERM || '').toLowerCase();
  if (term === 'dumb') return 'mono';
  if (term.includes('256')) return '256';
  return 'truecolor';
}

let shimmer = penv('SL_SHIMMER', 'sweep');
if (shimmer === 'pulse') shimmer = 'breathe';   // aliases
if (shimmer === 'march') shimmer = 'scan';

// Claude Code repaints at most once/second (refreshInterval is in seconds, min 1),
// so ms timing can't make motion sub-second-smooth — it just keeps the animation
// phase honest and drives the rainbow. SL_FRAME_MS overrides for tests/renders.
// Timing vars read process.env directly (never a preset) to keep tests deterministic.
const nowMs = parseInt(env('SL_FRAME_MS', ''), 10) || Date.now();
// SL_CLOCK_MS freezes the clock/day-night display independently of the animation
// frame — used by the demo renderer to make GIFs loop without the clock ticking.
const clockMs = parseInt(env('SL_CLOCK_MS', ''), 10) || nowMs;

const rainbowMix = penv('SL_RAINBOW_MIX', '');

export const cfg: Config = {
  shimmer,
  speed: pint('SL_SPEED', 3),
  glow: pint('SL_GLOW', 240),
  waveHue: pint('SL_WAVE_HUE', 32),
  themeName: penv('SL_THEME', 'heat'),
  barStyle: penv('SL_BAR_STYLE', 'blocks'),
  rainbowMixRaw: rainbowMix !== '' ? parseInt(rainbowMix, 10) : null,
  margin: pint('SL_MARGIN', 6),
  colorMode: resolveColorMode(),
  themeFile: penv('SL_THEME_FILE', ''),
  base16: penv('SL_BASE16', ''),
  pet: pbool('SL_PET'),
  crest: pbool('SL_CREST'),
  moon: pbool('SL_MOON'),
  daynight: pbool('SL_DAYNIGHT'),
  costFlair: pbool('SL_COST_FLAIR'),
  burn: pbool('SL_BURN'),
  gitExtra: pbool('SL_GIT_EXTRA'),
  rainbowStats: pbool('SL_RAINBOW_STATS'),
  nowMs,
  clockMs,
  baseFrame: idiv(nowMs, 1000),
};
