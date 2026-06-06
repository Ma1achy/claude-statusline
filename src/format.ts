// Number/time formatting helpers.
import { idiv } from './util';

/** 1234 → "1k", 2_000_000 → "2M". */
export function fmtK(n: number): string {
  if (n >= 1000000) return idiv(n, 1000000) + 'M';
  if (n >= 1000) return idiv(n, 1000) + 'k';
  return String(n);
}

/** Seconds → "Xd Yh" / "Xh Ym" / "Xm". */
export function fmtCountdown(secs: number): string {
  if (secs >= 86400) return `${idiv(secs, 86400)}d ${idiv(secs % 86400, 3600)}h`;
  if (secs >= 3600) return `${idiv(secs, 3600)}h ${idiv(secs % 3600, 60)}m`;
  return `${idiv(secs, 60)}m`;
}
