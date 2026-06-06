// Entry point: read the Claude Code JSON on stdin, build three lines, print them.
// Everything is wrapped so a bug prints a minimal line instead of a blank bar.
import * as fs from 'fs';
import * as os from 'os';
import { ESC, R, DIM, BOLD, justified } from './ansi';
import { RED, GREEN, AMBER, BLUE, CYAN, WHITE, GOLD } from './themes';
import { drawBar } from './bar';
import { rainbow } from './rainbow';
import { fmtK, fmtCountdown } from './format';
import { gitOut, countLines } from './git';
import { cfg } from './config';
import { idiv } from './util';
import type { StatuslineInput } from './types';

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
  // (gold ⚡ = fast, dim ⚡ = slow) and the vim input mode when enabled.
  const FAST = data.fast_mode ? `${GOLD}⚡${R}` : `${DIM}⚡${R}`;
  let VIM = '';
  const vmode = (data.vim && data.vim.mode) || '';
  if (vmode) {
    const u = vmode.toUpperCase();
    const col = u.startsWith('INS') ? GREEN : u.startsWith('VIS') ? AMBER : CYAN;
    VIM = ` ${col}${u[0] || '?'}${R}`;
  }
  const LEAD = `${FAST}${VIM}`;

  // ── pet (SL_PET) ────────────────────────────────────────────────────────────
  let PET = '';
  if (cfg.pet) {
    let face: string, col: string;
    if (COST >= 0.50) { face = '[$_$]'; col = GOLD; }
    else if (PCT >= 85) { face = '[>_<]'; col = RED; }
    else if (PCT >= 70) { face = '[o_o]'; col = AMBER; }
    else if (PCT >= 40) { face = '[._.]'; col = ''; }
    else { face = '[^_^]'; col = GREEN; }
    PET = `${col}${face}${R} `;
  }

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
    const h = new Date(cfg.nowMs).getHours();
    if (h < 5 || h >= 22) return `${ESC}[38;2;90;110;170m`;
    if (h < 8) return `${ESC}[38;2;150;170;210m`;
    if (h < 17) return `${ESC}[38;2;230;225;180m`;
    if (h < 20) return `${ESC}[38;2;235;165;90m`;
    return `${ESC}[38;2;150;130;180m`;
  };

  const DIR_SEG = `${DIM}${CWD}${R}`;

  // ── git ─────────────────────────────────────────────────────────────────────
  const BRANCH = gitOut(CWD, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const DIRTY = countLines(gitOut(CWD, ['status', '--porcelain']));
  const STAGED = countLines(gitOut(CWD, ['diff', '--cached', '--name-only']));
  const GIT_ID = gitOut(CWD, ['config', 'user.email']);

  let GIT_AB = '', GIT_AGE = '', GIT_UNTRACKED = '', GIT_STASH = '', BRANCH_MOOD = '';
  if (cfg.gitExtra && BRANCH) {
    const ab = gitOut(CWD, ['rev-list', '--count', '--left-right', '@{upstream}...HEAD']);
    const m = ab.match(/^(\d+)\s+(\d+)$/);
    if (m) {
      const behind = +m[1], ahead = +m[2];
      let s = '';
      if (ahead) s += `${GREEN}↑${ahead}${R}`;
      if (behind) s += `${RED}↓${behind}${R}`;
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
  let COMPACT_PCT = '', COMPACT_OFF = false;
  try {
    const st = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude/settings.json`, 'utf8'));
    if (st.env && st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) COMPACT_PCT = String(st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
    if (st.autoCompact === false) COMPACT_OFF = true;
  } catch { /* ignore */ }
  let COMPACT_LABEL: string, COMPACT_PCT_VAL: number;
  if (COMPACT_OFF) { COMPACT_LABEL = `${DIM} no-cmp${R}`; COMPACT_PCT_VAL = 100; }
  else if (COMPACT_PCT) { COMPACT_LABEL = `${DIM} |${COMPACT_PCT}%${R}`; COMPACT_PCT_VAL = parseInt(COMPACT_PCT, 10); }
  else { COMPACT_LABEL = `${DIM} |95%${R}`; COMPACT_PCT_VAL = 95; }

  // ── context bar ─────────────────────────────────────────────────────────────
  const BAR_WIDTH = 28;
  const FILLED = idiv(PCT * BAR_WIDTH, 100);
  const MARKER_POS = COMPACT_OFF ? -1 : idiv(COMPACT_PCT_VAL * BAR_WIDTH, 100);
  const BAR = drawBar(BAR_WIDTH, FILLED, MARKER_POS, 0);
  const PCT_COLOUR = PCT >= 70 ? RED : PCT >= 40 ? AMBER : GREEN;
  const PCT_SEG = `${PCT_COLOUR}${PCT}%${R}`;

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
    const inSeg = CU_INPUT > 0 ? ` ${DIM}↓${fmtK(CU_INPUT)}${R}` : '';
    const outSeg = CU_OUT > 0 ? ` ${DIM}↑${fmtK(CU_OUT)}${R}` : '';
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
    const rate = (COST / (DURATION_MS / 3600000)).toFixed(2);
    COST_SEG += ` ${DIM}$${rate}/hr${R}`;
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
  const dt = new Date(cfg.nowMs);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const CLOCK_SEG = `${clockColour()}${DAYS[dt.getDay()]} ${p2(dt.getDate())} ${MONTHS[dt.getMonth()]}  ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}${R}`;

  // ── usage limits ────────────────────────────────────────────────────────────
  let USAGE_SEG = '';
  if (rl != null) {
    const NOW = cfg.baseFrame;
    const rlSeg = (label: string, pctIn: number | undefined, resetsAt: number | string | undefined, phase: number): string => {
      let pct = Math.floor(pctIn || 0); if (pct > 100) pct = 100;
      const filled = idiv(pct * 10, 100);
      const bar = drawBar(10, filled, -1, phase);
      const pc = pct >= 80 ? RED : pct >= 50 ? AMBER : GREEN;
      let secsLeft = 0;
      const ra = typeof resetsAt === 'number' ? resetsAt : parseInt(String(resetsAt), 10);
      if (Number.isFinite(ra) && ra > 0) secsLeft = ra - NOW;
      const cd = secsLeft <= 0 ? `${DIM}now${R}` : `${DIM}${fmtCountdown(secsLeft)}${R}`;
      return `${DIM}${label}${R} ${bar} ${pc}${pct}%${R} ${cd}`;
    };
    const fh = rl.five_hour || {}, sd = rl.seven_day || {};
    USAGE_SEG = `${rlSeg('5h', fh.used_percentage, fh.resets_at, 1500)}   ${rlSeg('7d', sd.used_percentage, sd.resets_at, 3000)}`;
  }

  // ── assemble ────────────────────────────────────────────────────────────────
  const CTX_SIZE_K = fmtK(MAX_TOK);
  let BRACKET = `${CREST}${MODEL_DISPLAY}`;
  if (ONEM) BRACKET += ` ${ONEM}`;
  if (EFFORT_WORD) BRACKET += ` ${EFFORT_WORD}`;
  if (THINKING_WORD) BRACKET += ` ${THINKING_WORD}`;

  const L1_LEFT = `${LEAD} ${PET}${DIM}[${R}${BRACKET}${DIM}]${R}`;
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

  return `${justified(L1_LEFT, L1_RIGHT)}\n${justified(L2_LEFT, L2_RIGHT)}\n${justified(L3_LEFT, L3_RIGHT)}\n`;
}

try {
  process.stdout.write(build());
} catch (e) {
  // Never blank the statusline — emit one minimal line.
  process.stdout.write(`${DIM}claude-statusline: ${(e && (e as Error).message) || 'error'}${R}\n`);
}
