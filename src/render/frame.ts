// Optional framing applied after assembly (config `frame`): a faint rule between
// lines, or a box-drawing border around the whole statusline. Width-aware via
// printLen so ANSI escapes don't throw the borders off.
import { R, printLen } from '../ansi';
import { ROLES } from '../themes';

export function applyFrame(lines: string[], mode: string): string[] {
  if (!lines.length) return lines;
  const m = ROLES.muted;
  const w = Math.max(...lines.map(printLen));
  if (mode === 'rule') {
    // a thin muted divider between each pair of lines.
    const rule = `${m}${'─'.repeat(w)}${R}`;
    const out: string[] = [];
    lines.forEach((l, i) => { out.push(l); if (i < lines.length - 1) out.push(rule); });
    return out;
  }
  if (mode === 'box') {
    const pad = (l: string): string => `${m}│${R}${l}${' '.repeat(Math.max(0, w - printLen(l)))}${m}│${R}`;
    return [`${m}┌${'─'.repeat(w)}┐${R}`, ...lines.map(pad), `${m}└${'─'.repeat(w)}┘${R}`];
  }
  return lines;
}
