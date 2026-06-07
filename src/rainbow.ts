// Animated per-letter rainbow (account name, and optionally cost/age).
import { R, tc } from './ansi';
import { hueRgb } from './color';
import { cfg } from './config';
import { RAINBOW_MIX } from './themes';
import { idiv } from './util';

export function rainbow(text: string): string {
  const disco = cfg.shimmer === 'disco';
  const step = disco ? 55 : 38;            // hue spread per letter
  const mix = disco ? 0 : RAINBOW_MIX;     // disco = vivid, not pastel
  const flow = disco ? 6 : 18;             // colour-flow speed
  const frame = cfg.shimmer === 'off' ? 0 : cfg.nowMs;
  const chars = Array.from(text);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const [r, g, b] = hueRgb(i * step + idiv(frame, flow), mix);
    out += `${tc(r, g, b)}${chars[i]}`;
  }
  return out + R;
}
