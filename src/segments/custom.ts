// Custom segment (SL_CUSTOM_SEGMENT): run a user script as a child with the Claude
// Code JSON on stdin and take its first stdout line. Timeout + error isolated so a
// broken/slow plugin can never hang or blank the statusline.
import { execFileSync } from 'child_process';
import type { StatuslineInput } from '../types';
import { cfg } from '../config';

const TIMEOUT_MS = 250;   // kill a slow plugin well within the refresh interval
const MAX_LEN = 240;      // cap the injected text so a chatty plugin can't blow the line

export function buildCustom(data: StatuslineInput): string {
  if (!cfg.customSegment) return '';
  try {
    const out = execFileSync(process.execPath, [cfg.customSegment], {
      input: JSON.stringify(data), encoding: 'utf8', timeout: TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
    });
    const first = (out.split('\n')[0] || '').slice(0, MAX_LEN);
    if (first) return `  ${first}`;
  } catch { /* plugin error / timeout → drop it silently */ }
  return '';
}
