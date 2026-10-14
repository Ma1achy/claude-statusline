// Run progress — the fs half. Scans the runs dir and any configured log tails into
// Runs, keeps a tiny cross-session cache (first sighting per run for an ETA when the
// job gave no `started`, and the previous value per metric for a trend arrow), and
// writes progress files atomically for the --run helper. Everything here is bounded
// (file count, file size, tail bytes, cache entries) and fails soft: a malformed or
// half-written file is skipped, never an exception on the render path.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readTail } from './input';
import { resolveRun, parseLogTail, type Run, type RunFile, type RunRules } from '../runs';
import type { RunsConfig } from '../types';

const MAX_NAMES = 256;          // directory entries considered at all
const MAX_FILES = 32;           // newest progress files actually read
const MAX_FILE_BYTES = 16384;   // a progress file is a few hundred bytes; bigger is not one
const LOG_TAIL_BYTES = 65536;   // per log spec
const CACHE = path.join(os.tmpdir(), 'claude-statusline', 'runs.json');
const CACHE_CAP = 32;           // runs remembered
const CACHE_METRICS = 16;       // metrics remembered per run

/** Is `pid` a live process? Signal 0 probes without delivering anything; EPERM
 *  means it exists but belongs to someone else. */
export function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

export function readRuns(rc: RunsConfig, now: number, alive: (pid: number) => boolean = pidAlive): Run[] {
  const rules: RunRules = { now, staleAfterMs: rc.staleAfter * 1000, lingerMs: rc.linger * 1000, pausedLingerMs: rc.pausedLinger * 1000, alive };
  const out: Run[] = [];
  let names: string[] = [];
  try { names = fs.readdirSync(rc.dir).filter((n) => n.endsWith('.json') && !n.startsWith('.')).slice(0, MAX_NAMES); } catch { /* no dir → no runs */ }
  const files: Array<{ p: string; n: string; mtime: number; size: number }> = [];
  for (const n of names) {
    const p = path.join(rc.dir, n);
    try { const s = fs.statSync(p); if (s.isFile()) files.push({ p, n, mtime: s.mtimeMs, size: s.size }); } catch { /* raced a rename */ }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  for (const f of files.slice(0, MAX_FILES)) {
    if (f.size > MAX_FILE_BYTES) continue;
    try {
      const r = resolveRun(JSON.parse(fs.readFileSync(f.p, 'utf8')), f.n, f.mtime, rules);
      if (r) out.push(r);
    } catch { /* malformed / mid-write → skip */ }
  }
  for (const spec of rc.logs) {
    try {
      const mtime = fs.statSync(spec.log).mtimeMs;
      const raw = parseLogTail(spec, readTail(spec.log, LOG_TAIL_BYTES));
      const r = raw && resolveRun(raw, `log:${spec.name}`, mtime, rules);
      if (r) out.push(r);
    } catch { /* missing log → skip */ }
  }
  return out;
}

// ── cache: first sighting (ETA basis) + previous metric values (trend arrows) ──
interface CacheEntry { t: number; f: number; seen: number; m?: Record<string, [number, number]>; }
export type RunCache = Record<string, CacheEntry>;

export function readRunCache(): RunCache {
  try { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); return c && typeof c === 'object' ? c : {}; } catch { return {}; }
}

/** Fold this tick's runs into the cache. Pure (mutates and returns `cache`);
 *  returns whether anything changed so the caller can skip the write. A run whose
 *  fraction went backwards is a restart, and one resumed since its first sighting
 *  is a new stretch of work (the gap was no work at all), so either resets the
 *  first sighting. Each metric
 *  keeps [last, previous-different] so the arrow survives repaints at a constant value. */
export function updateRunCache(cache: RunCache, runs: Run[], now: number): boolean {
  let changed = false;
  for (const r of runs) {
    const f = r.frac ?? 0;
    let e = cache[r.key];
    if (!e || f < e.f || (r.resumed !== undefined && e.t < r.resumed)) { e = cache[r.key] = { t: r.updated, f, seen: now }; changed = true; }
    if (now - e.seen > 60000) { e.seen = now; changed = true; }    // touch at most once a minute
    for (const mt of r.metrics.slice(0, CACHE_METRICS)) {
      const k = `${mt.group}.${mt.name}`;
      const m = e.m || (e.m = {});
      const prev = m[k];
      if (!prev) { m[k] = [mt.value, mt.value]; changed = true; }
      else if (prev[0] !== mt.value) { m[k] = [mt.value, prev[0]]; changed = true; }
    }
  }
  const keys = Object.keys(cache);
  if (keys.length > CACHE_CAP) {
    keys.sort((a, b) => cache[a].seen - cache[b].seen);
    for (const k of keys.slice(0, keys.length - CACHE_CAP)) delete cache[k];
    changed = true;
  }
  return changed;
}

export function writeRunCache(cache: RunCache): void { writeJsonAtomic(CACHE, cache); }

/** Write JSON via tmp + rename so a reader never sees a half-written file. */
export function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  try { fs.renameSync(tmp, file); }
  catch { fs.writeFileSync(file, JSON.stringify(data, null, 1)); try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
}

export function readRunFile(file: string): RunFile | null {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; }
}
