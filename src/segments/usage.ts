// Usage-limit gauges (the 5h / 7d bars on line 2). SL_LIMITS tints amber past the
// warn threshold and bold-red + "LOW" past crit; each bar shows a reset countdown.
import { drawBar, scaleCells } from '../bar';
import { fmtCountdown } from '../format';
import { cfg } from '../config';
import { st } from '../style';
import type { RateLimit } from '../types';

export function buildUsage(rl: { five_hour?: RateLimit; seven_day?: RateLimit }): string {
  const NOW = cfg.baseFrame;
  const rlSeg = (label: string, pctIn: number | undefined, resetsAt: number | string | undefined, phase: number): string => {
    let pct = Math.floor(pctIn || 0); if (pct > 100) pct = 100;
    const bar = drawBar(10, scaleCells(pct, 10), -1, phase);
    let pctStr: string, warn = '';
    // limit warnings (SL_LIMITS): warn role past warn, bold bad + LOW past crit; else gradient.
    if (cfg.limits && pct >= cfg.limitCrit) { pctStr = st('usage.pct', `${pct}%`, { role: 'bad', weight: 'bold' }); warn = ` ${st('usage.warn', 'LOW')}`; }
    else if (cfg.limits && pct >= cfg.limitWarn) { pctStr = st('usage.pct', `${pct}%`, { role: 'warn' }); }
    else pctStr = st('usage.pct', `${pct}%`, { pct });
    let secsLeft = 0;
    const ra = typeof resetsAt === 'number' ? resetsAt : parseInt(String(resetsAt), 10);
    if (Number.isFinite(ra) && ra > 0) secsLeft = ra - NOW;
    const cd = st('usage.countdown', secsLeft <= 0 ? 'now' : fmtCountdown(secsLeft));
    return `${st('usage.label', label)} ${bar} ${pctStr}${warn} ${cd}`;
  };
  const fh = rl.five_hour || {}, sd = rl.seven_day || {};
  return `${rlSeg('5h', fh.used_percentage, fh.resets_at, 1500)}   ${rlSeg('7d', sd.used_percentage, sd.resets_at, 3000)}`;
}
