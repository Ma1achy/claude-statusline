// Git helpers. All calls use --no-optional-locks and fail soft to "".
import { execFileSync } from 'child_process';

export function gitOut(cwd: string, args: string[]): string {
  if (!cwd) return '';
  try {
    return execFileSync('git', ['-C', cwd, '--no-optional-locks', ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch { return ''; }
}

export const countLines = (s: string): number => (s ? s.split('\n').filter((l) => l.length).length : 0);
