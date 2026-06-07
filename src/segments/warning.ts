// Warning line (warningLine): a conditional extra line that only appears once
// something crosses a threshold — context near autocompact, a costly session, or a
// usage limit at the critical mark. The absence of the line is itself information.
import { st, glyphFor } from '../style';
import type { RateLimit } from '../types';

export function buildWarning(
  PCT: number, COST: number, rl: { five_hour?: RateLimit; seven_day?: RateLimit } | null | undefined, limitCrit: number,
): string {
  const parts: string[] = [];
  if (PCT >= 80) parts.push(`context ${PCT}%`);
  if (COST > 1) parts.push(`cost $${COST.toFixed(2)}`);
  const fh = Math.floor((rl && rl.five_hour && rl.five_hour.used_percentage) || 0);
  const sd = Math.floor((rl && rl.seven_day && rl.seven_day.used_percentage) || 0);
  if (fh >= limitCrit) parts.push(`5h limit ${fh}%`);
  if (sd >= limitCrit) parts.push(`7d limit ${sd}%`);
  if (!parts.length) return '';
  return st('warning', `${glyphFor('warning', '⚠')} ${parts.join('  ·  ')}`);
}
