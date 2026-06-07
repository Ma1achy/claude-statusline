// Parse the JSON config (~/.claude/statusline.json, or $SL_CONFIG) into one typed
// `cfg`. Single source of truth — the old ~50 SL_* env vars are gone (hard
// migration; `statusline.js --migrate` translates a legacy env block to JSON).
// Only timing/bootstrap still come from the environment, to keep tests/renders
// deterministic: SL_CONFIG (path), SL_FRAME_MS, SL_CLOCK_MS, SL_COLOR_MODE, NO_COLOR.
import * as fs from 'fs';
import * as os from 'os';
import { env, idiv } from './util';
import { PRESETS } from './presets';
import { gitOut } from './git';
import type { Config, ColorMode, StatuslineInput, Style } from './types';

// When config.autoTheme === 'branch' we read stdin here (to learn the cwd/branch
// before the theme resolves). The parsed input is shared so index.ts doesn't read
// stdin twice. Null unless branch-theming actually consumed it.
export let preInput: StatuslineInput | null = null;

// ── bootstrap (env only — deterministic for tests/renders) ────────────────────
const nowMs = parseInt(env('SL_FRAME_MS', ''), 10) || Date.now();
const clockMs = parseInt(env('SL_CLOCK_MS', ''), 10) || nowMs;

// ── load + merge config: preset bundle < explicit file ────────────────────────
function loadJson(): Record<string, any> {
  try {
    const p = process.env.SL_CONFIG || `${os.homedir()}/.claude/statusline.json`;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch { return {}; }                              // missing/bad config → all defaults
}
const raw = loadJson();
const preset = (typeof raw.preset === 'string' && PRESETS[raw.preset.toLowerCase()]) || {};
const J: Record<string, any> = { ...preset, ...raw };

// Typed readers — never throw, fall back per field (clamp/validate where needed).
const jstr = (k: string, d: string): string => (typeof J[k] === 'string' ? J[k] : d);
const jbool = (k: string): boolean => J[k] === true;
const jint = (k: string, d: number): number => (typeof J[k] === 'number' && Number.isFinite(J[k]) ? J[k] : d);
const jobj = (k: string): Record<string, any> | undefined =>
  (J[k] && typeof J[k] === 'object' && !Array.isArray(J[k]) ? J[k] : undefined);
const jlist = (k: string): string =>                 // hide / privacyHide: array or string
  (Array.isArray(J[k]) ? J[k].join(' ') : typeof J[k] === 'string' ? J[k] : '');

// Colour depth: NO_COLOR → mono; else SL_COLOR_MODE env; else config.colorMode;
// else auto-detect, defaulting to truecolor when uncertain.
function resolveColorMode(): ColorMode {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return 'mono';
  const m = (process.env.SL_COLOR_MODE || jstr('colorMode', 'auto')).toLowerCase();
  if (m === 'truecolor' || m === '256' || m === '16' || m === 'mono') return m as ColorMode;
  const ct = (process.env.COLORTERM || '').toLowerCase();
  if (ct.includes('truecolor') || ct.includes('24bit')) return 'truecolor';
  const term = (process.env.TERM || '').toLowerCase();
  if (term === 'dumb') return 'mono';
  if (term.includes('256')) return '256';
  return 'truecolor';
}

let shimmer = jstr('shimmer', 'sweep');
if (shimmer === 'pulse') shimmer = 'breathe';        // aliases
if (shimmer === 'march') shimmer = 'scan';
if (jbool('accessible')) shimmer = 'off';            // accessibility kills motion

// Clock-driven / branch auto-theme.
let themeName = jstr('theme', 'heat');
const autoTheme = jstr('autoTheme', '');
if (autoTheme === 'daynight') {
  const h = new Date(clockMs).getHours();
  themeName = h >= 7 && h < 19 ? jstr('dayTheme', 'heat') : jstr('nightTheme', 'tokyonight');
} else if (autoTheme === 'seasonal') {
  const m = new Date(clockMs).getMonth();
  themeName = m <= 1 || m === 11 ? 'void' : m <= 4 ? 'everforest' : m <= 7 ? 'oceanic' : 'verdigris';
} else if (autoTheme === 'branch') {
  try {
    if (!process.stdin.isTTY) {
      preInput = JSON.parse(fs.readFileSync(0, 'utf8')) as StatuslineInput;
      const cwd = (preInput && preInput.workspace && preInput.workspace.current_dir) || '';
      const br = gitOut(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const bt = jobj('branchThemes') || {};
      if (/^(main|master)$/i.test(br)) themeName = bt.main || 'nord';
      else if (/^(feat|feature)\//i.test(br)) themeName = bt.feat || 'everforest';
      else if (/^hotfix\//i.test(br)) themeName = bt.hotfix || 'heat';
      else if (/^(fix|bugfix)\//i.test(br)) themeName = bt.fix || 'gruvbox';
      else if (/^(exp|experiment)\//i.test(br)) themeName = bt.exp || 'tokyonight';
    }
  } catch { /* ignore — fall back to config.theme */ }
}

const projAliases = jobj('projectAliases');

export const cfg: Config = {
  shimmer,
  speed: jint('speed', 3),
  glow: jint('glow', 240),
  waveHue: jint('waveHue', 32),
  easing: jstr('easing', ''),
  themeName,
  barStyle: jstr('barStyle', 'blocks'),
  barScale: jstr('barScale', 'linear'),
  rainbowMixRaw: typeof J.rainbowMix === 'number' ? J.rainbowMix : null,
  margin: jint('margin', 6),
  colorMode: resolveColorMode(),
  themeFile: jstr('themeFile', ''),
  base16: jstr('base16', ''),
  pet: jbool('pet'),
  crest: jbool('crest'),
  moon: jbool('moon'),
  daynight: jbool('daynight'),
  costFlair: jbool('costFlair'),
  burn: jbool('burn'),
  gitExtra: jbool('gitExtra'),
  rainbowStats: jbool('rainbowStats'),
  trend: jbool('trend'),
  weather: jbool('weather'),
  limits: jbool('limits'),
  limitWarn: jint('limitWarn', 80),
  limitCrit: jint('limitCrit', 95),
  layout: jstr('layout', '3line'),
  separator: jstr('separator', ''),
  hide: jlist('hide'),
  privacy: jbool('privacy'),
  privacyHide: jlist('privacyHide'),
  projectAliases: projAliases ? JSON.stringify(projAliases) : jstr('projectAliases', ''),
  path: jstr('path', 'auto'),
  sysinfo: jbool('sysinfo'),
  accessible: jbool('accessible'),
  accessibleGauge: jstr('accessibleGauge', 'cvd'),
  responsive: jbool('responsive'),
  gitRisk: jbool('gitRisk'),
  danger: jbool('danger'),
  petStyle: jstr('petStyle', 'default'),
  petReactsTo: jstr('petReactsTo', ''),
  bell: jbool('bell'),
  nerdfont: jbool('nerdfont'),
  customSegment: jstr('customSegment', ''),
  event: false,
  tmuxPassthrough: jbool('tmuxPassthrough'),
  elements: jobj('elements') as Record<string, Style> | undefined,
  glyphs: jobj('glyphs') as Record<string, string> | undefined,
  labels: jobj('labels') as Record<string, string> | undefined,
  customTheme: jobj('customTheme'),
  nowMs,
  clockMs,
  baseFrame: idiv(nowMs, 1000),
};
