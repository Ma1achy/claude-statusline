// stdin + bounded file reads. Kept off the render path so the failure mode of a
// huge/absent stdin or a multi-MB transcript is a safe "" rather than a slow tick.
import * as fs from 'fs';
import { preInput } from '../config';
import type { StatuslineInput } from '../types';

// Parse the Claude Code JSON from stdin (shared by the renderer and the git
// refresher). Branch auto-theming may have already consumed stdin into preInput.
export function readInput(): StatuslineInput {
  if (preInput) return preInput;
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  try { return (JSON.parse(input) as StatuslineInput) || {}; } catch { return {}; }
}

// Read only the last `maxBytes` of a file (the tail), as a bounded alternative to
// readFileSync on files that grow without limit. A transcript can reach tens of MB
// over a long session; reading the whole thing every repaint is the kind of
// unbounded hot-path I/O that can push a render past refreshInterval. 256 KB of
// tail is far more than enough to find the most recent tool calls.
export function readTail(file: string, maxBytes: number): string {
  let fd = -1;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    let s = buf.toString('utf8');
    // When the file was truncated, the first line is partial — and its leading bytes
    // may be a split multibyte char that decoded to U+FFFD. Drop everything up to the
    // first newline (which removes any such garbage). If there's no newline at all
    // (one pathological >maxBytes line), drop the whole thing rather than keep U+FFFD.
    if (size > maxBytes) { const nl = s.indexOf('\n'); s = nl >= 0 ? s.slice(nl + 1) : ''; }
    return s;
  } catch { return ''; }
  finally { if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ } }
}
