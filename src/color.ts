// Colour math: HSV→RGB, colormap sampling, hue rotation, rainbow hue→RGB.
import { idiv, mod } from './util';
import type { RGB } from './types';

/** HSV(0-360, 0-100, 0-100) → RGB 0-255, integer math (matches the original). */
export function hsv(h: number, s: number, v: number): RGB {
  h = mod(h, 360);
  const vmax = idiv(255 * v, 100), vmin = idiv(vmax * (100 - s), 100);
  const reg = idiv(h, 60), fr = h % 60;
  const ris = vmin + idiv((vmax - vmin) * fr, 60);
  const fal = vmax - idiv((vmax - vmin) * fr, 60);
  switch (reg) {
    case 0: return [vmax, ris, vmin];
    case 1: return [fal, vmax, vmin];
    case 2: return [vmin, vmax, ris];
    case 3: return [vmin, fal, vmax];
    case 4: return [ris, vmin, vmax];
    default: return [vmax, vmin, fal];
  }
}

/** Sample a multi-stop RGB colormap at position 0..100. */
export function cmapSample(stops: RGB[], posp: number): RGB {
  const t = Math.max(0, Math.min(100, posp)) / 100 * (stops.length - 1);
  const i = Math.floor(t), f = t - i;
  const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** Rotate an RGB colour's hue by `deg` (used for the crest on colormap themes). */
export function shiftHue([r, g, b]: RGB, deg: number): RGB {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const s = mx === 0 ? 0 : d / mx, v = mx;
  if (d !== 0) {
    h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + deg) % 360; if (h < 0) h += 360;
  }
  const c = v * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = v - c, hp = h / 60;
  let rr: number, gg: number, bb: number;
  if (hp < 1) [rr, gg, bb] = [c, x, 0]; else if (hp < 2) [rr, gg, bb] = [x, c, 0];
  else if (hp < 3) [rr, gg, bb] = [0, c, x]; else if (hp < 4) [rr, gg, bb] = [0, x, c];
  else if (hp < 5) [rr, gg, bb] = [x, 0, c]; else [rr, gg, bb] = [c, 0, x];
  return [Math.round((rr + m) * 255), Math.round((gg + m) * 255), Math.round((bb + m) * 255)];
}

/** Rainbow: hue (any int) + white-mix% → "r;g;b" (pastel toward white). */
export function hueRgb(h: number, mix: number): RGB {
  h = mod(h, 360);
  const region = idiv(h, 60), f = h % 60;
  const rise = idiv(f * 255, 60), fall = 255 - rise;
  let r: number, g: number, b: number;
  switch (region) {
    case 0: r = 255; g = rise; b = 0; break;
    case 1: r = fall; g = 255; b = 0; break;
    case 2: r = 0; g = 255; b = rise; break;
    case 3: r = 0; g = fall; b = 255; break;
    case 4: r = rise; g = 0; b = 255; break;
    default: r = 255; g = 0; b = fall; break;
  }
  return [r + idiv((255 - r) * mix, 100), g + idiv((255 - g) * mix, 100), b + idiv((255 - b) * mix, 100)];
}
