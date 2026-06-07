// Persistence layer. Two tiers, both fail-silent (any fs error → safe default,
// never an exception that could blank the statusline):
//   • per-session ring buffer in os.tmpdir() — recent context %, compaction count,
//     burn baseline, bell de-dup. Bounded; whole-file atomic rewrite each tick.
//   • cross-session append log in ~/.claude — one record per sample, for burn-rate
//     baselines / z-scores and the --report view. Bounded by occasional pruning.
// Timestamps come from cfg.nowMs so SL_FRAME_MS keeps tests/renders deterministic.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cfg } from './config';
import type { StatuslineInput } from './types';

const DIR = path.join(os.tmpdir(), 'claude-statusline');
const HISTORY = path.join(os.homedir(), '.claude', 'statusline-history.jsonl');
const TTL_MS = 7 * 86400000;     // session state older than a week is discarded
const SPARK_CAP = 30;            // context-% ring buffer length
const ETA_CAP = 20;              // [ms, pct] samples for ETA regression
const HISTORY_CAP = 1000;        // cross-session records kept

export interface SessionState {
  v: number;
  updated: number;
  spark: number[];
  compactions: number;
  burnBaseline?: number;
  lastBellMs?: number;
  etaSamples?: [number, number][];
  histBucket?: number;             // last 5-min duration bucket appended to history
  bellLevel?: number;              // highest bell threshold already rung (de-dup)
  git?: { cwd: string; ts: number; data: Record<string, string> };   // SL_GIT_CACHE
}

export interface HistoryRecord { t: number; cost: number; ctx: number; dur: number; }

const now = (): number => cfg.nowMs;
const fresh = (): SessionState => ({ v: 1, updated: 0, spark: [], compactions: 0 });

// FNV-1a — a tiny stable hash so transcript paths key a state file without `crypto`.
function hash(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}
const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

/** Stable per-session key: session_id, else a hash of the transcript path, else shared. */
export function sessionKey(input: StatuslineInput): string {
  const sid = input.session_id ? sanitize(String(input.session_id)) : '';
  if (sid) return sid;
  if (input.transcript_path) return hash(input.transcript_path);
  return 'default';
}

const fileFor = (key: string): string => path.join(DIR, `${key}.json`);

export function readState(key: string): SessionState {
  try {
    const s = JSON.parse(fs.readFileSync(fileFor(key), 'utf8')) as SessionState;
    if (!s || typeof s !== 'object') return fresh();
    if (now() - (s.updated || 0) > TTL_MS) return fresh();          // stale → start over
    return { ...fresh(), ...s };
  } catch { return fresh(); }
}

export function writeState(key: string, s: SessionState): void {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    s.v = 1;
    s.updated = now();
    if (s.spark.length > SPARK_CAP) s.spark = s.spark.slice(-SPARK_CAP);
    if (s.etaSamples && s.etaSamples.length > ETA_CAP) s.etaSamples = s.etaSamples.slice(-ETA_CAP);
    const tmp = `${fileFor(key)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s));
    try { fs.renameSync(tmp, fileFor(key)); }                       // atomic on same fs
    catch { fs.writeFileSync(fileFor(key), JSON.stringify(s)); }    // Windows fallback
    janitor();
  } catch { /* ignore */ }
}

/** Append a fixed-precision value to the context-% ring buffer. */
export function pushSpark(s: SessionState, pct: number): void {
  s.spark.push(Math.max(0, Math.min(100, Math.round(pct))));
  if (s.spark.length > SPARK_CAP) s.spark = s.spark.slice(-SPARK_CAP);
}

// Opportunistic cleanup of abandoned session files — cheap, runs ~1% of writes.
function janitor(): void {
  if (now() % 100 >= 1) return;
  try {
    for (const f of fs.readdirSync(DIR)) {
      const fp = path.join(DIR, f);
      try { if (now() - fs.statSync(fp).mtimeMs > TTL_MS) fs.unlinkSync(fp); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

// ── cross-session history (durable) ───────────────────────────────────────────
export function appendHistory(rec: HistoryRecord): void {
  try {
    fs.mkdirSync(path.dirname(HISTORY), { recursive: true });
    fs.appendFileSync(HISTORY, JSON.stringify(rec) + '\n');
    if (now() % 50 < 1) {                                           // prune occasionally
      const kept = readHistory();
      if (kept.length >= HISTORY_CAP) fs.writeFileSync(HISTORY, kept.map((r) => JSON.stringify(r)).join('\n') + '\n');
    }
  } catch { /* ignore */ }
}

export function readHistory(): HistoryRecord[] {
  try {
    const out: HistoryRecord[] = [];
    for (const l of fs.readFileSync(HISTORY, 'utf8').split('\n')) {
      if (!l) continue;
      try { const r = JSON.parse(l); if (r && typeof r.cost === 'number') out.push(r); } catch { /* torn line */ }
    }
    return out.slice(-HISTORY_CAP);
  } catch { return []; }
}
