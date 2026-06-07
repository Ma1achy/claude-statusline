// Conversation line (conversationLine): the last turn's token split and the running
// total for the session — finer-grained than session cost, handy for spotting an
// expensive single turn.
import { txt } from '../ansi';
import { fmtK } from '../format';
import { st } from '../style';
import type { CurrentUsage } from '../types';

export function buildConversation(cu: CurrentUsage | null | undefined): string {
  if (cu == null) return '';
  const inT = cu.input_tokens || 0, outT = cu.output_tokens || 0;
  const total = (cu.cache_read_input_tokens || 0) + (cu.cache_creation_input_tokens || 0) + inT + outT;
  if (total === 0) return '';
  return st('conversation', `last turn  ${txt('↓')}${fmtK(inT)} ${txt('↑')}${fmtK(outT)}  ·  ${fmtK(total)} tok`);
}
