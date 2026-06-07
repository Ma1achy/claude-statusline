// Parse every SL_* env var (and the wall-clock frame) into one typed config.
import * as fs from 'fs';
import { env, idiv } from './util';
import { PRESETS } from './presets';
import { gitOut } from './git';
import type { Config, ColorMode, StatuslineInput } from './types';

// When SL_AUTO_THEME=branch we must read stdin here (to learn the cwd/branch
// before the theme is resolved). The parsed input is shared so index.ts doesn't
// read stdin a second time. Null unless branch-theming actually consumed it.
export let preInput: StatuslineInput | null = null;

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
// Accessibility: kill motion (reduces distraction / flashing). Pairs well with
// NO_COLOR or SL_COLOR_MODE=mono and the CVD-safe colormaps.
if (pbool('SL_ACCESSIBLE')) shimmer = 'off';

// Claude Code repaints at most once/second (refreshInterval is in seconds, min 1),
// so ms timing can't make motion sub-second-smooth — it just keeps the animation
// phase honest and drives the rainbow. SL_FRAME_MS overrides for tests/renders.
// Timing vars read process.env directly (never a preset) to keep tests deterministic.
const nowMs = parseInt(env('SL_FRAME_MS', ''), 10) || Date.now();
// SL_CLOCK_MS freezes the clock/day-night display independently of the animation
// frame — used by the demo renderer to make GIFs loop without the clock ticking.
const clockMs = parseInt(env('SL_CLOCK_MS', ''), 10) || nowMs;

// Clock-driven auto-theme (SL_AUTO_THEME). daynight/seasonal resolve from the
// frame clock here; branch-based theming would need stdin and isn't done yet.
let themeName = penv('SL_THEME', 'heat');
const autoTheme = penv('SL_AUTO_THEME', '');
if (autoTheme === 'daynight') {
  const h = new Date(clockMs).getHours();
  themeName = h >= 7 && h < 19 ? penv('SL_DAY_THEME', 'heat') : penv('SL_NIGHT_THEME', 'tokyonight');
} else if (autoTheme === 'seasonal') {
  const m = new Date(clockMs).getMonth();
  themeName = m <= 1 || m === 11 ? 'void' : m <= 4 ? 'everforest' : m <= 7 ? 'oceanic' : 'verdigris';
} else if (autoTheme === 'branch') {
  // Read stdin now (only when piped — never block an interactive TTY), find the
  // git branch, and map it to a theme. Branch prefixes are overridable.
  try {
    if (!process.stdin.isTTY) {
      preInput = JSON.parse(fs.readFileSync(0, 'utf8')) as StatuslineInput;
      const cwd = (preInput && preInput.workspace && preInput.workspace.current_dir) || '';
      const br = gitOut(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (/^(main|master)$/i.test(br)) themeName = penv('SL_BRANCH_MAIN', 'nord');
      else if (/^(feat|feature)\//i.test(br)) themeName = penv('SL_BRANCH_FEAT', 'everforest');
      else if (/^hotfix\//i.test(br)) themeName = penv('SL_BRANCH_HOTFIX', 'heat');
      else if (/^(fix|bugfix)\//i.test(br)) themeName = penv('SL_BRANCH_FIX', 'gruvbox');
      else if (/^(exp|experiment)\//i.test(br)) themeName = penv('SL_BRANCH_EXP', 'tokyonight');
    }
  } catch { /* ignore — fall back to SL_THEME */ }
}

const rainbowMix = penv('SL_RAINBOW_MIX', '');

export const cfg: Config = {
  shimmer,
  speed: pint('SL_SPEED', 3),
  glow: pint('SL_GLOW', 240),
  waveHue: pint('SL_WAVE_HUE', 32),
  easing: penv('SL_EASING', ''),
  themeName,
  barStyle: penv('SL_BAR_STYLE', 'blocks'),
  barScale: penv('SL_BAR_SCALE', 'linear'),
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
  trend: pbool('SL_TREND'),
  weather: pbool('SL_WEATHER'),
  limits: pbool('SL_LIMITS'),
  limitWarn: pint('SL_LIMIT_WARN', 80),
  limitCrit: pint('SL_LIMIT_CRIT', 95),
  layout: penv('SL_LAYOUT', '3line'),
  separator: penv('SL_SEPARATOR', ''),
  hide: penv('SL_HIDE', ''),
  privacy: pbool('SL_PRIVACY'),
  privacyHide: penv('SL_PRIVACY_HIDE', ''),
  projectAliases: penv('SL_PROJECT_ALIASES', ''),
  path: penv('SL_PATH', 'auto'),
  sysinfo: pbool('SL_SYSINFO'),
  accessible: pbool('SL_ACCESSIBLE'),
  responsive: pbool('SL_RESPONSIVE'),
  gitRisk: pbool('SL_GIT_RISK'),
  danger: pbool('SL_DANGER'),
  petStyle: penv('SL_PET_STYLE', 'default'),
  petReactsTo: penv('SL_PET_REACTS_TO', ''),
  bell: pbool('SL_BELL'),
  nerdfont: pbool('SL_NERDFONT'),
  customSegment: penv('SL_CUSTOM_SEGMENT', ''),
  event: false,
  tmuxPassthrough: pbool('SL_TMUX_PASSTHROUGH'),
  // Git always runs off the hot path: the foreground render paints from a cached
  // git snapshot and a detached background process (this same binary, run with
  // --git-refresh → refreshGitCache) re-execs git and rewrites the cache. The
  // render itself never execs git, so a large/slow repo can't push a repaint past
  // refreshInterval (which would get the in-flight run cancelled, freezing the clock).
  nowMs,
  clockMs,
  baseFrame: idiv(nowMs, 1000),
};
