// Entry point: read the Claude Code JSON on stdin, build three lines, print them.
// Everything is wrapped so a bug prints a minimal line instead of a blank bar.
import * as fs from 'fs';
import * as os from 'os';
import { ESC, R, DIM, BOLD, justified, stripAnsi, txt, tc } from './ansi';
import { hueRgb } from './color';
import { RED, GREEN, AMBER, BLUE, CYAN, WHITE, GOLD, gradientColor } from './themes';
import { drawBar } from './bar';
import { rainbow } from './rainbow';
import { fmtK, fmtCountdown } from './format';
import { gitOut, countLines } from './git';
import { cfg } from './config';
import { idiv } from './util';
import { sessionKey, readState, writeState, pushSpark, readHistory, appendHistory } from './state';
import { sparkline, etaMinutes, median, weatherWord } from './insight';
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

  // ── persist this tick: context-% history, compaction detection, ETA samples,
  //    and a throttled cross-session history record for burn baselines ─────────
  let SPARK: number[] = [], COMPACTIONS = 0, ETA_SAMPLES: [number, number][] = [];
  try {
    const sk = sessionKey(data);
    const st = readState(sk);
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
    const h = new Date(cfg.clockMs).getHours();
    if (h < 5 || h >= 22) return tc(90, 110, 170);
    if (h < 8) return tc(150, 170, 210);
    if (h < 17) return tc(230, 225, 180);
    if (h < 20) return tc(235, 165, 90);
    return tc(150, 130, 180);
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
  const FILLED = idiv(PCT * BAR_WIDTH, 100);
  const MARKER_POS = COMPACT_OFF ? -1 : idiv(COMPACT_PCT_VAL * BAR_WIDTH, 100);
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
      const filled = idiv(pct * 10, 100);
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
  const CTX_SIZE_K = fmtK(MAX_TOK);
  let BRACKET = `${CREST}${MODEL_DISPLAY}`;
  if (ONEM) BRACKET += ` ${ONEM}`;
  if (EFFORT_WORD) BRACKET += ` ${EFFORT_WORD}`;
  if (THINKING_WORD) BRACKET += ` ${THINKING_WORD}`;

  const L1_LEFT = `${LEAD} ${PET}${DIM}[${R}${BRACKET}${DIM}]${R}`;
  const L1_RIGHT = `${MOON}${CLOCK_SEG}`;

  const PCT_FULL = WEATHER_SEG ? `${PCT_SEG} ${WEATHER_SEG}` : PCT_SEG;
  let CTX_STATS = `${DIM}${CTX_SIZE_K}${R}`;
  if (TURN_SEG) CTX_STATS += ` ${TURN_SEG}`;
  if (TREND_SEG) CTX_STATS += `  ${TREND_SEG}`;
  const L2_LEFT = `${BAR_PREFIX}${BAR}  ${PCT_FULL}${COMPACT_LABEL}  ${CTX_STATS}`;
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

  let lines = [justified(L1_LEFT, L1_RIGHT), justified(L2_LEFT, L2_RIGHT), justified(L3_LEFT, L3_RIGHT)];

  // disco: repaint EVERY glyph as one flowing rainbow (by column + time), so all
  // coloured elements animate together. Period = 360*6 = 2160 ms.
  if (cfg.shimmer === 'disco') {
    const disco = (line: string): string => {
      // group each base glyph with any trailing variation selector so it stays one unit
      const glyphs: string[] = [];
      for (const ch of Array.from(stripAnsi(line))) {
        const code = ch.codePointAt(0) || 0;
        if (code >= 0xfe00 && code <= 0xfe0f && glyphs.length) glyphs[glyphs.length - 1] += ch;
        else glyphs.push(ch);
      }
      let out = '', col = 0;
      for (const g of glyphs) {
        if (g === ' ') { out += ' '; col++; continue; }
        const [r, gg, b] = hueRgb(col * 14 + idiv(cfg.nowMs, 6), 0);
        out += `${tc(r, gg, b)}${g}${R}`;
        col++;
      }
      return out;
    };
    lines = lines.map(disco);
  }

  return lines.join('\n') + '\n';
}

try {
  process.stdout.write(build());
} catch (e) {
  // Never blank the statusline — emit one minimal line.
  process.stdout.write(`${DIM}claude-statusline: ${(e && (e as Error).message) || 'error'}${R}\n`);
}
