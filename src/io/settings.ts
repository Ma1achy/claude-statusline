// Reads of the user's Claude config files. Both fail soft to a neutral default so
// a missing or malformed file never blanks the statusline.
import * as fs from 'fs';
import * as os from 'os';

/** Display name (or email) from ~/.claude.json's oauthAccount, else ''. */
export function readAccountName(): string {
  try {
    const cj = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude.json`, 'utf8'));
    return (cj.oauthAccount && (cj.oauthAccount.displayName || cj.oauthAccount.emailAddress)) || '';
  } catch { return ''; }
}

/** Autocompact settings from ~/.claude/settings.json. `pct` is the override string
 *  (or '' if unset); `off` is true when autocompact is explicitly disabled.
 *  autoCompactEnabled is the current key (older builds used autoCompact). */
export function readAutocompact(): { pct: string; off: boolean } {
  let pct = '', off = false;
  try {
    const s = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude/settings.json`, 'utf8'));
    if (s.env && s.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) pct = String(s.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
    if (s.autoCompactEnabled === false || s.autoCompact === false) off = true;
  } catch { /* ignore */ }
  return { pct, off };
}
