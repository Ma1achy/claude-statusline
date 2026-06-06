#!/usr/bin/env node
// statusline.js — three-line statusline for Claude Code (cross-platform)
// Works on macOS, Linux, and Windows (Git Bash or PowerShell). Pure Node.js:
// no jq, perl, tput, sed, etc. Only external dependency is `git` (optional).
//
// Layout:
//   1  {glyph} [Model 1M effort thinking]                       Day DD Mon  HH:MM:SS
//   2  ∅ [context-bar] pct |cmp  ctx cache…           5h [bar] %  7d [bar] %
//   3  dir › file  ⎇ branch  email  +adds/-dels ~dirty ●staged       name $cost age
//
// The clock ticks seconds, so the line repaints every second. REQUIRED in
// settings.json:  "statusLine": { ..., "refreshInterval": 1 }
//
// Install: see README. Configure via env vars in settings.json "env" block:
//   SL_SHIMMER  sweep|comet|breathe|wave|scan|disco|off  (default sweep)
//   SL_WAVE_HUE  hue rotation at crest, degrees     (default 32)
//   SL_SPEED     crest travel, cells/sec            (default 3)
//   SL_RAINBOW_MIX  account-name pastel 0..100      (default 50)
//   SL_MARGIN    right-edge gutter columns          (default 6)
//   SL_THEME     heat|synthwave|matrix|mono|pastel  (default heat)
//   SL_BAR_STYLE blocks|pacman|snake|matrix         (default blocks)
// Opt-in whimsy (all default OFF; set to on/1/true):
//   SL_SPINNER   braille spinner on line 1
//   SL_PET       ASCII pet face reacting to context/cost
//   SL_CREST     per-model accent glyph (★ Opus / ◆ Sonnet / ▲ Haiku)
//   SL_MOON      moon-phase glyph before the clock
//   SL_DAYNIGHT  clock colour shifts with the hour
//   SL_COST_FLAIR  spend-tier prefix on the cost segment
//   SL_BURN      append $/hr burn rate after cost
//   SL_GIT_EXTRA ahead/behind, commit age, untracked, stash, branch mood

'use strict';
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

// ── input ────────────────────────────────────────────────────────────────
let input = '';
try { input = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
let data = {};
try { data = JSON.parse(input) || {}; } catch { data = {}; }

// ── colours (real ESC bytes) ───────────────────────────────────────────────
const ESC = '\x1b';
const R = '\x1b[0m', DIM = '\x1b[2m', BOLD = '\x1b[1m';
const RED = '\x1b[31m', GREEN = '\x1b[32m', AMBER = '\x1b[33m';
const BLUE = '\x1b[34m', CYAN = '\x1b[36m', WHITE = '\x1b[37m';
const GOLD = '\x1b[38;5;220m';

// ── helpers ────────────────────────────────────────────────────────────────
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const bool = (k) => /^(on|1|true|yes)$/i.test(env(k, ''));  // opt-in toggle
const idiv = (a, b) => Math.trunc(a / b);                 // C-like integer division
const mod = (a, b) => ((a % b) + b) % b;
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const printLen = (s) => Array.from(stripAnsi(s)).length;  // count glyphs, not bytes

function termCols() {
  // Match the bash version's priority: `tput cols` first (it can read the
  // controlling terminal even when our stdout is piped, as Claude Code does),
  // then a TTY stdout, then $COLUMNS, then a sane default. `tput` exists on
  // macOS/Linux and in Git Bash; on Windows PowerShell it's absent (throws)
  // and we fall through to the other sources.
  let c = 0;
  try {
    c = parseInt(execFileSync('tput', ['cols'],
      { encoding: 'utf8', stdio: ['inherit', 'pipe', 'ignore'], windowsHide: true }), 10);
  } catch { /* no tput */ }
  if (!c) c = process.stdout.columns || parseInt(env('COLUMNS', ''), 10) || 120;
  if (!Number.isFinite(c) || c < 20) c = 120;
  return c;
}

// MARGIN keeps the right content clear of Claude Code's statusline gutter.
const SL_MARGIN = parseInt(env('SL_MARGIN', '6'), 10);
function justified(left, right) {
  if (stripAnsi(right).length === 0) return left;
  let pad = termCols() - printLen(left) - printLen(right) - SL_MARGIN;
  if (pad < 1) pad = 1;
  return left + ' '.repeat(pad) + right;
}

function fmtK(n) {
  if (n >= 1000000) return idiv(n, 1000000) + 'M';
  if (n >= 1000) return idiv(n, 1000) + 'k';
  return String(n);
}

function fmtCountdown(secs) {
  if (secs >= 86400) return `${idiv(secs, 86400)}d ${idiv(secs % 86400, 3600)}h`;
  if (secs >= 3600) return `${idiv(secs, 3600)}h ${idiv(secs % 3600, 60)}m`;
  return `${idiv(secs, 60)}m`;
}

function gitOut(cwd, args) {
  if (!cwd) return '';
  try {
    return execFileSync('git', ['-C', cwd, '--no-optional-locks', ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch { return ''; }
}

// ── high-res frame (ms) ──────────────────────────────────────────────────────
// Claude Code repaints at most once/second (refreshInterval is in SECONDS,
// min 1), so this can't make motion sub-second-smooth; it just keeps the
// animation phase honest and drives the rainbow.
const NOW_MS = parseInt(env('SL_FRAME_MS', ''), 10) || Date.now();
const BASE_FRAME = idiv(NOW_MS, 1000);

// ── animated bar engine ──────────────────────────────────────────────────────
// All styles share a truecolor heat gradient and the SAME effect: they rotate
// HUE by up to WAVE_HUE at the crest, at constant brightness/saturation. They
// differ ONLY in how the crest moves. The gradient endpoints / saturation come
// from the active THEME; SL_BAR_STYLE picks how cells are drawn.
let SHIMMER = env('SL_SHIMMER', 'sweep');
if (SHIMMER === 'pulse') SHIMMER = 'breathe';
if (SHIMMER === 'march') SHIMMER = 'scan';
const SPEED = parseInt(env('SL_SPEED', '3'), 10);
const GLOW = parseInt(env('SL_GLOW', '240'), 10);
const WAVE_HUE = parseInt(env('SL_WAVE_HUE', '32'), 10);

// Palette presets. heat == the original look (no-op default). hueHi=fill start,
// hueLo=fill end; valLo/valHi ramp brightness by position; sat=saturation;
// mix=rainbow-name white-blend (null → use SL_RAINBOW_MIX / 50).
const THEMES = {
  heat:      { hueHi: 120, hueLo: 0,   sat: 88, valLo: 84, valHi: 84, mix: null },
  matrix:    { hueHi: 128, hueLo: 100, sat: 95, valLo: 45, valHi: 92, mix: null },
  mono:      { hueHi: 0,   hueLo: 0,   sat: 0,  valLo: 38, valHi: 95, mix: null },
  synthwave: { hueHi: 300, hueLo: 180, sat: 92, valLo: 75, valHi: 92, mix: 30 },
  pastel:    { hueHi: 120, hueLo: 0,   sat: 52, valLo: 88, valHi: 88, mix: 70 },
};
const TH = THEMES[env('SL_THEME', 'heat')] || THEMES.heat;
const BAR_STYLE = env('SL_BAR_STYLE', 'blocks');
const MATRIX_CHARS = '01<>{}[]/\\|=+*'.split('');
const hashI = (n) => { n = Math.imul(n >>> 0, 2654435761) >>> 0; return n; };

// HSV(0-360, 0-100, 0-100) → [r,g,b] 0-255, integer math (matches the original).
function hsv(h, s, v) {
  h = mod(h, 360);
  const vmax = idiv(255 * v, 100), vmin = idiv(vmax * (100 - s), 100);
  const reg = idiv(h, 60), fr = h % 60;
  const ris = vmin + idiv((vmax - vmin) * fr, 60);
  const fal = vmax - idiv((vmax - vmin) * fr, 60);
  switch (reg) {
    case 0: return [vmax, ris, vmin];
    case 1: return [fal, vmax, vmin];
    case 2: return [vmin, vmax, ris];
    case 3: return [vmin, fal, vmax];
    case 4: return [ris, vmin, vmax];
    default: return [vmax, vmin, fal];
  }
}

function drawBar(width, filled, marker, phaseMs = 0) {
  const t = NOW_MS + phaseMs;
  let span = filled; if (span < 1) span = 1;
  let posc = 0, hglob = 0;

  if (SHIMMER === 'sweep' || SHIMMER === 'comet' || SHIMMER === 'wave') {
    const cyclec = (span + 4) * 100;
    posc = mod(idiv(t * SPEED, 10), cyclec);
  } else if (SHIMMER === 'scan') {
    let cyclec = span * 200; if (cyclec < 1) cyclec = 1;
    posc = mod(idiv(t * SPEED, 10), cyclec);
    if (posc >= span * 100) posc = span * 200 - posc;
  } else if (SHIMMER === 'breathe') {
    let tri = mod(t, 2600); if (tri >= 1300) tri = 2600 - tri;
    hglob = idiv(WAVE_HUE * tri, 1300);
  }
  // snake needs a moving head even when SHIMMER doesn't supply one
  const snakeHead = idiv(mod(idiv(t * SPEED, 10), span * 100), 100);

  // colour of the sub-pixel at centicell position sx along the bar
  const px = (sx) => {
    if (SHIMMER === 'disco') return hsv(idiv(sx * 3, 10) + idiv(t, 30), 95, 92);
    let posp = idiv(sx, width); if (posp > 100) posp = 100; if (posp < 0) posp = 0;
    const bh = TH.hueHi - idiv(posp * (TH.hueHi - TH.hueLo), 100);
    let hoff = 0, dc, lead;
    switch (SHIMMER) {
      case 'sweep':
        dc = Math.abs(sx - posc);
        if (dc < GLOW) hoff = idiv(WAVE_HUE * (GLOW - dc) * (GLOW - dc), GLOW * GLOW);
        break;
      case 'wave':
        dc = Math.abs(sx - posc);
        if (dc < 450) hoff = idiv(WAVE_HUE * (450 - dc), 450);
        break;
      case 'comet':
        lead = posc - sx;
        if (lead >= 0 && lead < 420) hoff = idiv(WAVE_HUE * (420 - lead), 420);
        dc = Math.abs(sx - posc);
        if (dc < 70) hoff = WAVE_HUE;
        break;
      case 'scan':
        dc = Math.abs(sx - posc);
        if (dc < 140) hoff = idiv(WAVE_HUE * (140 - dc), 140);
        break;
      case 'breathe':
        hoff = hglob;
        break;
    }
    const vv = TH.valLo + idiv((TH.valHi - TH.valLo) * posp, 100);
    return hsv(bh + hoff, TH.sat, vv);
  };
  const fg = (sx) => { const [r, g, b] = px(sx); return `${ESC}[38;2;${r};${g};${b}m`; };

  let out = '';
  for (let i = 0; i < width; i++) {
    if (marker >= 0 && i === marker) { out += `${WHITE}┃${R}`; continue; }
    const isFill = i < filled;

    if (BAR_STYLE === 'pacman') {
      if (isFill && i === filled - 1) out += `${ESC}[1m${fg(i * 100 + 50)}C${R}`;   // head
      else if (isFill) out += `${fg(i * 100 + 50)}=${R}`;
      else out += `${DIM}·${R}`;
      continue;
    }
    if (BAR_STYLE === 'snake') {
      if (isFill) out += i === snakeHead ? `${ESC}[1m${fg(i * 100 + 50)}@${R}` : `${fg(i * 100 + 50)}~${R}`;
      else out += `${DIM}·${R}`;
      continue;
    }
    if (BAR_STYLE === 'matrix') {
      if (isFill) out += `${fg(i * 100 + 50)}█${R}`;
      else out += `${ESC}[2;38;2;0;120;0m${MATRIX_CHARS[hashI(i * 131 + BASE_FRAME) % MATRIX_CHARS.length]}${R}`;
      continue;
    }
    // default: half-block, two colour samples per cell
    if (isFill) {
      const [lr, lg, lb] = px(i * 100 + 25);
      const [rr, rg, rb] = px(i * 100 + 75);
      out += `${ESC}[38;2;${lr};${lg};${lb};48;2;${rr};${rg};${rb}m▌${R}`;
    } else out += `${DIM}░${R}`;
  }
  return out;
}

// ── rainbow (animated per-letter hue, pastel) ───────────────────────────────
// Explicit SL_RAINBOW_MIX wins; otherwise the theme's mix; otherwise 50.
const RAINBOW_MIX = process.env.SL_RAINBOW_MIX
  ? parseInt(process.env.SL_RAINBOW_MIX, 10)
  : (TH.mix != null ? TH.mix : 50);
function hueRgb(h, mix) {
  h = mod(h, 360);
  const region = idiv(h, 60), f = h % 60;
  const rise = idiv(f * 255, 60), fall = 255 - rise;
  let r, g, b;
  switch (region) {
    case 0: r = 255; g = rise; b = 0; break;
    case 1: r = fall; g = 255; b = 0; break;
    case 2: r = 0; g = 255; b = rise; break;
    case 3: r = 0; g = fall; b = 255; break;
    case 4: r = rise; g = 0; b = 255; break;
    default: r = 255; g = 0; b = fall; break;
  }
  return [r + idiv((255 - r) * mix, 100), g + idiv((255 - g) * mix, 100), b + idiv((255 - b) * mix, 100)];
}
function rainbow(text) {
  const disco = SHIMMER === 'disco';
  const step = disco ? 55 : 38;                 // disco: bigger hue spread per letter
  const mix = disco ? 0 : RAINBOW_MIX;          // disco: vivid, not pastel
  const flow = disco ? 6 : 18;                  // disco: faster colour flow
  const frame = SHIMMER === 'off' ? 0 : NOW_MS;
  const chars = Array.from(text);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const [r, g, b] = hueRgb(i * step + idiv(frame, flow), mix);
    out += `${ESC}[38;2;${r};${g};${b}m${chars[i]}`;
  }
  return out + R;
}

// ── extract fields ───────────────────────────────────────────────────────────
const ws = data.workspace || {};
const CWD = ws.current_dir || '';
const model = data.model || {};
const MODEL_ID = model.id || '';
const MODEL_NAME = model.display_name || 'Claude';
const cw = data.context_window || {};
let PCT = Math.floor(cw.used_percentage || 0);
const MAX_TOK = cw.context_window_size || 200000;
const cost = data.cost || {};
const ADDED = cost.total_lines_added || 0;
const REMOVED = cost.total_lines_removed || 0;
const COST = cost.total_cost_usd || 0;
const DURATION_MS = Math.floor(cost.total_duration_ms || 0);
const PERM = data.permission_mode || '';
const TRANSCRIPT = data.transcript_path || '';
const EFFORT = (data.effort && data.effort.level) || '';
const THINKING = !!(data.thinking && data.thinking.enabled);
const cu = cw.current_usage;
const CU_READ = (cu && cu.cache_read_input_tokens) || 0;
const CU_WRITE = (cu && cu.cache_creation_input_tokens) || 0;
const CU_INPUT = (cu && cu.input_tokens) || 0;
const CU_OUT = (cu && cu.output_tokens) || 0;
const rl = data.rate_limits;

// ── model: tier + version ────────────────────────────────────────────────────
const idl = MODEL_ID.toLowerCase();
let TIER = 'Sonnet', MODEL_COLOUR = CYAN;
if (idl.includes('haiku')) { TIER = 'Haiku'; MODEL_COLOUR = BLUE; }
else if (idl.includes('opus')) { TIER = 'Opus'; MODEL_COLOUR = GOLD; }
const vm = idl.match(/(opus|sonnet|haiku)-(\d+)-(\d+)/);
const MODEL_VER = vm ? `${vm[2]}.${vm[3]}` : '';
const MODEL_DISPLAY = MODEL_VER
  ? `${MODEL_COLOUR}${TIER} ${MODEL_VER}${R}`
  : `${MODEL_COLOUR}${MODEL_NAME}${R}`;
const ONEM = MAX_TOK >= 900000 ? `${DIM}1M${R}` : '';

// ── crest (SL_CREST) — per-model accent glyph, width-1 non-emoji symbol ───────
let CREST = '';
if (bool('SL_CREST')) {
  if (TIER === 'Opus') CREST = `${GOLD}★${R} `;
  else if (TIER === 'Haiku') CREST = `${BLUE}▲${R} `;
  else CREST = `${CYAN}◆${R} `;
}

// ── effort + thinking ────────────────────────────────────────────────────────
let EFFORT_C = '', EFFORT_WORD = '';
switch (EFFORT) {
  case 'low': EFFORT_C = WHITE; EFFORT_WORD = `${DIM}low${R}`; break;
  case 'medium': EFFORT_C = WHITE; EFFORT_WORD = `${DIM}${WHITE}med${R}`; break;
  case 'high': EFFORT_C = WHITE; EFFORT_WORD = `${WHITE}high${R}`; break;
  case 'xhigh': EFFORT_C = AMBER; EFFORT_WORD = `${AMBER}xhigh${R}`; break;
  case 'max': EFFORT_C = RED; EFFORT_WORD = `${BOLD}${RED}MAX${R}`; break;
}
const THINKING_WORD = THINKING ? `${DIM}${EFFORT_C}thinking${R}` : '';

// ── permission glyph ─────────────────────────────────────────────────────────
let PERM_GLYPH;
if (PERM.startsWith('accept')) PERM_GLYPH = `${ESC}[38;2;255;176;48m⚡${R}`;       // auto
else if (PERM.startsWith('bypass')) PERM_GLYPH = `${ESC}[38;2;255;82;129m!!${R}`;  // skip
else PERM_GLYPH = `${ESC}[38;2;160;150;255m?${R}`;                                  // ask

// ── spinner (SL_SPINNER) — braille tick, advances once/sec ───────────────────
const SPINNER = bool('SL_SPINNER')
  ? `${CYAN}${'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[mod(BASE_FRAME, 10)]}${R} `
  : '';

// ── pet (SL_PET) — ASCII face reacting to context %; cost ≥ $0.50 overrides ───
let PET = '';
if (bool('SL_PET')) {
  let face, col;
  if (COST >= 0.50) { face = '[$_$]'; col = GOLD; }
  else if (PCT >= 85) { face = '[>_<]'; col = RED; }
  else if (PCT >= 70) { face = '[o_o]'; col = AMBER; }
  else if (PCT >= 40) { face = '[._.]'; col = ''; }
  else { face = '[^_^]'; col = GREEN; }
  PET = `${col}${face}${R} `;
}

// ── moon phase (SL_MOON) — width-1 geometric glyphs from the date ─────────────
let MOON = '';
if (bool('SL_MOON')) {
  // days since a known new moon (2000-01-06 18:14 UTC), synodic month 29.530589
  const days = NOW_MS / 86400000 - 10961.26;
  const phase = mod(days / 29.530589, 1);          // 0=new … 0.5=full
  const g = ['●', '◐', '○', '◑'][Math.round(phase * 4) % 4]; // new, 1st-qtr, full, last-qtr
  MOON = `${DIM}${g}${R} `;
}

// ── day/night (SL_DAYNIGHT) — clock colour ramps with the hour ────────────────
function clockColour() {
  if (!bool('SL_DAYNIGHT')) return DIM;
  const h = new Date(NOW_MS).getHours();
  // night (cool/dim) → dawn → midday (warm/bright) → dusk → night
  if (h < 5 || h >= 22) return `${ESC}[38;2;90;110;170m`;     // deep night, blue
  if (h < 8) return `${ESC}[38;2;150;170;210m`;               // dawn
  if (h < 17) return `${ESC}[38;2;230;225;180m`;              // day, warm white
  if (h < 20) return `${ESC}[38;2;235;165;90m`;               // dusk, amber
  return `${ESC}[38;2;150;130;180m`;                          // evening, violet
}

// ── directory ────────────────────────────────────────────────────────────────
const DIR_SEG = `${DIM}${CWD}${R}`;

// ── git ──────────────────────────────────────────────────────────────────────
const BRANCH = gitOut(CWD, ['rev-parse', '--abbrev-ref', 'HEAD']);
const countLines = (s) => (s ? s.split('\n').filter((l) => l.length).length : 0);
const DIRTY = countLines(gitOut(CWD, ['status', '--porcelain']));
const STAGED = countLines(gitOut(CWD, ['diff', '--cached', '--name-only']));
const GIT_ID = gitOut(CWD, ['config', 'user.email']);

// ── git extras (SL_GIT_EXTRA) — only when toggled and inside a repo ───────────
let GIT_AB = '', GIT_AGE = '', GIT_UNTRACKED = '', GIT_STASH = '', BRANCH_MOOD = '';
if (bool('SL_GIT_EXTRA') && BRANCH) {
  // ahead/behind vs upstream ("behind<TAB>ahead")
  const ab = gitOut(CWD, ['rev-list', '--count', '--left-right', '@{upstream}...HEAD']);
  const m = ab.match(/^(\d+)\s+(\d+)$/);
  if (m) {
    const behind = +m[1], ahead = +m[2];
    let s = '';
    if (ahead) s += `${GREEN}↑${ahead}${R}`;
    if (behind) s += `${RED}↓${behind}${R}`;
    if (s) GIT_AB = `  ${s}`;
  }
  // last-commit age (compact)
  const ct = parseInt(gitOut(CWD, ['log', '-1', '--format=%ct']), 10);
  if (Number.isFinite(ct) && ct > 0) {
    const secs = Math.max(0, BASE_FRAME - ct);
    const a = secs < 60 ? `${secs}s` : secs < 3600 ? `${idiv(secs, 60)}m`
      : secs < 86400 ? `${idiv(secs, 3600)}h` : `${idiv(secs, 86400)}d`;
    GIT_AGE = `  ${DIM}·${a}${R}`;
  }
  const ut = countLines(gitOut(CWD, ['ls-files', '--others', '--exclude-standard']));
  if (ut > 0) GIT_UNTRACKED = `  ${AMBER}?${ut}${R}`;
  const st = countLines(gitOut(CWD, ['stash', 'list']));
  if (st > 0) GIT_STASH = ` ${DIM}s:${st}${R}`;
  // branch mood tag from the branch name prefix
  const tag = /^wip\//i.test(BRANCH) ? 'wip' : /^(hotfix|fix)\//i.test(BRANCH) ? 'fix'
    : /^(feat|feature)\//i.test(BRANCH) ? 'feat' : /^test\//i.test(BRANCH) ? 'test' : '';
  if (tag) BRANCH_MOOD = `${DIM}[${tag}]${R} `;
}

// ── Claude account name (~/.claude.json) ─────────────────────────────────────
let CLAUDE_USER = '';
try {
  const cj = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude.json`, 'utf8'));
  CLAUDE_USER = (cj.oauthAccount && (cj.oauthAccount.displayName || cj.oauthAccount.emailAddress)) || '';
} catch { /* ignore */ }

// ── last file touched (from transcript) ──────────────────────────────────────
let LAST_FILE = '';
try {
  if (TRANSCRIPT && fs.existsSync(TRANSCRIPT)) {
    const lines = fs.readFileSync(TRANSCRIPT, 'utf8').split('\n').filter(Boolean).slice(-80);
    const re = /write|edit|read|str_replace|create/;
    for (const line of lines) {
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (!ev || ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) continue;
      for (const c of ev.message.content) {
        if (c && c.type === 'tool_use' && typeof c.name === 'string' && re.test(c.name)) {
          const p = (c.input && (c.input.path || c.input.file_path)) || '';
          if (p) LAST_FILE = p.split(/[\\/]/).pop();
        }
      }
    }
  }
} catch { /* ignore */ }
const FILE_SEG = LAST_FILE ? ` ${DIM}› ${LAST_FILE}${R}` : '';

// ── autocompact threshold (from settings.json) ───────────────────────────────
let COMPACT_PCT = '', COMPACT_OFF = false;
try {
  const st = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude/settings.json`, 'utf8'));
  if (st.env && st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) COMPACT_PCT = String(st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
  if (st.autoCompact === false) COMPACT_OFF = true;
} catch { /* ignore */ }
let COMPACT_LABEL, COMPACT_PCT_VAL;
if (COMPACT_OFF) { COMPACT_LABEL = `${DIM} no-cmp${R}`; COMPACT_PCT_VAL = 100; }
else if (COMPACT_PCT) { COMPACT_LABEL = `${DIM} |${COMPACT_PCT}%${R}`; COMPACT_PCT_VAL = parseInt(COMPACT_PCT, 10); }
else { COMPACT_LABEL = `${DIM} |95%${R}`; COMPACT_PCT_VAL = 95; }

// ── context bar ──────────────────────────────────────────────────────────────
const BAR_WIDTH = 28;
const FILLED = idiv(PCT * BAR_WIDTH, 100);
const MARKER_POS = COMPACT_OFF ? -1 : idiv(COMPACT_PCT_VAL * BAR_WIDTH, 100);
const BAR = drawBar(BAR_WIDTH, FILLED, MARKER_POS, 0);
const PCT_COLOUR = PCT >= 70 ? RED : PCT >= 40 ? AMBER : GREEN;
const PCT_SEG = `${PCT_COLOUR}${PCT}%${R}`;

// ── per-turn token breakdown ─────────────────────────────────────────────────
let TURN_SEG = '';
if (cu != null) {
  const total = CU_INPUT + CU_WRITE + CU_READ;
  let HIT_SEG = '';
  if (total > 0 && CU_READ > 0) {
    const hit = idiv(CU_READ * 100, total);
    const hc = hit >= 70 ? `${BOLD}${GREEN}` : hit >= 40 ? GREEN : `${DIM}${GREEN}`;
    HIT_SEG = `${hc}✦${hit}%${R}`;
  }
  const readSeg = CU_READ > 0 ? ` ${GREEN}✦${fmtK(CU_READ)}${R}` : '';
  const writeSeg = CU_WRITE > 0 ? ` ${AMBER}+${fmtK(CU_WRITE)}w${R}` : '';
  const inSeg = CU_INPUT > 0 ? ` ${DIM}↓${fmtK(CU_INPUT)}${R}` : '';
  const outSeg = CU_OUT > 0 ? ` ${DIM}↑${fmtK(CU_OUT)}${R}` : '';
  TURN_SEG = HIT_SEG + readSeg + writeSeg + inSeg + outSeg;
}

// ── cost ─────────────────────────────────────────────────────────────────────
const COST_FMT = Number(COST).toFixed(3);
const costNum = parseFloat(COST_FMT);
const COST_COLOUR = costNum >= 0.50 ? RED : costNum >= 0.10 ? AMBER : GREEN;
// spend-tier prefix (SL_COST_FLAIR): · cheap, $ , $$ , !$ ouch
const COST_FLAIR = bool('SL_COST_FLAIR')
  ? (costNum >= 1 ? '!$' : costNum >= 0.50 ? '$$' : costNum >= 0.10 ? '$' : '·') + ' '
  : '';
let COST_SEG, BAR_PREFIX;
if (COST_FMT === '0.000') { COST_SEG = `${DIM}$0${R}`; BAR_PREFIX = `${DIM}∅ ${R}`; }
else { COST_SEG = `${COST_COLOUR}${COST_FLAIR}$${COST_FMT}${R}`; BAR_PREFIX = ''; }
// burn rate (SL_BURN): $/hr, only once the session is at least a minute old
if (bool('SL_BURN') && DURATION_MS >= 60000 && costNum > 0) {
  const rate = (COST / (DURATION_MS / 3600000)).toFixed(2);
  COST_SEG += ` ${DIM}$${rate}/hr${R}`;
}

// ── session age ──────────────────────────────────────────────────────────────
const DUR_S = idiv(DURATION_MS, 1000);
let AGE_C, AGE_LABEL;
if (DUR_S >= 7200) { AGE_C = RED; AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`; }
else if (DUR_S >= 3600) { AGE_C = AMBER; AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`; }
else if (DUR_S >= 60) { AGE_C = GREEN; AGE_LABEL = `${idiv(DUR_S, 60)}m`; }
else { AGE_C = DIM; AGE_LABEL = `${DUR_S}s`; }
const AGE_SEG = `${AGE_C}${AGE_LABEL}${R}`;

// ── clock (with seconds) ─────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dt = new Date(NOW_MS);
const p2 = (n) => String(n).padStart(2, '0');
const CLOCK_SEG = `${clockColour()}${DAYS[dt.getDay()]} ${p2(dt.getDate())} ${MONTHS[dt.getMonth()]}  ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}${R}`;

// ── usage limits (two mini bars) ─────────────────────────────────────────────
let USAGE_SEG = '';
if (rl != null) {
  const rlSeg = (label, pct, resetsAt, phase) => {
    pct = Math.floor(pct || 0); if (pct > 100) pct = 100;
    const filled = idiv(pct * 10, 100);
    const bar = drawBar(10, filled, -1, phase);
    const pc = pct >= 80 ? RED : pct >= 50 ? AMBER : GREEN;
    let secsLeft = 0;
    const ra = typeof resetsAt === 'number' ? resetsAt : parseInt(resetsAt, 10);
    if (Number.isFinite(ra) && ra > 0) secsLeft = ra - BASE_FRAME;
    const cd = secsLeft <= 0 ? `${DIM}now${R}` : `${DIM}${fmtCountdown(secsLeft)}${R}`;
    return `${DIM}${label}${R} ${bar} ${pc}${pct}%${R} ${cd}`;
  };
  const fh = rl.five_hour || {}, sd = rl.seven_day || {};
  USAGE_SEG = `${rlSeg('5h', fh.used_percentage, fh.resets_at, 1500)}   ${rlSeg('7d', sd.used_percentage, sd.resets_at, 3000)}`;
}

// ── assemble ─────────────────────────────────────────────────────────────────
const CTX_SIZE_K = fmtK(MAX_TOK);
let BRACKET = `${CREST}${MODEL_DISPLAY}`;
if (ONEM) BRACKET += ` ${ONEM}`;
if (EFFORT_WORD) BRACKET += ` ${EFFORT_WORD}`;
if (THINKING_WORD) BRACKET += ` ${THINKING_WORD}`;

// Line 1 left: spinner, pet, permission glyph, [crest model …]
const L1_LEFT = `${SPINNER}${PET}${PERM_GLYPH} ${DIM}[${R}${BRACKET}${DIM}]${R}`;
const L1_RIGHT = `${MOON}${CLOCK_SEG}`;

let CTX_STATS = `${DIM}${CTX_SIZE_K}${R}`;
if (TURN_SEG) CTX_STATS += ` ${TURN_SEG}`;
const L2_LEFT = `${BAR_PREFIX}${BAR}  ${PCT_SEG}${COMPACT_LABEL}  ${CTX_STATS}`;
const L2_RIGHT = USAGE_SEG;

let L3_LEFT = `${DIR_SEG}${FILE_SEG}`;
if (BRANCH) L3_LEFT += `  ${BRANCH_MOOD}${CYAN}⎇ ${BRANCH}${R}`;
L3_LEFT += GIT_AB + GIT_AGE;
if (GIT_ID) L3_LEFT += `  ${DIM}${GIT_ID}${R}`;
if (ADDED > 0 || REMOVED > 0) L3_LEFT += `  ${GREEN}+${ADDED}${R}/${RED}-${REMOVED}${R}`;
if (DIRTY > 0) L3_LEFT += `  ${AMBER}~${DIRTY}${R}`;
if (STAGED > 0) L3_LEFT += ` ${GREEN}●${STAGED}${R}`;
L3_LEFT += GIT_UNTRACKED + GIT_STASH;
let L3_RIGHT = '';
if (CLAUDE_USER) L3_RIGHT = `${rainbow(CLAUDE_USER)}  `;
L3_RIGHT += `${COST_SEG}  ${AGE_SEG}`;

// ── output ───────────────────────────────────────────────────────────────────
process.stdout.write(
  justified(L1_LEFT, L1_RIGHT) + '\n' +
  justified(L2_LEFT, L2_RIGHT) + '\n' +
  justified(L3_LEFT, L3_RIGHT) + '\n'
);
