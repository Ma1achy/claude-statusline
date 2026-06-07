// Custom segment (SL_CUSTOM_SEGMENT): run a user script as a child with the Claude
// Code JSON on stdin and take its first stdout line. Timeout + error isolated so a
// broken/slow plugin can never hang or blank the statusline.
import { execFileSync } from 'child_process';
import type { StatuslineInput } from '../types';
import { cfg } from '../config';

export function buildCustom(data: StatuslineInput): string {
  if (!cfg.customSegment) return '';
  try {
    const out = execFileSync(process.execPath, [cfg.customSegment], {
      input: JSON.stringify(data), encoding: 'utf8', timeout: 250,
      stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
    });
    const first = (out.split('\n')[0] || '').slice(0, 240);
    if (first) return `  ${first}`;
  } catch { /* plugin error / timeout → drop it silently */ }
  return '';
}
