// Git helpers. All calls use --no-optional-locks, a hidden window, a timeout, and
// fail soft to "".
import { execFileSync } from 'child_process';

export const GIT_TIMEOUT_MS = 3000;

// Never prompt (credentials, ssh passphrases): there is no one to answer.
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

export interface GitResult { out: string; timedOut: boolean }

/** Run git in `cwd`; a git that outlives `timeoutMs` is killed and reported. */
export function gitRun(cwd: string, args: string[], timeoutMs: number = GIT_TIMEOUT_MS): GitResult {
  if (!cwd) return { out: '', timedOut: false };
  try {
    const out = execFileSync('git', ['-C', cwd, '--no-optional-locks', ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: timeoutMs, killSignal: 'SIGKILL', env: GIT_ENV });
    return { out: out.trim(), timedOut: false };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { signal?: string };
    return { out: '', timedOut: err.code === 'ETIMEDOUT' || !!err.signal };
  }
}

export function gitOut(cwd: string, args: string[], timeoutMs: number = GIT_TIMEOUT_MS): string {
  return gitRun(cwd, args, timeoutMs).out;
}

export const countLines = (s: string): number => (s ? s.split('\n').filter((l) => l.length).length : 0);
