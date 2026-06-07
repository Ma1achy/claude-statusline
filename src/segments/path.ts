// Display form of the cwd.
import * as os from 'os';
import { cfg } from '../config';

// Project aliases first, then (unless SL_PATH=full) home→~ and middle-compression
// of deep paths (keep root + … + last two).
export function displayPath(cwd: string): string {
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
