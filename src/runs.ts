// Run progress — the pure half. A long-running job (a training run, an eval sweep,
// a data pull) reports itself by writing one small JSON file into the runs dir; the
// statusline draws a bar per active run above the usual lines. This module owns the
// file format (the "progress API"), its normalisation into a displayable Run, the
// staleness/linger rules, number formatting, and the --run merge. No I/O here — the
// fs side lives in io/runs.ts, the drawing in segments/runs.ts — so every rule is
// unit-testable with an injected clock and pid probe.

/** The progress file as written by a job (format v1). Every field is optional
 *  except `name` and some notion of progress (a counter, `percent`, or `status`).
 *  Unknown fields are ignored, so the format can grow without breaking readers. */
export interface RunFile {
  v?: number;
  name?: string;
  status?: string;                 // running | done | failed | paused
  current?: number; total?: number; unit?: string;
  step?: number; steps?: number;
  epoch?: number; epochs?: number;
  percent?: number;                // explicit %, wins over every derived fraction
  metrics?: Record<string, Record<string, number>>;
  stage?: { current?: number; total?: number; label?: string };
  message?: string;
  started?: number; updated?: number;   // epoch ms
  pid?: number;
}

/** What a run looks like on screen. `stopped` = said running but its pid is gone;
 *  `stale` = said running but hasn't updated within staleAfter. */
export type RunStatus = 'running' | 'paused' | 'done' | 'failed' | 'stopped' | 'stale';

export interface Metric { group: string; name: string; value: number; }

export interface Run {
  key: string;                     // identity across ticks (file name / log spec)
  name: string;
  status: RunStatus;
  frac: number | null;             // 0..1, or null when there's no total to measure against
  current?: number; total?: number; unit?: string;
  step?: number; steps?: number;
  epoch?: number; epochs?: number;
  stage?: { current: number; total?: number; label?: string };
  metrics: Metric[];
  message?: string;
  started?: number;
  updated: number;
}

export interface RunRules {
  now: number;                     // ms
  staleAfterMs: number;
  lingerMs: number;
  alive: (pid: number) => boolean; // injectable so tests needn't spawn processes
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown, cap = 120): string | undefined =>
  (typeof v === 'string' && v.trim() ? v.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, cap) : undefined);
const STATUSES = new Set(['running', 'paused', 'done', 'failed']);
const GROUP_RANK: Record<string, number> = { train: 0, val: 1, eval: 2 };
const MAX_METRICS = 24;            // per run, before the display cap — bounds a chatty writer

/** Metrics ordered train → val → eval → anything else (insertion order within). */
export function flattenMetrics(m: unknown): Metric[] {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return [];
  const groups = Object.keys(m as object)
    .map((g, i) => ({ g, i, r: GROUP_RANK[g] ?? 3 }))
    .sort((a, b) => a.r - b.r || a.i - b.i);
  const out: Metric[] = [];
  for (const { g } of groups) {
    const kv = (m as Record<string, unknown>)[g];
    if (!kv || typeof kv !== 'object' || Array.isArray(kv)) continue;
    for (const [k, v] of Object.entries(kv as object)) {
      const n = num(v);
      if (n !== undefined && out.length < MAX_METRICS) out.push({ group: g.slice(0, 16), name: k.slice(0, 24), value: n });
    }
  }
  return out;
}

/** Fraction done: explicit percent → current/total → step/steps → epoch/epochs. */
export function fractionOf(f: RunFile): number | null {
  const clamp = (x: number): number => Math.max(0, Math.min(1, x));
  const p = num(f.percent);
  if (p !== undefined) return clamp(p / 100);
  for (const [c, t] of [[f.current, f.total], [f.step, f.steps], [f.epoch, f.epochs]]) {
    const cn = num(c), tn = num(t);
    if (cn !== undefined && tn !== undefined && tn > 0) return clamp(cn / tn);
  }
  return null;
}

/** Normalise a parsed progress file into a Run, applying the staleness rules.
 *  Returns null when the file isn't a run (no name / nothing to show) or when the
 *  run has outlived its linger window and should be hidden. */
export function resolveRun(raw: unknown, key: string, mtimeMs: number, rules: RunRules): Run | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const f = raw as RunFile;
  const name = str(f.name, 64);
  if (!name) return null;
  const given = typeof f.status === 'string' ? f.status.toLowerCase() : '';
  const frac = fractionOf(f);
  const hasCount = [f.current, f.step, f.epoch].some((v) => num(v) !== undefined);
  if (frac === null && !hasCount && !STATUSES.has(given)) return null;

  const updated = num(f.updated) ?? mtimeMs;
  const age = rules.now - updated;
  let status: RunStatus = STATUSES.has(given) ? (given as RunStatus) : 'running';
  // Visibility: a finished run lingers for `linger` after its last word; a live
  // one shows normally until staleAfter, then dims as "stale" for `linger` more.
  if (status === 'done' || status === 'failed') {
    if (age > rules.lingerMs) return null;
  } else {
    if (age > rules.staleAfterMs + rules.lingerMs) return null;
    const pid = num(f.pid);
    if (status === 'running' && pid !== undefined && pid > 0 && !rules.alive(pid)) status = 'stopped';
    else if (status === 'running' && age > rules.staleAfterMs) status = 'stale';
  }

  const st = f.stage && typeof f.stage === 'object' ? f.stage : undefined;
  const stCur = st ? num(st.current) : undefined;
  return {
    key, name, status, frac,
    current: num(f.current), total: num(f.total), unit: str(f.unit, 16),
    step: num(f.step), steps: num(f.steps), epoch: num(f.epoch), epochs: num(f.epochs),
    stage: st && stCur !== undefined ? { current: stCur, total: num(st.total), label: str(st.label, 24) } : undefined,
    metrics: flattenMetrics(f.metrics),
    message: str(f.message),
    started: num(f.started),
    updated,
  };
}

// Which runs win the `max` slots: live first, then the ones needing attention,
// finished last. Display order is by start (then name) so rows don't jump around.
const PRIO: Record<RunStatus, number> = { running: 0, stopped: 1, failed: 2, stale: 3, paused: 4, done: 5 };
export function pickRuns(runs: Run[], max: number): { shown: Run[]; more: number } {
  const ranked = runs.slice().sort((a, b) => PRIO[a.status] - PRIO[b.status] || b.updated - a.updated);
  const shown = ranked.slice(0, Math.max(0, max))
    .sort((a, b) => (a.started ?? a.updated) - (b.started ?? b.updated) || a.name.localeCompare(b.name));
  return { shown, more: Math.max(0, runs.length - shown.length) };
}

// ── log-tail runs: a plain training log, read through a user regex ─────────────
export interface RunLogSpec {
  name: string; log: string; pattern: string;
  total?: number; unit?: string; done?: string; failed?: string;
}

/** Turn the tail of a log into a progress file. Named groups: cur, total, step,
 *  steps, epoch, epochs, percent, and metric_<group>_<name>. Each group takes its
 *  value from the LAST match that defined it, so progress and metrics may come from
 *  different lines. done/failed regexes set the status (whichever appears last). */
export function parseLogTail(spec: RunLogSpec, tail: string): RunFile | null {
  let re: RegExp;
  try { re = new RegExp(spec.pattern, 'g'); } catch { return null; }
  const vals: Record<string, number> = {};
  const metrics: Record<string, Record<string, number>> = {};
  let hits = 0;
  for (const m of tail.matchAll(re)) {
    if (m[0] === '') continue;
    if (++hits > 5000) break;                       // bounded even on a pathological pattern
    for (const [g, v] of Object.entries(m.groups || {})) {
      if (v === undefined) continue;
      const n = parseFloat(v);
      if (!Number.isFinite(n)) continue;
      const mm = /^metric_([A-Za-z0-9]+)_(\w+)$/.exec(g);
      if (mm) (metrics[mm[1]] || (metrics[mm[1]] = {}))[mm[2]] = n;
      else vals[g] = n;
    }
  }
  const lastAt = (src?: string): number => {
    if (!src) return -1;
    try { let at = -1; for (const m of tail.matchAll(new RegExp(src, 'g'))) { if (m[0] === '') break; at = m.index ?? at; } return at; } catch { return -1; }
  };
  const d = lastAt(spec.done), x = lastAt(spec.failed);
  const status = x > d ? 'failed' : d > x ? 'done' : undefined;
  if (!hits && !status) return null;
  const f: RunFile = { name: spec.name, unit: spec.unit, status };
  if (vals.cur !== undefined) { f.current = vals.cur; f.total = vals.total ?? spec.total; }
  for (const k of ['step', 'steps', 'epoch', 'epochs', 'percent'] as const) if (vals[k] !== undefined) f[k] = vals[k];
  if (Object.keys(metrics).length) f.metrics = metrics;
  return f;
}

// ── formatting ─────────────────────────────────────────────────────────────────
/** A metric value at ~4 significant figures; scientific for the tiny and the huge. */
export function fmtMetric(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a < 1e-3 || a >= 1e6) return v.toExponential(2).replace(/\.?0+e/, 'e').replace('e+', 'e');
  if (a >= 1000) return String(Math.round(v));
  const s = v.toPrecision(4);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** A counter at 3 significant figures with a k/M suffix: 41200 → "41.2k". */
export function fmtCount(n: number): string {
  const a = Math.abs(n);
  if (a < 1000) return String(Math.round(n * 100) / 100);
  for (const [div, sfx] of [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']] as const) {
    if (a >= div * 0.9995) {
      const s = (n / div).toPrecision(3);
      return `${s.includes('.') ? s.replace(/\.?0+$/, '') : s}${sfx}`;
    }
  }
  return String(n);
}

/** A duration in ms as one or two compact units: 45s, 12m, 1h12m, 2d3h. */
export function fmtSpan(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) { const m = Math.floor((s % 3600) / 60); return `${Math.floor(s / 3600)}h${m ? `${m}m` : ''}`; }
  const h = Math.floor((s % 86400) / 3600);
  return `${Math.floor(s / 86400)}d${h ? `${h}h` : ''}`;
}

/** Remaining time for a running job, from its own `started`, else from the first
 *  sighting the statusline remembered (seenAt/seenFrac). Null when there's no basis. */
export function etaMs(run: Run, now: number, seen?: { t: number; f: number }): number | null {
  if (run.status !== 'running' || run.frac === null || run.frac <= 0 || run.frac >= 1) return null;
  let rem: number | null = null;
  if (run.started !== undefined && run.updated > run.started) {
    const el = run.updated - run.started;
    rem = el * (1 - run.frac) / run.frac;
  } else if (seen && run.frac > seen.f && run.updated > seen.t) {
    rem = (run.updated - seen.t) * (1 - run.frac) / (run.frac - seen.f);
  }
  if (rem === null) return null;
  return Math.max(0, rem - Math.max(0, now - run.updated));
}

// ── --run merge (the CLI writer) ───────────────────────────────────────────────
/** File-name slug for a run name: "A1 SAE b11×8" → "a1-sae-b11-8". */
export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'run';
}

/** Parse `--run` arguments: `<name> [current total] [--flag value]…`. Throws a
 *  plain message on bad input (the CLI prints it). */
export function parseRunArgs(argv: string[]): RunFile {
  const [name, ...rest] = argv;
  if (!name || name.startsWith('--')) throw new Error('usage: --run <name> [current total] [--step N] [--metric train.loss=0.03] …');
  const patch: RunFile = { name };
  const n = (flag: string, v: string | undefined): number => {
    const x = Number(v);
    if (v === undefined || v === '' || !Number.isFinite(x)) throw new Error(`${flag} needs a number`);
    return x;
  };
  const pos: number[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) { pos.push(n('current/total', a)); continue; }
    const v = rest[++i];
    if (v === undefined) throw new Error(`${a} needs a value`);
    switch (a) {
      case '--unit': patch.unit = v; break;
      case '--status':
        if (!STATUSES.has(v)) throw new Error('--status is one of running, done, failed, paused');
        patch.status = v; break;
      case '--message': patch.message = v; break;
      case '--step': patch.step = n(a, v); break;
      case '--steps': patch.steps = n(a, v); break;
      case '--epoch': patch.epoch = n(a, v); break;
      case '--epochs': patch.epochs = n(a, v); break;
      case '--percent': patch.percent = n(a, v); break;
      case '--pid': patch.pid = n(a, v); break;
      case '--stage': {
        const m = /^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?(?::(.+))?$/.exec(v);
        if (!m) throw new Error('--stage takes N/M[:label]');
        patch.stage = { current: +m[1], total: m[2] ? +m[2] : undefined, label: m[3] };
        break;
      }
      case '--metric': {
        const m = /^([A-Za-z0-9_-]+)\.([^=]+)=(.+)$/.exec(v);
        if (!m) throw new Error('--metric takes group.name=value');
        const g = (patch.metrics || (patch.metrics = {}));
        (g[m[1]] || (g[m[1]] = {}))[m[2]] = n(a, m[3]);
        break;
      }
      default: throw new Error(`unknown flag ${a}`);
    }
  }
  if (pos.length === 1) patch.current = pos[0];
  else if (pos.length >= 2) { patch.current = pos[0]; patch.total = pos[1]; }
  return patch;
}

/** Merge a patch over the existing file: `started` is kept (set on first write),
 *  metrics merge per group so one call needn't restate the others, `updated` = now.
 *  Reporting progress on a run that had finished starts it afresh. */
export function mergeRun(prev: RunFile | null, patch: RunFile, now: number): RunFile {
  let base: RunFile = prev && typeof prev === 'object' ? prev : {};
  const finished = (s?: string): boolean => s === 'done' || s === 'failed';
  if (finished(base.status) && !finished(patch.status)) base = {};
  const out: RunFile = { ...base, ...patch, v: 1 };
  if (base.metrics || patch.metrics) {
    const m: Record<string, Record<string, number>> = {};
    for (const src of [base.metrics, patch.metrics]) {
      if (!src || typeof src !== 'object') continue;
      for (const [g, kv] of Object.entries(src)) if (kv && typeof kv === 'object') m[g] = { ...(m[g] || {}), ...kv };
    }
    out.metrics = m;
  }
  out.started = num(base.started) ?? now;
  out.updated = now;
  if (!out.status) out.status = 'running';
  return out;
}
