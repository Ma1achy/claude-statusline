// The renderer: read the Claude Code JSON, build each segment, assemble the lines,
// apply any whole-line washes, and kick a background git refresh. Returns the full
// statusline string (the entry in index.ts only dispatches and prints it).
import * as os from 'os';
import { spawn } from 'child_process';
import { termCols } from './ansi';
import { drawBar, scaleCells } from './bar';
import { fmtK } from './format';
import { cfg, resolveBranchTheme } from './config';
import { rebuildTheme } from './themes';
import { st, glyphFor } from './style';
import { readInput } from './io/input';
import { readGit } from './io/gitcache';
import { readAccountName, readAutocompact } from './io/settings';
import { persistTick } from './io/tick';
import { displayPath } from './segments/path';
import { buildPet } from './segments/pet';
import { buildUsage } from './segments/usage';
import { buildModel, buildEffort } from './segments/model';
import { buildLead } from './segments/lead';
import { buildClock } from './segments/clock';
import { buildContext } from './segments/context';
import { buildTokens } from './segments/tokens';
import { buildCost, buildAge } from './segments/cost';
import { buildGitSeg } from './segments/git';
import { buildCustom } from './segments/custom';
import { buildLastFile } from './segments/lastfile';
import { buildWarning } from './segments/warning';
import { buildActivity } from './segments/activity';
import { buildConversation } from './segments/conversation';
import { applyWashes } from './render/recolor';
import { assembleLayout } from './render/layout';
import { applyFrame } from './render/frame';

export function build(): string {
  const data = readInput();

  // Branch auto-theming resolves the theme from git at render time (not at import);
  // rebuild the theme only when it actually changed cfg.themeName.
  if (resolveBranchTheme(data)) rebuildTheme();

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
  const rl = data.rate_limits;

  // ── per-tick state: spark/eta/compaction history, git cache, bell ─────────────
  // The foreground never execs git — it paints from gitMemo (the cache a detached
  // refresher rewrites) so a big/slow repo can't slow a render below refreshInterval.
  const { gitMemo, kickRefresh, SPARK, COMPACTIONS, ETA_SAMPLES, BELL } =
    persistTick(data, CWD, PCT, COST, DURATION_MS);
  const gc = (args: string[]): string => gitMemo[args.join(' ')] ?? '';

  // ── build segments ────────────────────────────────────────────────────────────
  const CUSTOM_SEG = buildCustom(data);
  const { display: MODEL_DISPLAY, oneM: ONEM, crest: CREST } = buildModel(MODEL_ID, MODEL_NAME, MAX_TOK);
  const { word: EFFORT_WORD, thinking: THINKING_WORD } = buildEffort(EFFORT, THINKING);
  const LEAD = buildLead(data);
  const { clock: CLOCK_SEG, moon: MOON } = buildClock();
  const DIR_SEG = st('dir', `${glyphFor('dir', cfg.nerdfont ? '\u{F07B} ' : '')}${displayPath(CWD)}`);
  const G = readGit(CWD, gc);
  const PET = buildPet(COST, G.dirty, PCT);
  const CLAUDE_USER = readAccountName();
  const FILE_SEG = buildLastFile(TRANSCRIPT);
  const { pct: COMPACT_PCT, off: COMPACT_OFF } = readAutocompact();
  const { bar: BAR, pctSeg: PCT_SEG, trend: TREND_SEG, weather: WEATHER_SEG, compactLabel: COMPACT_LABEL } =
    buildContext(PCT, COMPACT_PCT, COMPACT_OFF, SPARK, ETA_SAMPLES, COMPACTIONS);
  const TURN_SEG = buildTokens(cw.current_usage);
  const { seg: COST_SEG, barPrefix: BAR_PREFIX } = buildCost(COST, DURATION_MS);
  const AGE_SEG = buildAge(DURATION_MS);
  const USAGE_SEG = rl != null ? buildUsage(rl) : '';

  // ── assemble ────────────────────────────────────────────────────────────────
  // SL_HIDE drops named segments; SL_SEPARATOR swaps the major join (default "  ").
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

  const GIT_SEG = buildGitSeg(G, ADDED, REMOVED, HIDE.has('email'));

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
  L3_LEFT += sh('git', GIT_SEG) + sh('custom', CUSTOM_SEG);
  let L3_RIGHT = '';
  // `name` defaults to a rainbow fill; the accessibility profile (style.ts) demotes
  // it to plain fg automatically, so no special-case is needed here.
  if (CLAUDE_USER) L3_RIGHT = `${sh('name', `${st('name', CLAUDE_USER)}  `)}`;
  L3_RIGHT += `${sh('cost', COST_SEG)}  ${sh('age', AGE_SEG)}`;

  // A terminal-width context bar for the dashboard layouts (header/barfirst/split).
  const wideW = Math.max(28, termCols() - 2 * cfg.margin - 12);
  const WIDE_BAR = drawBar(wideW, scaleCells(PCT, wideW), -1, 0);

  // Layout: which lines to emit (assembleLayout handles SL_LAYOUT / SL_RESPONSIVE).
  let lines = assembleLayout(
    { LEAD, BAR, PCT_SEG, PCT_FULL, BRACKET, COST_SEG, L1_LEFT, L1_RIGHT, L2_LEFT, L2_RIGHT, L3_LEFT, L3_RIGHT,
      WIDE_BAR, USAGE_SEG },
    sh,
  );

  // Whole-line washes (disco rainbow / danger safelight) override per-element fills.
  lines = applyWashes(lines, rl, PCT);

  // warningLine: append a conditional alert line (after the washes, so it keeps its
  // own red styling) only when a threshold is crossed.
  if (cfg.warningLine) {
    const warn = buildWarning(PCT, COST, rl, cfg.limitCrit);
    if (warn) lines.push(warn);
  }
  if (cfg.activityLine) { const a = buildActivity(TRANSCRIPT); if (a) lines.push(a); }
  if (cfg.conversationLine) { const c = buildConversation(cw.current_usage); if (c) lines.push(c); }

  // Optional framing (config `frame`): a rule between lines, or a box border.
  if (cfg.frame) lines = applyFrame(lines, cfg.frame);

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
