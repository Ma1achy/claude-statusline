// Entry point: read the Claude Code JSON on stdin, build three lines, print them.
// Everything is wrapped so a bug prints a minimal line instead of a blank bar.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawn } from 'child_process';
import { R, DIM, justified, stripAnsi, txt, tc, termCols } from './ansi';
import { hueRgb } from './color';
import { ROLES } from './themes';
import { drawBar, scaleCells } from './bar';
import { rainbow } from './rainbow';
import { fmtK, fmtCountdown } from './format';
import { gitOut, countLines } from './git';
import { cfg, preInput } from './config';
import { idiv } from './util';
import { sessionKey, readState, writeState, pushSpark, readHistory, appendHistory,
  HISTORY_BUCKET_MS, BURN_BASELINE_MIN_MS, BURN_MIN_SESSION_MS } from './state';
import { sparkline, etaMinutes, median, weatherWord } from './insight';
import { st } from './style';
import { runPreview, runDoctor, runReport, runMigrate } from './cli';
import type { StatuslineInput, RateLimit, Role } from './types';

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

// Read only the last `maxBytes` of a file (the tail), as a bounded alternative to
// readFileSync on files that grow without limit. A transcript can reach tens of MB
// over a long session; reading the whole thing every repaint is the kind of
// unbounded hot-path I/O that can push a render past refreshInterval. 256 KB of
// tail is far more than enough to find the most recent tool calls.
function readTail(file: string, maxBytes: number): string {
  let fd = -1;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    let s = buf.toString('utf8');
    // When the file was truncated, the first line is partial — and its leading bytes
    // may be a split multibyte char that decoded to U+FFFD. Drop everything up to the
    // first newline (which removes any such garbage). If there's no newline at all
    // (one pathological >maxBytes line), drop the whole thing rather than keep U+FFFD.
    if (size > maxBytes) { const nl = s.indexOf('\n'); s = nl >= 0 ? s.slice(nl + 1) : ''; }
    return s;
  } catch { return ''; }
  finally { if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ } }
}

// Parse the Claude Code JSON from stdin (shared by the renderer and the git
// refresher). Branch auto-theming may have already consumed stdin into preInput.
function readInput(): StatuslineInput {
  if (preInput) return preInput;
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  try { return (JSON.parse(input) as StatuslineInput) || {}; } catch { return {}; }
}

// Raw git facts for a working dir, gathered through `gc` (the only thing that
// touches git). `gc` is a memoised reader: in the foreground it returns cached
// values and never execs; in the refresher it execs and fills the cache. Both
// call this, so the set of git commands (cache keys) can never drift between them.
interface GitInfo {
  branch: string; branchLabel: string; dirty: number; staged: number; gitId: string;
  state: string; today: number; ahead: number; behind: number; ageSecs: number;
  untracked: number; stash: number; mood: string; riskLevel: string;
}
function readGit(CWD: string, gc: (args: string[]) => string): GitInfo {
  const branch = gc(['rev-parse', '--abbrev-ref', 'HEAD']);
  const g: GitInfo = {
    branch, branchLabel: branch, dirty: countLines(gc(['status', '--porcelain'])),
    staged: countLines(gc(['diff', '--cached', '--name-only'])), gitId: gc(['config', 'user.email']),
    state: '', today: 0, ahead: 0, behind: 0, ageSecs: -1, untracked: 0, stash: 0, mood: '', riskLevel: '',
  };
  if (cfg.gitExtra && branch) {
    // detached HEAD → show a short sha instead of "HEAD".
    if (branch === 'HEAD') { const sha = gc(['rev-parse', '--short', 'HEAD']); if (sha) g.branchLabel = `:${sha}`; }
    // mid-operation state from the git dir (merge / rebase / cherry-pick).
    try {
      let gd = gc(['rev-parse', '--git-dir']);
      if (gd) {
        if (!path.isAbsolute(gd)) gd = path.join(CWD, gd);
        if (fs.existsSync(path.join(gd, 'MERGE_HEAD'))) g.state = 'merge';
        else if (fs.existsSync(path.join(gd, 'rebase-merge')) || fs.existsSync(path.join(gd, 'rebase-apply'))) g.state = 'rebase';
        else if (fs.existsSync(path.join(gd, 'CHERRY_PICK_HEAD'))) g.state = 'cherry';
      }
    } catch { /* ignore */ }
    // commits made since local midnight of the current frame (today's momentum).
    const mid = new Date(cfg.clockMs); mid.setHours(0, 0, 0, 0);
    const ct2 = parseInt(gc(['rev-list', '--count', `--since=${idiv(mid.getTime(), 1000)}`, 'HEAD']), 10);
    if (Number.isFinite(ct2) && ct2 > 0) g.today = ct2;
    const m = gc(['rev-list', '--count', '--left-right', '@{upstream}...HEAD']).match(/^(\d+)\s+(\d+)$/);
    if (m) { g.behind = +m[1]; g.ahead = +m[2]; }
    const ct = parseInt(gc(['log', '-1', '--format=%ct']), 10);
    if (Number.isFinite(ct) && ct > 0) g.ageSecs = Math.max(0, cfg.baseFrame - ct);
    g.untracked = countLines(gc(['ls-files', '--others', '--exclude-standard']));
    g.stash = countLines(gc(['stash', 'list']));
    g.mood = /^wip\//i.test(branch) ? 'wip' : /^(hotfix|fix)\//i.test(branch) ? 'fix'
      : /^(feat|feature)\//i.test(branch) ? 'feat' : /^test\//i.test(branch) ? 'test' : '';
  }
  // git risk (SL_GIT_RISK) — a deliberately rough composite; opt-in.
  if (cfg.gitRisk && branch) {
    let s = 0;
    if (g.dirty > 0) s += g.dirty >= 10 ? 2 : 1;
    if (countLines(gc(['stash', 'list'])) > 0) s += 1;
    const rm = gc(['rev-list', '--count', '--left-right', '@{upstream}...HEAD']).match(/^(\d+)\s+(\d+)$/);
    if (rm) { if (+rm[1] > 0) s += 1; if (+rm[2] >= 5) s += 1; }
    if (g.state) s += 2;
    g.riskLevel = s >= 4 ? 'high' : s >= 2 ? 'med' : 'low';
  }
  return g;
}

// The detached `--git-refresh` child: exec git off the hot path and write the
// cache for the next foreground tick. No output, no segment work — just git.
function refreshGitCache(data: StatuslineInput): void {
  const CWD = (data.workspace && data.workspace.current_dir) || '';
  const gitMemo: Record<string, string> = {};
  const gc = (args: string[]): string => {
    const key = args.join(' ');
    if (key in gitMemo) return gitMemo[key];
    const v = gitOut(CWD, args); gitMemo[key] = v; return v;
  };
  try {
    const sk = sessionKey(data);
    readGit(CWD, gc);                         // populates gitMemo via exec (incl. '' for non-repos)
    const st = readState(sk);                 // merge into the foreground's latest spark/eta
    st.git = { cwd: CWD, ts: cfg.nowMs, data: gitMemo };
    writeState(sk, st);
  } catch { /* refresh is best-effort */ }
}

// Pet face (SL_PET): a width-safe ASCII mood that escalates 0→4 with the chosen
// signal. An unset SL_PET_REACTS_TO reproduces the original context+cost behaviour.
function buildPet(COST: number, DIRTY: number, PCT: number): string {
  if (!cfg.pet) return '';
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
  const role = (['ok', 'fg', 'warn', 'bad', 'gold'] as Role[])[lvl];
  return `${st('pet', faces[lvl], { role })} `;
}

// Usage-limit gauges (the 5h / 7d bars on line 2). SL_LIMITS tints amber past the
// warn threshold and bold-red + "LOW" past crit; each bar shows a reset countdown.
function buildUsage(rl: { five_hour?: RateLimit; seven_day?: RateLimit }): string {
  const NOW = cfg.baseFrame;
  const rlSeg = (label: string, pctIn: number | undefined, resetsAt: number | string | undefined, phase: number): string => {
    let pct = Math.floor(pctIn || 0); if (pct > 100) pct = 100;
    const bar = drawBar(10, scaleCells(pct, 10), -1, phase);
    let pctStr: string, warn = '';
    // limit warnings (SL_LIMITS): warn role past warn, bold bad + LOW past crit; else gradient.
    if (cfg.limits && pct >= cfg.limitCrit) { pctStr = st('usage.pct', `${pct}%`, { role: 'bad', weight: 'bold' }); warn = ` ${st('usage.warn', 'LOW')}`; }
    else if (cfg.limits && pct >= cfg.limitWarn) { pctStr = st('usage.pct', `${pct}%`, { role: 'warn' }); }
    else pctStr = st('usage.pct', `${pct}%`, { pct });
    let secsLeft = 0;
    const ra = typeof resetsAt === 'number' ? resetsAt : parseInt(String(resetsAt), 10);
    if (Number.isFinite(ra) && ra > 0) secsLeft = ra - NOW;
    const cd = st('usage.countdown', secsLeft <= 0 ? 'now' : fmtCountdown(secsLeft));
    return `${st('usage.label', label)} ${bar} ${pctStr}${warn} ${cd}`;
  };
  const fh = rl.five_hour || {}, sd = rl.seven_day || {};
  return `${rlSeg('5h', fh.used_percentage, fh.resets_at, 1500)}   ${rlSeg('7d', sd.used_percentage, sd.resets_at, 3000)}`;
}

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
  let CLAUDE_USER = '';
  try {
    const cj = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude.json`, 'utf8'));
    CLAUDE_USER = (cj.oauthAccount && (cj.oauthAccount.displayName || cj.oauthAccount.emailAddress)) || '';
  } catch { /* ignore */ }

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
  let COMPACT_PCT = '', COMPACT_OFF = false;
  try {
    const st = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude/settings.json`, 'utf8'));
    if (st.env && st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) COMPACT_PCT = String(st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
    if (st.autoCompactEnabled === false || st.autoCompact === false) COMPACT_OFF = true;
  } catch { /* ignore */ }
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
