// Shared test harness: builds a deterministic fixture (fake home + git repo with
// a dummy email), runs the built statusline.js, and normalizes machine-specific
// paths to placeholders so golden files are portable.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const STATUSLINE = path.join(__dirname, '..', 'statusline.js');
const FRAME_MS = '1700000000123';   // fixed wall-clock → deterministic clock + git age (·0s)

function git(repo, args) { execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' }); }

function setupFixture() {
  // Fixed path (not mkdtemp) so the displayed cwd is deterministic AND portable
  // across machines — disco mode colours each glyph separately, which would break
  // any path-substring normalization. /tmp exists on macOS and Linux.
  const base = '/tmp/cs-statusline-fixture';
  fs.rmSync(base, { recursive: true, force: true });
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude.json'),
    JSON.stringify({ oauthAccount: { displayName: 'Malachy', emailAddress: 'malachy@email.com' } }));
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'),
    JSON.stringify({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '40' } }));

  const repo = path.join(base, 'principia');
  fs.mkdirSync(repo);
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'malachy@email.com']);
  git(repo, ['config', 'user.name', 'Malachy']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo, 'main.py'), 'engine\n');
  git(repo, ['add', 'main.py']);
  git(repo, ['commit', '-q', '-m', 'init']);
  git(repo, ['checkout', '-q', '-b', 'feat/statusline']);
  fs.appendFileSync(path.join(repo, 'main.py'), 'wip\n');
  git(repo, ['stash', '-q']);                       // → s:1
  fs.writeFileSync(path.join(repo, 'notes.tmp'), 'scratch\n');  // → untracked ?1
  return { base, home, repo };
}

function cleanup(fix) { try { fs.rmSync(fix.base, { recursive: true, force: true }); } catch { /* ignore */ } }

const SAMPLE = {
  model: { id: 'claude-opus-4-8', display_name: 'Opus' },
  context_window: {
    used_percentage: 42, context_window_size: 200000,
    current_usage: { cache_read_input_tokens: 61000, cache_creation_input_tokens: 1400, input_tokens: 380, output_tokens: 210 },
  },
  cost: { total_cost_usd: 0.234, total_duration_ms: 1860000, total_lines_added: 124, total_lines_removed: 18 },
  fast_mode: true,
  // resets relative to the fixed frame (1700000000s) → "2h 15m" / "3d 6h"
  rate_limits: { five_hour: { used_percentage: 63, resets_at: 1700008100 }, seven_day: { used_percentage: 38, resets_at: 1700280800 } },
};

// Config now lives in a JSON file, not env vars. CASES are still written in the
// familiar SL_* shorthand; this table translates each to its JSON config key so the
// goldens exercise the real config pipeline. Bootstrap vars stay in the environment.
const SL_MAP = {
  SL_THEME: ['theme', 's'], SL_SHIMMER: ['shimmer', 's'], SL_SPEED: ['speed', 'i'],
  SL_GLOW: ['glow', 'i'], SL_WAVE_HUE: ['waveHue', 'i'], SL_EASING: ['easing', 's'],
  SL_AUTO_THEME: ['autoTheme', 's'], SL_DAY_THEME: ['dayTheme', 's'], SL_NIGHT_THEME: ['nightTheme', 's'],
  SL_BAR_STYLE: ['barStyle', 's'], SL_BAR_SCALE: ['barScale', 's'], SL_RAINBOW_MIX: ['rainbowMix', 'i'],
  SL_MARGIN: ['margin', 'i'], SL_THEME_FILE: ['themeFile', 's'], SL_BASE16: ['base16', 's'],
  SL_LAYOUT: ['layout', 's'], SL_SEPARATOR: ['separator', 's'], SL_HIDE: ['hide', 's'],
  SL_PRIVACY_HIDE: ['privacyHide', 's'], SL_PROJECT_ALIASES: ['projectAliases', 'j'], SL_PATH: ['path', 's'],
  SL_ACCESSIBLE_GAUGE: ['accessibleGauge', 's'], SL_PET_STYLE: ['petStyle', 's'], SL_PET_REACTS_TO: ['petReactsTo', 's'],
  SL_CUSTOM_SEGMENT: ['customSegment', 's'], SL_PRESET: ['preset', 's'],
  SL_LIMIT_WARN: ['limitWarn', 'i'], SL_LIMIT_CRIT: ['limitCrit', 'i'],
  SL_PET: ['pet', 'b'], SL_CREST: ['crest', 'b'], SL_MOON: ['moon', 'b'], SL_DAYNIGHT: ['daynight', 'b'],
  SL_COST_FLAIR: ['costFlair', 'b'], SL_BURN: ['burn', 'b'], SL_GIT_EXTRA: ['gitExtra', 'b'],
  SL_RAINBOW_STATS: ['rainbowStats', 'b'], SL_TREND: ['trend', 'b'], SL_WEATHER: ['weather', 'b'],
  SL_LIMITS: ['limits', 'b'], SL_PRIVACY: ['privacy', 'b'], SL_SYSINFO: ['sysinfo', 'b'],
  SL_ACCESSIBLE: ['accessible', 'b'], SL_RESPONSIVE: ['responsive', 'b'], SL_GIT_RISK: ['gitRisk', 'b'],
  SL_DANGER: ['danger', 'b'], SL_BELL: ['bell', 'b'], SL_NERDFONT: ['nerdfont', 'b'], SL_TMUX_PASSTHROUGH: ['tmuxPassthrough', 'b'],
};
// Bootstrap stays in the environment (deterministic; not part of the JSON config).
const BOOTSTRAP = new Set(['SL_FRAME_MS', 'SL_CLOCK_MS', 'SL_COLOR_MODE', 'NO_COLOR', 'COLUMNS', 'TMPDIR']);

// Translate SL_* shorthand → JSON config written to <home>/.claude/statusline.json;
// returns bootstrap overrides (SL_FRAME_MS etc.) to merge into the env. Used by run()
// and by the standalone tests that drive statusline.js directly.
function writeConfig(homeDir, overrides) {
  const conf = {}, envExtra = {};
  for (const [k, v] of Object.entries(overrides || {})) {
    if (BOOTSTRAP.has(k)) { envExtra[k] = v; continue; }
    if (k.startsWith('SL_BRANCH_')) { (conf.branchThemes || (conf.branchThemes = {}))[k.slice(10).toLowerCase()] = v; continue; }
    const m = SL_MAP[k];
    if (!m) { envExtra[k] = v; continue; }                              // unknown → leave in env
    const [key, t] = m;
    conf[key] = t === 'b' ? /^(on|1|true|yes)$/i.test(v) : t === 'i' ? parseInt(v, 10) : t === 'j' ? JSON.parse(v) : v;
  }
  fs.mkdirSync(path.join(homeDir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(homeDir, '.claude', 'statusline.json'), JSON.stringify(conf));
  return envExtra;
}

function run(fix, envOverrides) {
  const sample = { ...SAMPLE, workspace: { current_dir: fix.repo } };
  const input = JSON.stringify(sample);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-state-'));
  const envExtra = writeConfig(fix.home, envOverrides);
  const env = { HOME: fix.home, PATH: process.env.PATH, TZ: 'UTC', COLUMNS: '124', SL_FRAME_MS: FRAME_MS, SL_COLOR_MODE: 'truecolor', TMPDIR: stateDir, ...envExtra };
  // Git runs only in the detached refresher → warm the cache, then render; unique
  // TMPDIR per call isolates the session-state file from concurrent tests.
  try {
    execFileSync('node', [STATUSLINE, '--git-refresh'], { input, encoding: 'utf8', env });
    return execFileSync('node', [STATUSLINE], { input, encoding: 'utf8', env });
  } finally {
    try { fs.rmSync(stateDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// The matrix of scenarios that get golden snapshots.
const CASES = [
  ['plain', {}],
  ...['sweep', 'wave', 'comet', 'breathe', 'scan', 'off', 'disco',
      'drift', 'aurora', 'plasma', 'glitch', 'lumin', 'heartbeat', 'twinkle', 'storm', 'morse',
      'flash', 'ripple'].map((s) => [`shimmer-${s}`, { SL_SHIMMER: s }]),
  ['easing-ease', { SL_SHIMMER: 'sweep', SL_EASING: 'ease' }],
  ...['heat', 'synthwave', 'matrix', 'mono', 'pastel', 'dracula', 'nord', 'gruvbox', 'tokyonight', 'rosepine',
      'viridis', 'inferno', 'magma', 'plasma', 'cividis',
      'twilight', 'twilight_shifted', 'cubehelix', 'batlow', 'turbo', 'coolwarm', 'rdbu', 'ice', 'deep'].map((t) => [`theme-${t}`, { SL_THEME: t }]),
  ...['catppuccin-mocha', 'catppuccin-macchiato', 'catppuccin-frappe', 'catppuccin-latte',
      'solarized-dark', 'solarized-light', 'kanagawa', 'everforest', 'onedark',
      'ayu-dark', 'ayu-mirage', 'ayu-light', 'github-dark', 'github-light', 'monokai', 'monokai-pro',
      'cyberpunk', 'phosphor', 'phosphor-green', 'phosphor-white', 'verdigris', 'sumi-e',
      'stealth', 'zen', 'void', 'gothic', 'oceanic', 'pride', 'trans', 'bi', 'ace', 'nonbinary',
      'silver-halide'].map((t) => [`theme-${t}`, { SL_THEME: t }]),
  ...['blocks', 'pacman', 'snake', 'matrix', 'braille', 'battery', 'thermo', 'shade',
      'lines', 'rule', 'equalizer', 'dna', 'train'].map((b) => [`bar-${b}`, { SL_BAR_STYLE: b }]),
  ['bar-scale-log', { SL_BAR_SCALE: 'log' }],
  ...['256', '16', 'mono'].map((m) => [`color-${m}`, { SL_COLOR_MODE: m }]),
  ['weather', { SL_WEATHER: 'on' }],
  ...['tiny', '1line', '2line'].map((l) => [`layout-${l}`, { SL_LAYOUT: l }]),
  ['hide', { SL_HIDE: 'clock,usage,name' }],
  ['separator', { SL_SEPARATOR: '|' }],
  ['privacy', { SL_PRIVACY: 'on', SL_GIT_EXTRA: 'on' }],
  ['nerdfont', { SL_NERDFONT: 'on' }],
  ['style-showcase', { SL_THEME: 'showcase' }],
  ['accessible', { SL_ACCESSIBLE: 'on' }],
  ['accessible-traffic', { SL_ACCESSIBLE: 'on', SL_ACCESSIBLE_GAUGE: 'traffic' }],
  ['accessible-grayscale', { SL_ACCESSIBLE: 'on', SL_ACCESSIBLE_GAUGE: 'grayscale' }],
  ['git-risk', { SL_GIT_RISK: 'on' }],
  ...['cat', 'frog', 'robot', 'ghost', 'slime', 'dog'].map((s) => [`pet-${s}`, { SL_PET: 'on', SL_PET_STYLE: s }]),
  ['loaded', { SL_PET: 'on', SL_CREST: 'on', SL_MOON: 'on', SL_DAYNIGHT: 'on', SL_COST_FLAIR: 'on', SL_BURN: 'on', SL_GIT_EXTRA: 'on', SL_RAINBOW_STATS: 'on', SL_SHIMMER: 'wave' }],
];

module.exports = { setupFixture, cleanup, run, writeConfig, CASES, STATUSLINE };
