// Entry point: read the Claude Code JSON on stdin, build three lines, print them.
// Everything is wrapped so a bug prints a minimal line instead of a blank bar.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ESC, R, DIM, BOLD, justified, stripAnsi, txt, tc, termCols } from './ansi';
import { hueRgb } from './color';
import { RED, GREEN, AMBER, BLUE, CYAN, WHITE, GOLD, gradientColor } from './themes';
import { drawBar, scaleCells } from './bar';
import { rainbow } from './rainbow';
import { fmtK, fmtCountdown } from './format';
import { gitOut, countLines } from './git';
import { cfg } from './config';
import { idiv } from './util';
import { sessionKey, readState, writeState, pushSpark, readHistory, appendHistory } from './state';
import { sparkline, etaMinutes, median, weatherWord } from './insight';
import { runPreview, runDoctor, runReport } from './cli';
import type { StatuslineInput } from './types';

// Pet faces by style, ordered calm → stressed (5 levels). All ASCII, width-safe.
const PET_FACES: Record<string, string[]> = {
  default: ['[^_^]', '[._.]', '[o_o]', '[>_<]', '[$_$]'],
  cat: ['=^_^=', '=._.=', '=o_o=', '=>_<=', '=$_$='],
  frog: ['(^_^)', '(o_o)', '(._.)', '(O_O)', '(>_<)'],
  robot: ['[0_0]', '[o_o]', '[._.]', '[!_!]', '[x_x]'],
  ghost: ['<^_^>', '<o_o>', '<._.>', '<!_!>', '<x_x>'],
  slime: ['(~_~)', '(o_o)', '(._.)', '(>_<)', '(@_@)'],
  dog: ['[^o^]', '[^.^]', '[-.-]', '[>n<]', '[ToT]'],
};

// Display form of the cwd: project aliases first, then (unless SL_PATH=full)
// home→~ and middle-compression of deep paths (keep root + … + last two).
function displayPath(cwd: string): string {
  if (!cwd) return cwd;
  let p = cwd;
  if (cfg.projectAliases) {
    try {
      const map = JSON.parse(cfg.projectAliases) as Record<string, string>;
      let best = '';
      for (const k of Object.keys(map)) if ((p === k || p.startsWith(k + '/')) && k.length > best.length) best = k;
      if (best) p = map[best] + p.slice(best.length);
    } catch { /* bad JSON → ignore */ }
  }
  if (cfg.path === 'full') return p;
  const home = os.homedir();
  if (home && (p === home || p.startsWith(home + '/'))) p = '~' + p.slice(home.length);
  const parts = p.split('/').filter(Boolean);
  if (parts.length > 5) p = `${p.startsWith('/') ? '/' : ''}${parts[0]}/…/${parts.slice(-2).join('/')}`;
  return p;
}

function build(): string {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let data: StatuslineInput = {};
  try { data = (JSON.parse(input) as StatuslineInput) || {}; } catch { data = {}; }

  // ── extract fields ──────────────────────────────────────────────────────────
  const ws = data.workspace || {};
  const CWD = ws.current_dir || '';
  const model = data.model || {};
  const MODEL_ID = model.id || '';
  const MODEL_NAME = model.display_name || 'Claude';
  const cw = data.context_window || {};
  const PCT = Math.floor(cw.used_percentage || 0);
  const MAX_TOK = cw.context_window_size || 200000;
  const cost = data.cost || {};
  const ADDED = cost.total_lines_added || 0;
  const REMOVED = cost.total_lines_removed || 0;
  const COST = cost.total_cost_usd || 0;
  const DURATION_MS = Math.floor(cost.total_duration_ms || 0);
  const TRANSCRIPT = data.transcript_path || '';
  const EFFORT = (data.effort && data.effort.level) || '';
  const THINKING = !!(data.thinking && data.thinking.enabled);
  const cu = cw.current_usage;
  const CU_READ = (cu && cu.cache_read_input_tokens) || 0;
  const CU_WRITE = (cu && cu.cache_creation_input_tokens) || 0;
  const CU_INPUT = (cu && cu.input_tokens) || 0;
  const CU_OUT = (cu && cu.output_tokens) || 0;
  const rl = data.rate_limits;

  // ── persist this tick: context-% history, compaction detection, ETA samples,
  //    and a throttled cross-session history record for burn baselines ─────────
  let SPARK: number[] = [], COMPACTIONS = 0, ETA_SAMPLES: [number, number][] = [], BELL = '';
  try {
    const sk = sessionKey(data);
    const st = readState(sk);
    // SL_BELL: ring once each time context crosses into a higher band (de-dup via state).
    if (cfg.bell) {
      const lvl = PCT >= 95 ? 2 : PCT >= 80 ? 1 : 0;
      if (lvl > (st.bellLevel ?? 0)) BELL = '\x07';
      st.bellLevel = lvl;
    }
    const prev = st.spark.length ? st.spark[st.spark.length - 1] : -1;
    if (prev >= 0 && PCT <= prev - 25) st.compactions += 1;        // sharp drop = an autocompact
    pushSpark(st, PCT);
    st.etaSamples = (st.etaSamples || []).concat([[DURATION_MS, PCT]]).slice(-20);
    // one cross-session record per 5-minute duration bucket (keeps the log small).
    const bucket = idiv(DURATION_MS, 300000);
    if (cfg.burn && COST > 0 && bucket > (st.histBucket ?? -1)) {
      st.histBucket = bucket;
      appendHistory({ t: cfg.nowMs, cost: COST, ctx: PCT, dur: DURATION_MS });
    }
    writeState(sk, st);
    SPARK = st.spark.slice();
    COMPACTIONS = st.compactions;
    ETA_SAMPLES = st.etaSamples;
  } catch { /* state is best-effort */ }

  // ── model: tier + version ─────────────────────────────────────────────────
  const idl = MODEL_ID.toLowerCase();
  let TIER = 'Sonnet', MODEL_COLOUR = CYAN;
  if (idl.includes('haiku')) { TIER = 'Haiku'; MODEL_COLOUR = BLUE; }
  else if (idl.includes('opus')) { TIER = 'Opus'; MODEL_COLOUR = GOLD; }
  const vm = idl.match(/(opus|sonnet|haiku)-(\d+)-(\d+)/);
  const MODEL_VER = vm ? `${vm[2]}.${vm[3]}` : '';
  const MODEL_DISPLAY = MODEL_VER ? `${MODEL_COLOUR}${TIER} ${MODEL_VER}${R}` : `${MODEL_COLOUR}${MODEL_NAME}${R}`;
  const ONEM = MAX_TOK >= 900000 ? `${DIM}1M${R}` : '';

  // ── crest (SL_CREST) ────────────────────────────────────────────────────────
  let CREST = '';
  if (cfg.crest) {
    if (TIER === 'Opus') CREST = `${GOLD}★${R} `;
    else if (TIER === 'Haiku') CREST = `${BLUE}▲${R} `;
    else CREST = `${CYAN}◆${R} `;
  }

  // ── effort + thinking ─────────────────────────────────────────────────────
  let EFFORT_C = '', EFFORT_WORD = '';
  switch (EFFORT) {
    case 'low': EFFORT_C = WHITE; EFFORT_WORD = `${DIM}low${R}`; break;
    case 'medium': EFFORT_C = WHITE; EFFORT_WORD = `${DIM}${WHITE}med${R}`; break;
    case 'high': EFFORT_C = WHITE; EFFORT_WORD = `${WHITE}high${R}`; break;
    case 'xhigh': EFFORT_C = AMBER; EFFORT_WORD = `${AMBER}xhigh${R}`; break;
    case 'max': EFFORT_C = RED; EFFORT_WORD = `${BOLD}${RED}MAX${R}`; break;
  }
  const THINKING_WORD = THINKING ? `${DIM}${EFFORT_C}thinking${R}` : '';

  // ── fast/slow + vim mode ────────────────────────────────────────────────────
  // Claude Code does NOT expose the permission/auto-accept mode to statuslines
  // (no such field), so this slot shows what IS available: the /fast toggle
  // (gold ⚡ = fast, dim ▫ = slow) and the vim input mode when enabled.
  const FAST = data.fast_mode ? `${GOLD}${txt('⚡')}${R}` : `${DIM}${txt('▫')}${R}`;   // ⚡ fast · ▫ slow
  let VIM = '';
  const vmode = (data.vim && data.vim.mode) || '';
  if (vmode) {
    const u = vmode.toUpperCase();
    const col = u.startsWith('INS') ? GREEN : u.startsWith('VIS') ? AMBER : CYAN;
    VIM = ` ${col}${u[0] || '?'}${R}`;
  }
  const LEAD = `${FAST}${VIM}`;

  // ── moon phase (SL_MOON) ────────────────────────────────────────────────────
  let MOON = '';
  if (cfg.moon) {
    const days = cfg.nowMs / 86400000 - 10961.26;       // since 2000-01-06 new moon
    const phase = ((days / 29.530589) % 1 + 1) % 1;      // 0=new … 0.5=full
    const g = ['●', '◐', '○', '◑'][Math.round(phase * 4) % 4];
    MOON = `${DIM}${g}${R} `;
  }

  // ── day/night clock colour (SL_DAYNIGHT) ────────────────────────────────────
  const clockColour = (): string => {
    if (!cfg.daynight) return DIM;
    const h = new Date(cfg.clockMs).getHours();
    if (h < 5 || h >= 22) return tc(90, 110, 170);
    if (h < 8) return tc(150, 170, 210);
    if (h < 17) return tc(230, 225, 180);
    if (h < 20) return tc(235, 165, 90);
    return tc(150, 130, 180);
  };

  const DIR_SEG = `${DIM}${displayPath(CWD)}${R}`;

  // ── git ─────────────────────────────────────────────────────────────────────
  const BRANCH = gitOut(CWD, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const DIRTY = countLines(gitOut(CWD, ['status', '--porcelain']));
  const STAGED = countLines(gitOut(CWD, ['diff', '--cached', '--name-only']));
  const GIT_ID = gitOut(CWD, ['config', 'user.email']);

  let GIT_AB = '', GIT_AGE = '', GIT_UNTRACKED = '', GIT_STASH = '', BRANCH_MOOD = '';
  let BRANCH_LABEL = BRANCH, GIT_STATE = '', GIT_TODAY = '', GIT_RISK = '';
  if (cfg.gitExtra && BRANCH) {
    // detached HEAD → show a short sha instead of "HEAD".
    if (BRANCH === 'HEAD') { const sha = gitOut(CWD, ['rev-parse', '--short', 'HEAD']); if (sha) BRANCH_LABEL = `:${sha}`; }
    // mid-operation state from the git dir (merge / rebase / cherry-pick).
    try {
      let gd = gitOut(CWD, ['rev-parse', '--git-dir']);
      if (gd) {
        if (!path.isAbsolute(gd)) gd = path.join(CWD, gd);
        if (fs.existsSync(path.join(gd, 'MERGE_HEAD'))) GIT_STATE = 'merge';
        else if (fs.existsSync(path.join(gd, 'rebase-merge')) || fs.existsSync(path.join(gd, 'rebase-apply'))) GIT_STATE = 'rebase';
        else if (fs.existsSync(path.join(gd, 'CHERRY_PICK_HEAD'))) GIT_STATE = 'cherry';
      }
    } catch { /* ignore */ }
    // commits made since local midnight of the current frame (today's momentum).
    const mid = new Date(cfg.clockMs); mid.setHours(0, 0, 0, 0);
    const ct2 = parseInt(gitOut(CWD, ['rev-list', '--count', `--since=${idiv(mid.getTime(), 1000)}`, 'HEAD']), 10);
    if (Number.isFinite(ct2) && ct2 > 0) GIT_TODAY = ` ${GREEN}${txt('✓')}${ct2}${R}`;
    const ab = gitOut(CWD, ['rev-list', '--count', '--left-right', '@{upstream}...HEAD']);
    const m = ab.match(/^(\d+)\s+(\d+)$/);
    if (m) {
      const behind = +m[1], ahead = +m[2];
      let s = '';
      if (ahead) s += `${GREEN}${txt('↑')}${ahead}${R}`;
      if (behind) s += `${RED}${txt('↓')}${behind}${R}`;
      if (s) GIT_AB = `  ${s}`;
    }
    const ct = parseInt(gitOut(CWD, ['log', '-1', '--format=%ct']), 10);
    if (Number.isFinite(ct) && ct > 0) {
      const secs = Math.max(0, cfg.baseFrame - ct);
      const a = secs < 60 ? `${secs}s` : secs < 3600 ? `${idiv(secs, 60)}m`
        : secs < 86400 ? `${idiv(secs, 3600)}h` : `${idiv(secs, 86400)}d`;
      GIT_AGE = `  ${DIM}·${a}${R}`;
    }
    const ut = countLines(gitOut(CWD, ['ls-files', '--others', '--exclude-standard']));
    if (ut > 0) GIT_UNTRACKED = `  ${AMBER}?${ut}${R}`;
    const st = countLines(gitOut(CWD, ['stash', 'list']));
    if (st > 0) GIT_STASH = ` ${DIM}s:${st}${R}`;
    const tag = /^wip\//i.test(BRANCH) ? 'wip' : /^(hotfix|fix)\//i.test(BRANCH) ? 'fix'
      : /^(feat|feature)\//i.test(BRANCH) ? 'feat' : /^test\//i.test(BRANCH) ? 'test' : '';
    if (tag) BRANCH_MOOD = `${DIM}[${tag}]${R} `;
  }

  // ── git risk score (SL_GIT_RISK) — a deliberately rough composite; opt-in ────
  if (cfg.gitRisk && BRANCH) {
    let s = 0;
    if (DIRTY > 0) s += DIRTY >= 10 ? 2 : 1;
    if (countLines(gitOut(CWD, ['stash', 'list'])) > 0) s += 1;
    const rm = gitOut(CWD, ['rev-list', '--count', '--left-right', '@{upstream}...HEAD']).match(/^(\d+)\s+(\d+)$/);
    if (rm) { if (+rm[1] > 0) s += 1; if (+rm[2] >= 5) s += 1; }
    if (GIT_STATE) s += 2;
    const level = s >= 4 ? 'high' : s >= 2 ? 'med' : 'low';
    const rc = level === 'high' ? RED : level === 'med' ? AMBER : GREEN;
    GIT_RISK = `  ${rc}risk:${level}${R}`;
  }

  // ── pet (SL_PET) ────────────────────────────────────────────────────────────
  // Mood level 0..4 from the chosen source; unset reactsTo reproduces the original
  // context-bands-plus-cost-override behaviour exactly (so the default is unchanged).
  let PET = '';
  if (cfg.pet) {
    let lvl: number;
    switch (cfg.petReactsTo) {
      case 'cost': lvl = COST >= 2 ? 4 : COST >= 1 ? 3 : COST >= 0.5 ? 2 : COST >= 0.1 ? 1 : 0; break;
      case 'git': lvl = DIRTY > 10 ? 4 : DIRTY >= 6 ? 3 : DIRTY >= 3 ? 2 : DIRTY >= 1 ? 1 : 0; break;
      case 'time': { const h = new Date(cfg.clockMs).getHours(); lvl = h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : h < 22 ? 3 : 0; break; }
      case 'random': lvl = (Math.imul(idiv(cfg.nowMs, 3000), 2654435761) >>> 0) % 5; break;
      case 'context': lvl = PCT >= 95 ? 4 : PCT >= 85 ? 3 : PCT >= 70 ? 2 : PCT >= 40 ? 1 : 0; break;
      default: lvl = COST >= 0.50 ? 4 : PCT >= 85 ? 3 : PCT >= 70 ? 2 : PCT >= 40 ? 1 : 0;   // original behaviour
    }
    const faces = PET_FACES[cfg.petStyle] || PET_FACES.default;
    const col = ['', '', '', '', ''];
    col[0] = GREEN; col[2] = AMBER; col[3] = RED; col[4] = GOLD;
    PET = `${col[lvl]}${faces[lvl]}${R} `;
  }

  // ── Claude account name ─────────────────────────────────────────────────────
  let CLAUDE_USER = '';
  try {
    const cj = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude.json`, 'utf8'));
    CLAUDE_USER = (cj.oauthAccount && (cj.oauthAccount.displayName || cj.oauthAccount.emailAddress)) || '';
  } catch { /* ignore */ }

  // ── last file touched (from transcript) ─────────────────────────────────────
  let LAST_FILE = '';
  try {
    if (TRANSCRIPT && fs.existsSync(TRANSCRIPT)) {
      const lines = fs.readFileSync(TRANSCRIPT, 'utf8').split('\n').filter(Boolean).slice(-80);
      const re = /write|edit|read|str_replace|create/;
      for (const line of lines) {
        let ev: any;
        try { ev = JSON.parse(line); } catch { continue; }
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

  // ── autocompact threshold (from settings.json) ──────────────────────────────
  // The marker + label only appear when autocompact is ENABLED. autoCompactEnabled
  // is the current key (older builds used autoCompact); default is on if absent.
  let COMPACT_PCT = '', COMPACT_OFF = false;
  try {
    const st = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude/settings.json`, 'utf8'));
    if (st.env && st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) COMPACT_PCT = String(st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
    if (st.autoCompactEnabled === false || st.autoCompact === false) COMPACT_OFF = true;
  } catch { /* ignore */ }
  let COMPACT_LABEL: string, COMPACT_PCT_VAL: number;
  if (COMPACT_OFF) { COMPACT_LABEL = ''; COMPACT_PCT_VAL = -1; }            // disabled → no marker, no label
  else if (COMPACT_PCT) { COMPACT_LABEL = `${DIM} |${COMPACT_PCT}%${R}`; COMPACT_PCT_VAL = parseInt(COMPACT_PCT, 10); }
  else { COMPACT_LABEL = `${DIM} |95%${R}`; COMPACT_PCT_VAL = 95; }

  // ── context bar ─────────────────────────────────────────────────────────────
  const BAR_WIDTH = 28;
  const FILLED = scaleCells(PCT, BAR_WIDTH);
  const MARKER_POS = COMPACT_OFF ? -1 : scaleCells(COMPACT_PCT_VAL, BAR_WIDTH);
  const BAR = drawBar(BAR_WIDTH, FILLED, MARKER_POS, 0);
  const PCT_SEG = `${gradientColor(PCT)}${PCT}%${R}`;   // lerps along the theme gradient

  // ── trend (SL_TREND): sparkline of recent context %, ETA to autocompact, ─────
  //    and a count of compactions detected this session ─────────────────────────
  let TREND_SEG = '';
  if (cfg.trend) {
    const parts: string[] = [];
    const spark = sparkline(SPARK);
    if (spark) parts.push(`${DIM}${spark}${R}`);
    if (!COMPACT_OFF && COMPACT_PCT_VAL > 0) {
      const eta = etaMinutes(ETA_SAMPLES, COMPACT_PCT_VAL, PCT);
      if (eta >= 0) parts.push(`${gradientColor(PCT)}~${fmtCountdown(eta * 60)}${R}`);
    }
    if (COMPACTIONS > 0) parts.push(`${DIM}↺${COMPACTIONS}${R}`);
    TREND_SEG = parts.join(' ');
  }
  // ── weather (SL_WEATHER): a one-word reading of context pressure ─────────────
  const WEATHER_SEG = cfg.weather ? `${gradientColor(PCT)}${weatherWord(PCT, COMPACT_OFF ? 0 : COMPACT_PCT_VAL)}${R}` : '';

  // ── per-turn token breakdown ────────────────────────────────────────────────
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
    const inSeg = CU_INPUT > 0 ? ` ${DIM}${txt('↓')}${fmtK(CU_INPUT)}${R}` : '';
    const outSeg = CU_OUT > 0 ? ` ${DIM}${txt('↑')}${fmtK(CU_OUT)}${R}` : '';
    TURN_SEG = HIT_SEG + readSeg + writeSeg + inSeg + outSeg;
  }

  // ── cost ────────────────────────────────────────────────────────────────────
  const COST_FMT = Number(COST).toFixed(3);
  const costNum = parseFloat(COST_FMT);
  const COST_COLOUR = costNum >= 0.50 ? RED : costNum >= 0.10 ? AMBER : GREEN;
  const COST_FLAIR = cfg.costFlair
    ? (costNum >= 1 ? '!$' : costNum >= 0.50 ? '$$' : costNum >= 0.10 ? '$' : '·') + ' '
    : '';
  let COST_SEG: string, BAR_PREFIX: string;
  if (COST_FMT === '0.000') { COST_SEG = `${DIM}$0${R}`; BAR_PREFIX = `${DIM}∅ ${R}`; }
  else {
    const price = `${COST_FLAIR}$${COST_FMT}`;
    COST_SEG = cfg.rainbowStats ? rainbow(price) : `${COST_COLOUR}${price}${R}`;
    BAR_PREFIX = '';
  }
  if (cfg.burn && DURATION_MS >= 60000 && costNum > 0) {
    const ratePerHr = COST / (DURATION_MS / 3600000);
    COST_SEG += ` ${DIM}$${ratePerHr.toFixed(2)}/hr${R}`;
    // cross-session baseline: how this session's burn compares to your own median.
    try {
      const rates = readHistory().filter((h) => h.dur >= 300000 && h.cost > 0).map((h) => h.cost / (h.dur / 3600000));
      if (rates.length >= 5) {
        const med = median(rates);
        if (med > 0) {
          const ratio = ratePerHr / med;
          const rc = ratio >= 1.5 ? RED : ratio >= 1.1 ? AMBER : DIM;
          COST_SEG += ` ${rc}${ratio.toFixed(1)}x${R}`;
        }
      }
    } catch { /* baseline is best-effort */ }
  }

  // ── session age ─────────────────────────────────────────────────────────────
  const DUR_S = idiv(DURATION_MS, 1000);
  let AGE_C: string, AGE_LABEL: string;
  if (DUR_S >= 7200) { AGE_C = RED; AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`; }
  else if (DUR_S >= 3600) { AGE_C = AMBER; AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`; }
  else if (DUR_S >= 60) { AGE_C = GREEN; AGE_LABEL = `${idiv(DUR_S, 60)}m`; }
  else { AGE_C = DIM; AGE_LABEL = `${DUR_S}s`; }
  const AGE_SEG = cfg.rainbowStats ? rainbow(AGE_LABEL) : `${AGE_C}${AGE_LABEL}${R}`;

  // ── clock ─────────────────────────────────────────────────────────────────
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dt = new Date(cfg.clockMs);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const CLOCK_SEG = `${clockColour()}${DAYS[dt.getDay()]} ${p2(dt.getDate())} ${MONTHS[dt.getMonth()]}  ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}${R}`;

  // ── usage limits ────────────────────────────────────────────────────────────
  let USAGE_SEG = '';
  if (rl != null) {
    const NOW = cfg.baseFrame;
    const rlSeg = (label: string, pctIn: number | undefined, resetsAt: number | string | undefined, phase: number): string => {
      let pct = Math.floor(pctIn || 0); if (pct > 100) pct = 100;
      const filled = scaleCells(pct, 10);
      const bar = drawBar(10, filled, -1, phase);
      let pc = gradientColor(pct);   // lerps along the theme gradient
      let warn = '';
      // limit warnings (SL_LIMITS): force amber past warn, bold red + LOW past crit.
      if (cfg.limits) {
        if (pct >= cfg.limitCrit) { pc = `${BOLD}${RED}`; warn = ` ${BOLD}${RED}LOW${R}`; }
        else if (pct >= cfg.limitWarn) { pc = AMBER; }
      }
      let secsLeft = 0;
      const ra = typeof resetsAt === 'number' ? resetsAt : parseInt(String(resetsAt), 10);
      if (Number.isFinite(ra) && ra > 0) secsLeft = ra - NOW;
      const cd = secsLeft <= 0 ? `${DIM}now${R}` : `${DIM}${fmtCountdown(secsLeft)}${R}`;
      return `${DIM}${label}${R} ${bar} ${pc}${pct}%${R}${warn} ${cd}`;
    };
    const fh = rl.five_hour || {}, sd = rl.seven_day || {};
    USAGE_SEG = `${rlSeg('5h', fh.used_percentage, fh.resets_at, 1500)}   ${rlSeg('7d', sd.used_percentage, sd.resets_at, 3000)}`;
  }

  // ── assemble ────────────────────────────────────────────────────────────────
  // SL_HIDE drops named segments; SL_SEPARATOR swaps the major join (default "  ");
  // SL_LAYOUT chooses how many lines to emit. All three are no-ops at defaults.
  const HIDE = new Set(cfg.hide.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean));
  // SL_PRIVACY merges a sensitive-segment set into HIDE (for screenshots/streams).
  if (cfg.privacy) {
    const alias: Record<string, string> = { email: 'email', path: 'dir', account: 'name', cost: 'cost' };
    const toks = cfg.privacyHide ? cfg.privacyHide.split(/[\s,]+/).filter(Boolean) : ['email', 'path', 'account', 'cost'];
    for (const t of toks) HIDE.add(alias[t] || t);
  }
  const sh = (name: string, val: string): string => (HIDE.has(name) ? '' : val);
  const SEP = cfg.separator ? ` ${DIM}${cfg.separator}${R} ` : '  ';

  // SL_SYSINFO: 1-minute load average (os.loadavg is 0 on unsupported platforms).
  let SYS_SEG = '';
  if (cfg.sysinfo) { const la = os.loadavg()[0]; if (la > 0) SYS_SEG = `${DIM}↯${la.toFixed(2)}${R} `; }

  const CTX_SIZE_K = fmtK(MAX_TOK);
  let BRACKET = `${sh('crest', CREST)}${sh('model', MODEL_DISPLAY)}`;
  if (ONEM) BRACKET += ` ${ONEM}`;
  if (EFFORT_WORD) BRACKET += ` ${sh('effort', EFFORT_WORD)}`;
  if (THINKING_WORD) BRACKET += ` ${sh('thinking', THINKING_WORD)}`;

  const L1_LEFT = `${LEAD} ${sh('pet', PET)}${DIM}[${R}${BRACKET}${DIM}]${R}`;
  const L1_RIGHT = `${sh('sysinfo', SYS_SEG)}${sh('moon', MOON)}${sh('clock', CLOCK_SEG)}`;

  const PCT_FULL = WEATHER_SEG ? `${PCT_SEG} ${sh('weather', WEATHER_SEG)}` : PCT_SEG;
  let CTX_STATS = `${DIM}${CTX_SIZE_K}${R}`;
  if (TURN_SEG) CTX_STATS += ` ${sh('tokens', TURN_SEG)}`;
  if (TREND_SEG) CTX_STATS += `${SEP}${sh('trend', TREND_SEG)}`;
  const L2_LEFT = `${BAR_PREFIX}${BAR}  ${PCT_FULL}${COMPACT_LABEL}${SEP}${CTX_STATS}`;
  const L2_RIGHT = sh('usage', USAGE_SEG);

  let L3_LEFT = `${sh('dir', DIR_SEG)}${sh('file', FILE_SEG)}`;
  let GIT_SEG = '';
  if (BRANCH) {
    GIT_SEG += `  ${BRANCH_MOOD}${CYAN}⎇ ${BRANCH_LABEL}${R}`;
    if (GIT_STATE) GIT_SEG += ` ${BOLD}${RED}${GIT_STATE}!${R}`;
    GIT_SEG += GIT_TODAY;
  }
  GIT_SEG += GIT_AB + GIT_AGE;
  if (GIT_ID && !HIDE.has('email')) GIT_SEG += `  ${DIM}${GIT_ID}${R}`;
  if (ADDED > 0 || REMOVED > 0) GIT_SEG += `  ${GREEN}+${ADDED}${R}/${RED}-${REMOVED}${R}`;
  if (DIRTY > 0) GIT_SEG += `  ${AMBER}~${DIRTY}${R}`;
  if (STAGED > 0) GIT_SEG += ` ${GREEN}●${STAGED}${R}`;
  GIT_SEG += GIT_UNTRACKED + GIT_STASH + GIT_RISK;
  L3_LEFT += sh('git', GIT_SEG);
  let L3_RIGHT = '';
  if (CLAUDE_USER) L3_RIGHT = `${sh('name', `${rainbow(CLAUDE_USER)}  `)}`;
  L3_RIGHT += `${sh('cost', COST_SEG)}  ${sh('age', AGE_SEG)}`;

  // Layout: which lines to emit. Compact forms reuse the segments already built.
  // SL_RESPONSIVE picks a layout from the terminal width to avoid wrapping.
  const J = justified;
  let lines: string[];
  let layout = cfg.layout;
  if (cfg.responsive) { const c = termCols(); layout = c < 70 ? 'tiny' : c < 100 ? '1line' : c < 140 ? '2line' : '3line'; }
  switch (layout) {
    case 'tiny':
      lines = [J(`${BAR} ${PCT_SEG}`, sh('cost', COST_SEG))];
      break;
    case '1line':
      lines = [J(`${LEAD} ${BAR}  ${PCT_FULL}  ${BRACKET}`, L3_RIGHT)];
      break;
    case '2line':
      lines = [J(L1_LEFT, L1_RIGHT), J(L2_LEFT, L3_RIGHT)];
      break;
    default:   // 3line
      lines = [J(L1_LEFT, L1_RIGHT), J(L2_LEFT, L2_RIGHT), J(L3_LEFT, L3_RIGHT)];
  }

  // Whole-line recolour: group each glyph with any trailing variation selector,
  // then recolour every visible unit via colour(col). Used by disco and the
  // danger safelight wash so all coloured elements move together.
  const recolor = (line: string, colour: (col: number) => string): string => {
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
  };
  // Danger state (SL_DANGER, or the silver-halide theme): a deep safelight-red
  // wash once context or a usage limit is critical — "you can still work, carefully".
  let dangerActive = false;
  if (cfg.danger || cfg.themeName === 'silver-halide') {
    const fh = (rl && rl.five_hour && rl.five_hour.used_percentage) || 0;
    const sd = (rl && rl.seven_day && rl.seven_day.used_percentage) || 0;
    dangerActive = PCT >= 90 || fh >= cfg.limitCrit || sd >= cfg.limitCrit;
  }
  if (cfg.shimmer === 'disco') {
    lines = lines.map((l) => recolor(l, (col) => { const [r, g, b] = hueRgb(col * 14 + idiv(cfg.nowMs, 6), 0); return tc(r, g, b); }));
  } else if (dangerActive) {
    const pulse = Math.abs((idiv(cfg.nowMs, 200) % 60) - 30);   // 0..30, slow throb
    lines = lines.map((l) => recolor(l, (col) => tc(150 + pulse + (col % 3) * 12, 18, 18)));
  }

  return BELL + lines.join('\n') + '\n';
}

const cliArg = process.argv[2];
if (cliArg === '--preview') runPreview();
else if (cliArg === '--doctor') runDoctor();
else if (cliArg === '--report') runReport();
else if (cliArg && cliArg.startsWith('-')) {
  process.stdout.write('claude-statusline — a statusline command for Claude Code.\n\n'
    + 'Usage: reads Claude Code JSON on stdin and prints the statusline.\n\n'
    + 'Commands:\n  --preview   render every theme / bar style / shimmer\n'
    + '  --doctor    report terminal capabilities, active SL_* vars, and conflicts\n'
    + '  --report    summarise cross-session usage history\n  --help      this message\n\n'
    + 'Configure with SL_* environment variables — see the README.\n');
} else {
  try {
    process.stdout.write(build());
  } catch (e) {
    // Never blank the statusline — emit one minimal line.
    process.stdout.write(`${DIM}claude-statusline: ${(e && (e as Error).message) || 'error'}${R}\n`);
  }
}
