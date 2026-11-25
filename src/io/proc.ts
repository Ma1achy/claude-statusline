// Process hygiene: everything that keeps a short-lived invocation short-lived and a
// background child from multiplying. Claude Code re-runs the status line every
// refreshInterval and cancels runs that overrun, so any invocation that can block
// (a stdin pipe nobody closes, a git that never returns, a child created but never
// started) piles up one process per tick. Each guard here bounds one of those.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { pidAlive } from './runs';
import { hash } from '../state';

// Budgets (ms). A render normally takes well under 300 ms; the refresher a few git
// calls. These are ceilings for when something blocks, not targets.
export const STDIN_TIMEOUT_MS = 1500;      // give up on a stdin pipe nobody closes
export const RENDER_BUDGET_MS = 5000;      // render and --hook hard-exit
export const REFRESH_BUDGET_MS = 15000;    // --git-refresh hard-exit
export const REFRESH_GIT_DEADLINE_MS = 8000; // all of one refresh's git calls
export const REFRESH_WAIT_MS = 2000;       // wait this long for another refresher to finish
export const REFRESH_LOCK_STALE_MS = 2 * REFRESH_BUDGET_MS; // a holder this old is gone

const LOCK_DIR = path.join(os.tmpdir(), 'claude-statusline', 'locks');

/** Exit after `ms` whatever is still pending. unref'd, so it never keeps a process
 *  alive; it fires only while the event loop is waiting (every synchronous child
 *  call carries its own timeout for the time the loop is blocked). SL_EXIT_AFTER_MS
 *  overrides the budget (tests prove the timer fires without waiting seconds). */
export function exitAfter(ms: number): void {
  const o = parseInt(process.env.SL_EXIT_AFTER_MS || '', 10);
  setTimeout(() => process.exit(0), o > 0 ? o : ms).unref();
}

/** Read stdin to the end, but never wait longer than `timeoutMs` for the writer to
 *  close the pipe. Resolves early once the bytes so far are a complete JSON object,
 *  so a writer that sends the payload but never closes costs nothing. A TTY or an
 *  absent stdin resolves '' at the deadline. Releases stdin so the process can exit. */
export function readStdin(timeoutMs: number = STDIN_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve) => {
    let buf = '';
    let settled = false;
    const stdin = process.stdin;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Stop reading and let go of the handle; fd 0 itself stays open (a child may
      // still inherit it).
      try { stdin.removeAllListeners('data'); stdin.pause(); (stdin as { unref?: () => void }).unref?.(); } catch { /* ignore */ }
      resolve(buf);
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      stdin.setEncoding('utf8');
      stdin.on('data', (d: string) => {
        buf += d;
        const t = buf.trimEnd();
        if (t.startsWith('{') && t.endsWith('}')) { try { JSON.parse(t); finish(); } catch { /* not complete yet */ } }
      });
      stdin.on('end', finish);
      stdin.on('error', finish);
    } catch { finish(); }
  });
}

// ── single-holder locks ───────────────────────────────────────────────────────
interface LockBody { pid: number; t: number }

export const lockFile = (kind: string, key: string): string => path.join(LOCK_DIR, `${kind}-${hash(key)}.lock`);

function readLock(file: string): LockBody | null {
  try {
    const b = JSON.parse(fs.readFileSync(file, 'utf8')) as LockBody;
    return b && typeof b.pid === 'number' && typeof b.t === 'number' ? b : null;
  } catch { return null; }
}

/** Is `file` held by a live process other than us, taken less than `staleMs` ago? */
export function lockHeld(file: string, staleMs: number, alive: (pid: number) => boolean = pidAlive): boolean {
  let b = readLock(file);
  if (!b) {
    // Unreadable: either half-written this instant or garbage. Judge by mtime.
    try { const m = fs.statSync(file).mtimeMs; return Date.now() - m < Math.min(staleMs, 2000); } catch { return false; }
  }
  if (b.pid === process.pid) b = null;
  return !!b && Date.now() - b.t < staleMs && alive(b.pid);
}

/** Take `file` exclusively. A lock whose holder is dead, or older than `staleMs`,
 *  is broken and retaken. Released automatically when this process exits. */
export function claimLock(file: string, staleMs: number, alive: (pid: number) => boolean = pidAlive): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const fd = fs.openSync(file, 'wx');
      try { fs.writeSync(fd, JSON.stringify({ pid: process.pid, t: Date.now() })); } finally { fs.closeSync(fd); }
      process.on('exit', () => releaseLock(file));
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return false;
      if (lockHeld(file, staleMs, alive)) return false;
      try { fs.unlinkSync(file); } catch { /* raced another breaker */ }
    }
  }
  return false;
}

/** Refresh our lock's timestamp (a long-lived holder stays fresh). */
export function touchLock(file: string): void {
  const b = readLock(file);
  if (b && b.pid === process.pid) try { fs.writeFileSync(file, JSON.stringify({ pid: process.pid, t: Date.now() })); } catch { /* ignore */ }
}

export function releaseLock(file: string): void {
  const b = readLock(file);
  if (b && b.pid === process.pid) try { fs.unlinkSync(file); } catch { /* ignore */ }
}

// ── children that never start ─────────────────────────────────────────────────
// On Windows, libuv creates every child suspended, then resumes it. A parent killed
// between the two (Claude Code cancelling an overrunning render) leaves the child
// suspended for ever: one thread, no CPU, never runs a line of our code, so no
// timer inside it can help. The spawner therefore drops a note before spawning; a
// child that starts deletes its parent's notes, and the next child to start reaps
// any child that a note says was spawned but never started.
const NOTE_MIN_AGE_MS = 15000;          // a started child clears its note within ms
const NOTE_MAX_AGE_MS = 3600000;        // older notes are dropped without a reap

const notePrefix = (kind: string): string => `spawn-${kind}-`;

/** Call just before spawning a `kind` child. Returns a cleanup for a failed spawn. */
export function noteSpawn(kind: string): () => void {
  const file = path.join(LOCK_DIR, `${notePrefix(kind)}${process.pid}-${Date.now()}.json`);
  try { fs.mkdirSync(LOCK_DIR, { recursive: true }); fs.writeFileSync(file, ''); } catch { /* best-effort */ }
  return () => { try { fs.unlinkSync(file); } catch { /* ignore */ } };
}

interface Note { file: string; spawner: number; t: number }

function readNotes(kind: string): Note[] {
  const pre = notePrefix(kind);
  let names: string[];
  try { names = fs.readdirSync(LOCK_DIR).filter((n) => n.startsWith(pre)).slice(0, 256); } catch { return []; }
  const out: Note[] = [];
  for (const n of names) {
    const m = /^(\d+)-(\d+)\.json$/.exec(n.slice(pre.length));
    if (m) out.push({ file: path.join(LOCK_DIR, n), spawner: +m[1], t: +m[2] });
  }
  return out;
}

/** A `kind` child calls this once it runs: clears its parent's notes, then kills any
 *  `kind` child an older note says was spawned but never started. `marker` is an
 *  argv token that identifies such a child (e.g. '--git-refresh'). */
export function clearAndReapNotes(kind: string, marker: string, now: number = Date.now()): number {
  const notes = readNotes(kind);
  const stale: Note[] = [];
  for (const n of notes) {
    if (n.spawner === process.ppid || now - n.t > NOTE_MAX_AGE_MS) { try { fs.unlinkSync(n.file); } catch { /* ignore */ } }
    else if (now - n.t > NOTE_MIN_AGE_MS) stale.push(n);
  }
  if (!stale.length) return 0;
  let reaped = 0;
  if (process.platform === 'win32') {
    for (const p of childrenOf(stale.map((n) => n.spawner))) {
      // Identity, not just a pid: our script and marker in its command line, its
      // parent the spawner a note names, created within the note's spawn window.
      const n = stale.find((s) => s.spawner === p.ppid && p.created >= s.t - 2000 && p.created <= s.t + NOTE_MIN_AGE_MS);
      if (!n || p.pid === process.pid || !p.cmd.includes(marker) || !p.cmd.includes(path.basename(__filename))) continue;
      try { process.kill(p.pid); reaped++; } catch { /* already gone */ }
    }
  }
  // POSIX forks and execs; there is no suspended state to reap, only notes to drop.
  for (const n of stale) try { fs.unlinkSync(n.file); } catch { /* ignore */ }
  return reaped;
}

interface Proc { pid: number; ppid: number; created: number; cmd: string }

/** Windows: live processes whose parent is one of `ppids`, with creation time (ms)
 *  and command line. One hidden PowerShell call, bounded. */
function childrenOf(ppids: number[]): Proc[] {
  const ids = [...new Set(ppids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return [];
  const filter = ids.map((n) => `ParentProcessId=${n}`).join(' or ');
  const script = `Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { '{0}|{1}|{2}|{3}' -f $_.ProcessId, $_.ParentProcessId, `
    + `[int64]($_.CreationDate.ToUniversalTime() - [datetime]'1970-01-01').TotalMilliseconds, $_.CommandLine }`;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 8000 });
    return out.split(/\r?\n/).map((l) => l.split('|')).filter((a) => a.length >= 4)
      .map((a) => ({ pid: +a[0], ppid: +a[1], created: +a[2], cmd: a.slice(3).join('|') }))
      .filter((p) => p.pid > 0 && Number.isFinite(p.created));
  } catch { return []; }
}
