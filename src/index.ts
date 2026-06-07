// Entry point: read the Claude Code JSON on stdin, build three lines, print them.
// Everything is wrapped so a bug prints a minimal line instead of a blank bar.
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync, spawn } from 'child_process';
import { R, DIM, txt, tc } from './ansi';
import { ROLES } from './themes';
import { drawBar, scaleCells } from './bar';
import { rainbow } from './rainbow';
import { fmtK, fmtCountdown } from './format';
import { cfg } from './config';
import { idiv } from './util';
import { sessionKey, readState, writeState, pushSpark, readHistory, appendHistory,
  HISTORY_BUCKET_MS, BURN_BASELINE_MIN_MS, BURN_MIN_SESSION_MS } from './state';
import { sparkline, etaMinutes, median, weatherWord } from './insight';
import { st } from './style';
import { runPreview, runDoctor, runReport, runMigrate } from './cli';
import { readInput, readTail } from './io/input';
import { readGit, refreshGitCache } from './io/gitcache';
import { displayPath } from './segments/path';
import { buildPet } from './segments/pet';
import { buildUsage } from './segments/usage';
import { readAccountName, readAutocompact } from './io/settings';
import { applyWashes } from './render/recolor';
import { assembleLayout } from './render/layout';
import type { Role } from './types';

function build(): string {
  const data = readInput();

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
  // git-output cache: the foreground paints from this; a detached background
  // refresher (cfg.gitRefresh) rewrites it. TTL bounds how stale git can get.
  const GIT_TTL = 2500;
  let gitMemo: Record<string, string> = {};
  // kickRefresh: this render should spawn a background refresher to update git.
  let kickRefresh = false;
  // gc(): the foreground never execs git — it returns whatever the cache holds
  // (possibly stale, possibly empty on a cold start) so the render can't be slowed
  // below refreshInterval by a big/slow repo. Only refreshGitCache() execs git.
  const gc = (args: string[]): string => gitMemo[args.join(' ')] ?? '';

  let SPARK: number[] = [], COMPACTIONS = 0, ETA_SAMPLES: [number, number][] = [], BELL = '';
  try {
    const sk = sessionKey(data);
    const st = readState(sk);
    // Reuse cached git for this render whenever it's for the same cwd — even when
    // stale, so git never blanks between refreshes; freshness decides if we refresh.
    let gitFresh = false;
    if (st.git && st.git.cwd === CWD) {
      gitMemo = { ...st.git.data };
      gitFresh = cfg.nowMs - st.git.ts < GIT_TTL;
    }
    // Kick a background git refresh when the cache is stale/missing, rate-limited
    // to one per TTL so cold-start can't stampede overlapping refreshers.
    if (CWD && !gitFresh && cfg.nowMs - (st.lastGitRefresh || 0) > GIT_TTL) {
      kickRefresh = true;
      st.lastGitRefresh = cfg.nowMs;
    }
    // SL_BELL: ring once each time context crosses into a higher band (de-dup via state).
    if (cfg.bell) {
      const lvl = PCT >= 95 ? 2 : PCT >= 80 ? 1 : 0;
      if (lvl > (st.bellLevel ?? 0)) BELL = '\x07';
      st.bellLevel = lvl;
    }
    const prev = st.spark.length ? st.spark[st.spark.length - 1] : -1;
    if (prev >= 0 && PCT !== prev) cfg.event = true;               // drives flash/ripple shimmers
    if (prev >= 0 && PCT <= prev - 25) st.compactions += 1;        // sharp drop = an autocompact
    pushSpark(st, PCT);
    st.etaSamples = (st.etaSamples || []).concat([[DURATION_MS, PCT]]).slice(-20);
    // one cross-session record per 5-minute duration bucket (keeps the log small).
    const bucket = idiv(DURATION_MS, HISTORY_BUCKET_MS);
    if (cfg.burn && COST > 0 && bucket > (st.histBucket ?? -1)) {
      st.histBucket = bucket;
      appendHistory({ t: cfg.nowMs, cost: COST, ctx: PCT, dur: DURATION_MS });
    }
    writeState(sk, st);
    SPARK = st.spark.slice();
    COMPACTIONS = st.compactions;
    ETA_SAMPLES = st.etaSamples;
  } catch { /* state is best-effort */ }

  // ── custom segment (SL_CUSTOM_SEGMENT) — run a user script as a child with the
  //    Claude Code JSON on stdin; take its first stdout line. Timeout + error
  //    isolated so a broken/slow plugin can never hang or blank the statusline. ─
  let CUSTOM_SEG = '';
  if (cfg.customSegment) {
    try {
      const out = execFileSync(process.execPath, [cfg.customSegment], {
        input: JSON.stringify(data), encoding: 'utf8', timeout: 250,
        stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
      });
      const first = (out.split('\n')[0] || '').slice(0, 240);
      if (first) CUSTOM_SEG = `  ${first}`;
    } catch { /* plugin error / timeout → drop it silently */ }
  }

  // ── model: tier + version ─────────────────────────────────────────────────
  const idl = MODEL_ID.toLowerCase();
  let TIER = 'Sonnet', modelRole: Role = 'accent';
  if (idl.includes('haiku')) { TIER = 'Haiku'; modelRole = 'info'; }
  else if (idl.includes('opus')) { TIER = 'Opus'; modelRole = 'gold'; }
  const vm = idl.match(/(opus|sonnet|haiku)-(\d+)-(\d+)/);
  const MODEL_VER = vm ? `${vm[2]}.${vm[3]}` : '';
  const MODEL_DISPLAY = st('model.tier', MODEL_VER ? `${TIER} ${MODEL_VER}` : MODEL_NAME, { role: modelRole });
  const ONEM = MAX_TOK >= 900000 ? st('model.badge1m', '1M') : '';

  // ── crest (SL_CREST) ────────────────────────────────────────────────────────
  let CREST = '';
  if (cfg.crest) {
    const g = TIER === 'Opus' ? '★' : TIER === 'Haiku' ? '▲' : '◆';
    CREST = st('crest', g, { role: modelRole }) + ' ';
  }

  // ── effort + thinking ─────────────────────────────────────────────────────
  let effortRole: Role = 'fg', effortWeight: 'normal' | 'bold' | 'dim' = 'normal', effortText = '';
  switch (EFFORT) {
    case 'low': effortWeight = 'dim'; effortText = 'low'; break;
    case 'medium': effortWeight = 'dim'; effortText = 'med'; break;
    case 'high': effortText = 'high'; break;
    case 'xhigh': effortRole = 'warn'; effortText = 'xhigh'; break;
    case 'max': effortRole = 'bad'; effortWeight = 'bold'; effortText = 'MAX'; break;
  }
  const EFFORT_WORD = effortText ? st('effort', effortText, { role: effortRole, weight: effortWeight }) : '';
  const THINKING_WORD = THINKING ? st('thinking', 'thinking', { role: effortRole, weight: 'dim' }) : '';

  // ── fast/slow + vim mode ────────────────────────────────────────────────────
  // Claude Code does NOT expose the permission/auto-accept mode to statuslines
  // (no such field), so this slot shows what IS available: the /fast toggle
  // (gold ⚡ = fast, dim ▫ = slow) and the vim input mode when enabled.
  const FAST = data.fast_mode ? st('lead.fast', txt('⚡')) : st('lead.fast', txt('▫'), { role: 'muted' });
  let VIM = '';
  const vmode = (data.vim && data.vim.mode) || '';
  if (vmode) {
    const u = vmode.toUpperCase();
    const role: Role = u.startsWith('INS') ? 'ok' : u.startsWith('VIS') ? 'warn' : 'accent';
    VIM = ` ${st('lead.vim', u[0] || '?', { role })}`;
  }
  const LEAD = `${FAST}${VIM}`;

  // ── moon phase (SL_MOON) ────────────────────────────────────────────────────
  let MOON = '';
  if (cfg.moon) {
    const days = cfg.nowMs / 86400000 - 10961.26;       // since 2000-01-06 new moon
    const phase = ((days / 29.530589) % 1 + 1) % 1;      // 0=new … 0.5=full
    const g = ['●', '◐', '○', '◑'][Math.round(phase * 4) % 4];
    MOON = `${st('moon', g)} `;
  }

  // ── day/night clock colour (SL_DAYNIGHT) ────────────────────────────────────
  const clockColour = (): string => {
    if (!cfg.daynight) return ROLES.muted;
    const h = new Date(cfg.clockMs).getHours();
    if (h < 5 || h >= 22) return tc(90, 110, 170);
    if (h < 8) return tc(150, 170, 210);
    if (h < 17) return tc(230, 225, 180);
    if (h < 20) return tc(235, 165, 90);
    return tc(150, 130, 180);
  };

  const DIR_SEG = st('dir', `${cfg.nerdfont ? ' ' : ''}${displayPath(CWD)}`);

  // ── git ─── facts gathered by readGit() (cache-backed); display built here ────
  const G = readGit(CWD, gc);
  const BRANCH = G.branch, BRANCH_LABEL = G.branchLabel, DIRTY = G.dirty, STAGED = G.staged;
  const GIT_ID = G.gitId, GIT_STATE = G.state;
  const GIT_TODAY = G.today > 0 ? ` ${st('git.today', `${txt('✓')}${G.today}`)}` : '';
  let GIT_AB = '';
  { let s = ''; if (G.ahead) s += st('git.ahead', `${txt('↑')}${G.ahead}`); if (G.behind) s += st('git.behind', `${txt('↓')}${G.behind}`); if (s) GIT_AB = `  ${s}`; }
  let GIT_AGE = '';
  if (G.ageSecs >= 0) {
    const secs = G.ageSecs;
    const a = secs < 60 ? `${secs}s` : secs < 3600 ? `${idiv(secs, 60)}m`
      : secs < 86400 ? `${idiv(secs, 3600)}h` : `${idiv(secs, 86400)}d`;
    GIT_AGE = `  ${st('git.age', `·${a}`)}`;
  }
  const GIT_UNTRACKED = G.untracked > 0 ? `  ${st('git.untracked', `?${G.untracked}`)}` : '';
  const GIT_STASH = G.stash > 0 ? ` ${st('git.stash', `s:${G.stash}`)}` : '';
  const BRANCH_MOOD = G.mood ? `${st('git.mood', `[${G.mood}]`)} ` : '';
  const riskRole: Role = G.riskLevel === 'high' ? 'bad' : G.riskLevel === 'med' ? 'warn' : 'ok';
  const GIT_RISK = G.riskLevel ? `  ${st('git.risk', `risk:${G.riskLevel}`, { role: riskRole })}` : '';

  // ── pet (SL_PET) ────────────────────────────────────────────────────────────
  const PET = buildPet(COST, DIRTY, PCT);

  // ── Claude account name ─────────────────────────────────────────────────────
  const CLAUDE_USER = readAccountName();

  // ── last file touched (from transcript) ─────────────────────────────────────
  let LAST_FILE = '';
  try {
    if (TRANSCRIPT && fs.existsSync(TRANSCRIPT)) {
      const lines = readTail(TRANSCRIPT, 262144).split('\n').filter(Boolean).slice(-80);
      const re = /write|edit|read|str_replace|create/i;   // Claude tool names are capitalised (Edit/Read/Write)
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
  const FILE_SEG = LAST_FILE ? ` ${st('file', `› ${LAST_FILE}`)}` : '';

  // ── autocompact threshold (from settings.json) ──────────────────────────────
  // The marker + label only appear when autocompact is ENABLED. autoCompactEnabled
  // is the current key (older builds used autoCompact); default is on if absent.
  const { pct: COMPACT_PCT, off: COMPACT_OFF } = readAutocompact();
  let COMPACT_LABEL: string, COMPACT_PCT_VAL: number;
  if (COMPACT_OFF) { COMPACT_LABEL = ''; COMPACT_PCT_VAL = -1; }            // disabled → no marker, no label
  else if (COMPACT_PCT) { COMPACT_LABEL = st('ctx.compactLabel', ` |${COMPACT_PCT}%`); COMPACT_PCT_VAL = parseInt(COMPACT_PCT, 10); }
  else { COMPACT_LABEL = st('ctx.compactLabel', ' |95%'); COMPACT_PCT_VAL = 95; }

  // ── context bar ─────────────────────────────────────────────────────────────
  const BAR_WIDTH = 28;
  const FILLED = scaleCells(PCT, BAR_WIDTH);
  const MARKER_POS = COMPACT_OFF ? -1 : scaleCells(COMPACT_PCT_VAL, BAR_WIDTH);
  const BAR = drawBar(BAR_WIDTH, FILLED, MARKER_POS, 0);
  const PCT_SEG = st('ctx.pct', `${PCT}%`, { pct: PCT });   // gradient lerps along the theme

  // ── trend (SL_TREND): sparkline of recent context %, ETA to autocompact, ─────
  //    and a count of compactions detected this session ─────────────────────────
  let TREND_SEG = '';
  if (cfg.trend) {
    const parts: string[] = [];
    const spark = sparkline(SPARK);
    if (spark) parts.push(st('trend.spark', spark));
    if (!COMPACT_OFF && COMPACT_PCT_VAL > 0) {
      const eta = etaMinutes(ETA_SAMPLES, COMPACT_PCT_VAL, PCT);
      if (eta >= 0) parts.push(st('trend.eta', `~${fmtCountdown(eta * 60)}`, { pct: PCT }));
    }
    if (COMPACTIONS > 0) parts.push(st('trend.compactions', `↺${COMPACTIONS}`));
    TREND_SEG = parts.join(' ');
  }
  // ── weather (SL_WEATHER): a one-word reading of context pressure ─────────────
  const WEATHER_SEG = cfg.weather ? st('ctx.weather', weatherWord(PCT, COMPACT_OFF ? 0 : COMPACT_PCT_VAL), { pct: PCT }) : '';

  // ── per-turn token breakdown ────────────────────────────────────────────────
  let TURN_SEG = '';
  if (cu != null) {
    const total = CU_INPUT + CU_WRITE + CU_READ;
    let HIT_SEG = '';
    if (total > 0 && CU_READ > 0) {
      const hit = idiv(CU_READ * 100, total);
      HIT_SEG = st('tokens.hit', `✦${hit}%`, { weight: hit >= 70 ? 'bold' : hit >= 40 ? 'normal' : 'dim' });
    }
    const readSeg = CU_READ > 0 ? ` ${st('tokens.read', `✦${fmtK(CU_READ)}`)}` : '';
    const writeSeg = CU_WRITE > 0 ? ` ${st('tokens.write', `+${fmtK(CU_WRITE)}w`)}` : '';
    const inSeg = CU_INPUT > 0 ? ` ${st('tokens.in', `${txt('↓')}${fmtK(CU_INPUT)}`)}` : '';
    const outSeg = CU_OUT > 0 ? ` ${st('tokens.out', `${txt('↑')}${fmtK(CU_OUT)}`)}` : '';
    TURN_SEG = HIT_SEG + readSeg + writeSeg + inSeg + outSeg;
  }

  // ── cost ────────────────────────────────────────────────────────────────────
  const COST_FMT = Number(COST).toFixed(3);
  const costNum = parseFloat(COST_FMT);
  const costRole: Role = costNum >= 0.50 ? 'bad' : costNum >= 0.10 ? 'warn' : 'ok';
  const COST_FLAIR = cfg.costFlair
    ? (costNum >= 1 ? '!$' : costNum >= 0.50 ? '$$' : costNum >= 0.10 ? '$' : '·') + ' '
    : '';
  let COST_SEG: string, BAR_PREFIX: string;
  if (COST_FMT === '0.000') { COST_SEG = st('cost.amount', '$0', { role: 'muted' }); BAR_PREFIX = `${ROLES.muted}∅ ${R}`; }
  else {
    const price = `${COST_FLAIR}$${COST_FMT}`;
    COST_SEG = cfg.rainbowStats && !cfg.accessible ? rainbow(price) : st('cost.amount', price, { role: costRole });
    BAR_PREFIX = '';
  }
  if (cfg.burn && DURATION_MS >= BURN_MIN_SESSION_MS && costNum > 0) {
    const ratePerHr = COST / (DURATION_MS / 3600000);
    COST_SEG += ` ${st('cost.rate', `$${ratePerHr.toFixed(2)}/hr`)}`;
    // cross-session baseline: how this session's burn compares to your own median.
    try {
      const rates = readHistory().filter((h) => h.dur >= BURN_BASELINE_MIN_MS && h.cost > 0).map((h) => h.cost / (h.dur / 3600000));
      if (rates.length >= 5) {
        const med = median(rates);
        if (med > 0) {
          const ratio = ratePerHr / med;
          const rRole: Role = ratio >= 1.5 ? 'bad' : ratio >= 1.1 ? 'warn' : 'muted';
          COST_SEG += ` ${st('cost.ratio', `${ratio.toFixed(1)}x`, { role: rRole })}`;
        }
      }
    } catch { /* baseline is best-effort */ }
  }

  // ── session age ─────────────────────────────────────────────────────────────
  const DUR_S = idiv(DURATION_MS, 1000);
  let ageRole: Role, AGE_LABEL: string;
  if (DUR_S >= 7200) { ageRole = 'bad'; AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`; }
  else if (DUR_S >= 3600) { ageRole = 'warn'; AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`; }
  else if (DUR_S >= 60) { ageRole = 'ok'; AGE_LABEL = `${idiv(DUR_S, 60)}m`; }
  else { ageRole = 'muted'; AGE_LABEL = `${DUR_S}s`; }
  const AGE_SEG = cfg.rainbowStats && !cfg.accessible ? rainbow(AGE_LABEL) : st('age', AGE_LABEL, { role: ageRole });

  // ── clock ─────────────────────────────────────────────────────────────────
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dt = new Date(cfg.clockMs);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const CLOCK_SEG = `${clockColour()}${DAYS[dt.getDay()]} ${p2(dt.getDate())} ${MONTHS[dt.getMonth()]}  ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}${R}`;

  // ── usage limits ────────────────────────────────────────────────────────────
  const USAGE_SEG = rl != null ? buildUsage(rl) : '';

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
  const SEP = cfg.separator ? ` ${st('separator', cfg.separator)} ` : '  ';

  // SL_SYSINFO: 1-minute load average (os.loadavg is 0 on unsupported platforms).
  let SYS_SEG = '';
  if (cfg.sysinfo) { const la = os.loadavg()[0]; if (la > 0) SYS_SEG = `${st('sysinfo', `↯${la.toFixed(2)}`)} `; }

  const CTX_SIZE_K = fmtK(MAX_TOK);
  const BR_OPEN = st('bracket.delim', '['), BR_CLOSE = st('bracket.delim', ']');
  let BRACKET = `${sh('crest', CREST)}${sh('model', MODEL_DISPLAY)}`;
  if (ONEM) BRACKET += ` ${ONEM}`;
  if (EFFORT_WORD) BRACKET += ` ${sh('effort', EFFORT_WORD)}`;
  if (THINKING_WORD) BRACKET += ` ${sh('thinking', THINKING_WORD)}`;

  const L1_LEFT = `${LEAD} ${sh('pet', PET)}${BR_OPEN}${BRACKET}${BR_CLOSE}`;
  const L1_RIGHT = `${sh('sysinfo', SYS_SEG)}${sh('moon', MOON)}${sh('clock', CLOCK_SEG)}`;

  const PCT_FULL = WEATHER_SEG ? `${PCT_SEG} ${sh('weather', WEATHER_SEG)}` : PCT_SEG;
  let CTX_STATS = st('ctx.size', CTX_SIZE_K);
  if (TURN_SEG) CTX_STATS += ` ${sh('tokens', TURN_SEG)}`;
  if (TREND_SEG) CTX_STATS += `${SEP}${sh('trend', TREND_SEG)}`;
  const L2_LEFT = `${BAR_PREFIX}${BAR}  ${PCT_FULL}${COMPACT_LABEL}${SEP}${CTX_STATS}`;
  const L2_RIGHT = sh('usage', USAGE_SEG);

  let L3_LEFT = `${sh('dir', DIR_SEG)}${sh('file', FILE_SEG)}`;
  let GIT_SEG = '';
  if (BRANCH) {
    GIT_SEG += `  ${BRANCH_MOOD}${st('git.branch', `${cfg.nerdfont ? '' : '⎇'} ${BRANCH_LABEL}`)}`;
    if (GIT_STATE) GIT_SEG += ` ${st('git.state', `${GIT_STATE}!`)}`;
    GIT_SEG += GIT_TODAY;
  }
  GIT_SEG += GIT_AB + GIT_AGE;
  if (GIT_ID && !HIDE.has('email')) GIT_SEG += `  ${st('git.email', GIT_ID)}`;
  if (ADDED > 0 || REMOVED > 0) GIT_SEG += `  ${st('git.added', `+${ADDED}`)}/${st('git.removed', `-${REMOVED}`)}`;
  if (DIRTY > 0) GIT_SEG += `  ${st('git.dirty', `~${DIRTY}`)}`;
  if (STAGED > 0) GIT_SEG += ` ${st('git.staged', `●${STAGED}`)}`;
  GIT_SEG += GIT_UNTRACKED + GIT_STASH + GIT_RISK;
  L3_LEFT += sh('git', GIT_SEG) + sh('custom', CUSTOM_SEG);
  let L3_RIGHT = '';
  // `name` defaults to a rainbow fill; the accessibility profile (style.ts) demotes
  // it to plain fg automatically, so no special-case is needed here.
  if (CLAUDE_USER) L3_RIGHT = `${sh('name', `${st('name', CLAUDE_USER)}  `)}`;
  L3_RIGHT += `${sh('cost', COST_SEG)}  ${sh('age', AGE_SEG)}`;

  // Layout: which lines to emit (assembleLayout handles SL_LAYOUT / SL_RESPONSIVE).
  let lines = assembleLayout(
    { LEAD, BAR, PCT_SEG, PCT_FULL, BRACKET, COST_SEG, L1_LEFT, L1_RIGHT, L2_LEFT, L2_RIGHT, L3_LEFT, L3_RIGHT },
    sh,
  );

  // Whole-line washes (disco rainbow / danger safelight) override per-element fills.
  lines = applyWashes(lines, rl, PCT);

  // Fire-and-forget the git-cache refresher: a detached child re-runs this binary
  // with --git-refresh, execs git off the hot path, and writes the cache for the
  // next tick. Detached + unref'd so it outlives this (cancellable) render — the
  // mechanism that lets the cache populate at all when a render gets cancelled at
  // the refreshInterval boundary. Best-effort: any failure just means stale git.
  if (kickRefresh) {
    try {
      const child = spawn(process.execPath, [__filename, '--git-refresh'], {
        detached: true, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'], env: process.env,
      });
      if (child.stdin) { child.stdin.write(JSON.stringify(data)); child.stdin.end(); }
      child.on('error', () => { /* spawn failed → git just stays stale */ });
      child.unref();
    } catch { /* best-effort */ }
  }

  return BELL + lines.join('\n') + '\n';
}

const cliArg = process.argv[2];
if (cliArg === '--preview') runPreview();
else if (cliArg === '--doctor') runDoctor();
else if (cliArg === '--report') runReport();
else if (cliArg === '--migrate') runMigrate();
else if (cliArg === '--git-refresh') {
  // Detached background invocation: warm the git cache, print nothing.
  refreshGitCache(readInput());
}
else if (cliArg && cliArg.startsWith('-')) {
  process.stdout.write('claude-statusline — a statusline command for Claude Code.\n\n'
    + 'Usage: reads Claude Code JSON on stdin and prints the statusline.\n\n'
    + 'Commands:\n  --preview   render every theme / bar style / shimmer\n'
    + '  --doctor    report terminal capabilities, active config, and conflicts\n'
    + '  --report    summarise cross-session usage history\n'
    + '  --migrate   translate a legacy SL_* env block to JSON config (on stdout)\n'
    + '  --help      this message\n\n'
    + 'Configure via ~/.claude/statusline.json (or $SL_CONFIG) — see the README.\n');
} else {
  try {
    const out = build();
    // SL_TMUX_PASSTHROUGH: wrap in the tmux DCS so truecolor survives the
    // multiplexer (requires `set -g allow-passthrough on` in tmux ≥3.3).
    process.stdout.write(cfg.tmuxPassthrough ? `\x1bPtmux;${out.replace(/\x1b/g, '\x1b\x1b')}\x1b\\` : out);
  } catch (e) {
    // Never blank the statusline — emit one minimal line.
    process.stdout.write(`${DIM}claude-statusline: ${(e && (e as Error).message) || 'error'}${R}\n`);
  }
}
