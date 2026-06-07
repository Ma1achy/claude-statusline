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

// ── load + merge config: preset bundle < explicit file ────────────────────────
function loadJson(): Record<string, any> {
  try {
    const p = process.env.SL_CONFIG || `${os.homedir()}/.claude/statusline.json`;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch { return {}; }                              // missing/bad config → all defaults
}

// Build the typed config from the environment + JSON file. Pure aside from the
// branch-auto-theme stdin read (which sets preInput); called once at module load
// and again by resetConfigForTest() so tests can drive different environments.
function loadConfig(): Config {
  // ── bootstrap (env only — deterministic for tests/renders) ────────────────────
  const nowMs = parseInt(env('SL_FRAME_MS', ''), 10) || Date.now();
  const clockMs = parseInt(env('SL_CLOCK_MS', ''), 10) || nowMs;

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
  const resolveColorMode = (): ColorMode => {
    if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return 'mono';
    const m = (process.env.SL_COLOR_MODE || jstr('colorMode', 'auto')).toLowerCase();
    if (m === 'truecolor' || m === '256' || m === '16' || m === 'mono') return m as ColorMode;
    const ct = (process.env.COLORTERM || '').toLowerCase();
    if (ct.includes('truecolor') || ct.includes('24bit')) return 'truecolor';
    const term = (process.env.TERM || '').toLowerCase();
    if (term === 'dumb') return 'mono';
    if (term.includes('256')) return '256';
    return 'truecolor';
  };

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
  }
  // autoTheme === 'branch' is resolved at render time (it execs git) — see
  // resolveBranchTheme(), called from build(). Kept out of module load so importing
  // config has no I/O side effect.

  const projAliases = jobj('projectAliases');
  const branchThemes = jobj('branchThemes') as Record<string, string> | undefined;

  return {
    shimmer,
    speed: jint('speed', 3),
    glow: jint('glow', 240),
    waveHue: jint('waveHue', 32),
    easing: jstr('easing', ''),
    themeName,
    autoTheme,
    branchThemes,
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
    frame: jstr('frame', ''),
    privacy: jbool('privacy'),
    privacyHide: jlist('privacyHide'),
    projectAliases: projAliases ? JSON.stringify(projAliases) : jstr('projectAliases', ''),
    path: jstr('path', 'auto'),
    sysinfo: jbool('sysinfo'),
    accessible: jbool('accessible'),
    accessibleGauge: jstr('accessibleGauge', 'cvd'),
    responsive: jbool('responsive'),
    adaptive: jbool('adaptive'),
    gitRisk: jbool('gitRisk'),
    danger: jbool('danger'),
    warningLine: jbool('warningLine'),
    activityLine: jbool('activityLine'),
    conversationLine: jbool('conversationLine'),
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
}

export const cfg: Config = loadConfig();

// Test-only: recompute the config from the current environment, mutating the
// existing `cfg` object in place so every module's imported reference stays valid.
// (Themes/roles are computed once at load from `cfg`; theme-dependent code is
// covered by the golden suite, so this resets config-driven behaviour only.)
export function resetConfigForTest(): void {
  Object.assign(cfg, loadConfig());
}

// Branch auto-theming (autoTheme: 'branch'): resolve the theme from the current
// git branch at RENDER time (this execs git, so it must not run at import). Called
// from build() with the already-read input; sets cfg.themeName and returns whether
// it changed (so build() knows to rebuild the theme). No-op unless autoTheme:branch.
export function resolveBranchTheme(input: StatuslineInput): boolean {
  if (cfg.autoTheme !== 'branch') return false;
  try {
    const cwd = (input && input.workspace && input.workspace.current_dir) || '';
    const br = gitOut(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const bt = cfg.branchThemes || {};
    let name = '';
    if (/^(main|master)$/i.test(br)) name = bt.main || 'nord';
    else if (/^(feat|feature)\//i.test(br)) name = bt.feat || 'everforest';
    else if (/^hotfix\//i.test(br)) name = bt.hotfix || 'heat';
    else if (/^(fix|bugfix)\//i.test(br)) name = bt.fix || 'gruvbox';
    else if (/^(exp|experiment)\//i.test(br)) name = bt.exp || 'tokyonight';
    if (name) { cfg.themeName = name; return true; }
  } catch { /* ignore — fall back to config.theme */ }
  return false;
}
