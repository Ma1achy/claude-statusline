// Per-turn token breakdown: cache-hit %, cache read, cache write, input, output.
import { txt } from '../ansi';
import { fmtK } from '../format';
import { idiv } from '../util';
import { st, glyphFor } from '../style';
import type { CurrentUsage } from '../types';

export function buildTokens(cu: CurrentUsage | null | undefined): string {
  if (cu == null) return '';
  const CU_READ = cu.cache_read_input_tokens || 0;
  const CU_WRITE = cu.cache_creation_input_tokens || 0;
  const CU_INPUT = cu.input_tokens || 0;
  const CU_OUT = cu.output_tokens || 0;
  const total = CU_INPUT + CU_WRITE + CU_READ;
  let HIT_SEG = '';
  if (total > 0 && CU_READ > 0) {
    const hit = idiv(CU_READ * 100, total);
    HIT_SEG = st('tokens.hit', `${glyphFor('tokens.hit', '✦')}${hit}%`, { weight: hit >= 70 ? 'bold' : hit >= 40 ? 'normal' : 'dim' });
  }
  const readSeg = CU_READ > 0 ? ` ${st('tokens.read', `${glyphFor('tokens.read', '✦')}${fmtK(CU_READ)}`)}` : '';
  const writeSeg = CU_WRITE > 0 ? ` ${st('tokens.write', `${glyphFor('tokens.write', '+')}${fmtK(CU_WRITE)}w`)}` : '';
  const inSeg = CU_INPUT > 0 ? ` ${st('tokens.in', `${txt(glyphFor('tokens.in', '↓'))}${fmtK(CU_INPUT)}`)}` : '';
  const outSeg = CU_OUT > 0 ? ` ${st('tokens.out', `${txt(glyphFor('tokens.out', '↑'))}${fmtK(CU_OUT)}`)}` : '';
  return HIT_SEG + readSeg + writeSeg + inSeg + outSeg;
}
