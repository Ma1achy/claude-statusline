// Last file touched, parsed from the transcript tail: the most recent file-bearing
// tool call (Edit/Read/Write/...). Bounded read so a multi-MB transcript is cheap.
import * as fs from 'fs';
import { st } from '../style';
import { readTail } from '../io/input';

export function buildLastFile(TRANSCRIPT: string): string {
  let LAST_FILE = '';
  try {
    if (TRANSCRIPT && fs.existsSync(TRANSCRIPT)) {
      const lines = readTail(TRANSCRIPT, 262144).split('\n').filter(Boolean).slice(-80);
      const re = /write|edit|read|str_replace|create/i;   // Claude tool names are capitalised (Edit/Read/Write)
      for (const line of lines) {
        let ev: any;
        try { ev = JSON.parse(line); } catch { continue; }
        if (!ev || ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) continue;
        for (const c of ev.message.content) {
          if (c && c.type === 'tool_use' && typeof c.name === 'string' && re.test(c.name)) {
            const p = (c.input && (c.input.path || c.input.file_path)) || '';
            if (p) LAST_FILE = p.split(/[\\/]/).pop();
          }
        }
      }
    }
  } catch { /* ignore */ }
  return LAST_FILE ? ` ${st('file', `› ${LAST_FILE}`)}` : '';
}
