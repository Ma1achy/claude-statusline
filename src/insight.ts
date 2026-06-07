// Derived signals for the state-driven features: a sparkline of recent values,
// a linear-regression ETA, and a median. All pure, width-1 output, no deps.
import { idiv } from './util';

const SPARK = '▁▂▃▄▅▆▇█'.split('');   // 8 width-1 levels, no emoji

/** Render the last `width` values (0..100) as a block sparkline. */
export function sparkline(values: number[], width = 12): string {
  const v = values.slice(-width);
  if (!v.length) return '';
  return v.map((x) => {
    const c = Math.max(0, Math.min(100, x));
    return SPARK[Math.min(7, idiv(c * 8, 100))];
  }).join('');
}

/** Minutes until `cur` reaches `target`, from [x, y] samples by least-squares
 *  slope of y over x (x in ms). Returns -1 when there's no upward trend. */
export function etaMinutes(samples: [number, number][], target: number, cur: number): number {
  if (cur >= target) return -1;
  const pts = samples.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 3) return -1;
  const n = pts.length;
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  const mx = sx / n, my = sy / n;
  let num = 0, den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) * (x - mx); }
  if (den === 0) return -1;
  const slope = num / den;            // % per ms
  if (slope <= 0) return -1;
  const ms = (target - cur) / slope;
  if (!Number.isFinite(ms) || ms <= 0) return -1;
  const mins = Math.round(ms / 60000);
  return mins > 100000 ? -1 : mins;   // implausibly far → don't show
}

/** Median of a numeric array (0 for empty). */
export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A one-word "weather" reading of context pressure. */
export function weatherWord(pct: number, target: number): string {
  if (target > 0 && pct >= target) return 'compacting';
  if (pct >= 85) return 'stormy';
  if (pct >= 65) return 'dense';
  if (pct >= 40) return 'breezy';
  return 'clear';
}
