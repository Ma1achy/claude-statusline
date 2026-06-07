// The line-1 lead: the /fast toggle (gold ⚡ = fast, dim ▫ = slow) and the vim
// input mode when enabled. Claude Code does NOT expose the permission/auto-accept
// mode to statuslines, so this slot shows what IS available.
import { txt } from '../ansi';
import { st } from '../style';
import type { StatuslineInput, Role } from '../types';

export function buildLead(data: StatuslineInput): string {
  const FAST = data.fast_mode ? st('lead.fast', txt('⚡')) : st('lead.fast', txt('▫'), { role: 'muted' });
  let VIM = '';
  const vmode = (data.vim && data.vim.mode) || '';
  if (vmode) {
    const u = vmode.toUpperCase();
    const role: Role = u.startsWith('INS') ? 'ok' : u.startsWith('VIS') ? 'warn' : 'accent';
    VIM = ` ${st('lead.vim', u[0] || '?', { role })}`;
  }
  return `${FAST}${VIM}`;
}
