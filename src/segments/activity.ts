// Activity line (activityLine): the most recent tool the assistant invoked and its
// target, parsed from the transcript tail — e.g. "↳ edit bar.ts". Ephemeral; updates
// each repaint. Bounded read, fails soft to "".
import * as fs from 'fs';
import { st, glyphFor } from '../style';
import { readTail } from '../io/input';

export function buildActivity(TRANSCRIPT: string): string {
  let tool = '', target = '';
  try {
    if (TRANSCRIPT && fs.existsSync(TRANSCRIPT)) {
      const lines = readTail(TRANSCRIPT, 262144).split('\n').filter(Boolean).slice(-80);
      for (const line of lines) {
        let ev: any;
        try { ev = JSON.parse(line); } catch { continue; }
        if (!ev || ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) continue;
        for (const c of ev.message.content) {
          if (c && c.type === 'tool_use' && typeof c.name === 'string') {
            tool = c.name.toLowerCase();
            const inp = c.input || {};
            const p = inp.path || inp.file_path || '';
            target = p ? String(p).split(/[\\/]/).pop() : (typeof inp.command === 'string' ? inp.command.split(/\s+/)[0] : '');
          }
        }
      }
    }
  } catch { /* ignore */ }
  if (!tool) return '';
  return st('activity', `${glyphFor('activity', '↳')} ${target ? `${tool} ${target}` : tool}`);
}
