// Theme registry + resolution. A theme is a hue-ramp (hueHi→hueLo + sat + value
// ramp) or a `cmap` (multi-stop RGB, e.g. matplotlib). Each carries an accent
// `pal`; cmap themes without one get a palette auto-derived from the colormap.
// The active theme recolours the WHOLE statusline. `heat` reproduces the original.
import { tc } from './ansi';
import { hsv, cmapSample } from './color';
import { cfg } from './config';
import { idiv } from './util';
import type { Theme, Palette, RGB } from './types';

export const THEMES: Record<string, Theme> = {
  // hue-ramp themes
  heat:      { hueHi: 120, hueLo: 0, sat: 88, valLo: 84, valHi: 84, mix: null, pal: { RED: '\x1b[31m', GREEN: '\x1b[32m', AMBER: '\x1b[33m', BLUE: '\x1b[34m', CYAN: '\x1b[36m', WHITE: '\x1b[37m', GOLD: '\x1b[38;5;220m' } },
  synthwave: { hueHi: 300, hueLo: 180, sat: 92, valLo: 75, valHi: 92, mix: 30, pal: { RED: tc(255, 55, 135), GREEN: tc(0, 255, 170), AMBER: tc(255, 170, 70), BLUE: tc(150, 90, 255), CYAN: tc(0, 229, 255), WHITE: tc(235, 225, 255), GOLD: tc(255, 95, 205) } },
  matrix:    { hueHi: 128, hueLo: 100, sat: 95, valLo: 45, valHi: 92, mix: null, pal: { RED: tc(0, 150, 45), GREEN: tc(0, 255, 65), AMBER: tc(120, 235, 40), BLUE: tc(0, 200, 95), CYAN: tc(0, 225, 120), WHITE: tc(170, 255, 170), GOLD: tc(120, 255, 90) } },
  mono:      { hueHi: 0, hueLo: 0, sat: 0, valLo: 38, valHi: 95, mix: null, pal: { RED: tc(120, 120, 120), GREEN: tc(190, 190, 190), AMBER: tc(155, 155, 155), BLUE: tc(165, 165, 165), CYAN: tc(205, 205, 205), WHITE: tc(228, 228, 228), GOLD: tc(238, 238, 238) } },
  pastel:    { hueHi: 120, hueLo: 0, sat: 52, valLo: 88, valHi: 88, mix: 70, pal: { RED: tc(255, 150, 150), GREEN: tc(150, 230, 160), AMBER: tc(240, 210, 140), BLUE: tc(165, 185, 240), CYAN: tc(150, 215, 230), WHITE: tc(238, 238, 238), GOLD: tc(240, 220, 160) } },
  // matplotlib colormaps (palette auto-derived)
  viridis: { cmap: [[68, 1, 84], [70, 50, 126], [54, 92, 141], [39, 127, 142], [31, 161, 135], [74, 193, 109], [160, 218, 57], [253, 231, 37]], mix: 25 },
  inferno: { cmap: [[0, 0, 4], [40, 11, 83], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 194, 40], [252, 255, 164]], mix: 20 },
  magma:   { cmap: [[0, 0, 4], [34, 17, 80], [95, 24, 127], [152, 45, 128], [211, 67, 110], [248, 118, 92], [254, 187, 129], [252, 253, 191]], mix: 22 },
  plasma:  { cmap: [[13, 8, 135], [83, 2, 163], [139, 10, 165], [184, 50, 137], [219, 92, 104], [244, 136, 73], [254, 189, 42], [240, 249, 33]], mix: 22 },
  cividis: { cmap: [[0, 34, 78], [33, 59, 110], [76, 85, 108], [108, 110, 114], [142, 137, 120], [177, 165, 112], [217, 197, 92], [254, 232, 56]], mix: 25 },
  // designer palettes
  dracula:    { cmap: [[80, 250, 123], [139, 233, 253], [189, 147, 249], [255, 121, 198]], mix: 35, pal: { RED: tc(255, 85, 85), AMBER: tc(255, 184, 108), GREEN: tc(80, 250, 123), BLUE: tc(189, 147, 249), CYAN: tc(139, 233, 253), GOLD: tc(241, 250, 140), WHITE: tc(248, 248, 242) } },
  nord:       { cmap: [[94, 129, 172], [129, 161, 193], [136, 192, 208], [143, 188, 187]], mix: 40, pal: { RED: tc(191, 97, 106), AMBER: tc(235, 203, 139), GREEN: tc(163, 190, 140), BLUE: tc(129, 161, 193), CYAN: tc(136, 192, 208), GOLD: tc(235, 203, 139), WHITE: tc(236, 239, 244) } },
  gruvbox:    { cmap: [[131, 165, 152], [184, 187, 38], [250, 189, 47], [254, 128, 25]], mix: 25, pal: { RED: tc(251, 73, 52), AMBER: tc(250, 189, 47), GREEN: tc(184, 187, 38), BLUE: tc(131, 165, 152), CYAN: tc(142, 192, 124), GOLD: tc(250, 189, 47), WHITE: tc(235, 219, 178) } },
  tokyonight: { cmap: [[122, 162, 247], [125, 207, 255], [187, 154, 247], [247, 118, 142]], mix: 30, pal: { RED: tc(247, 118, 142), AMBER: tc(224, 175, 104), GREEN: tc(158, 206, 106), BLUE: tc(122, 162, 247), CYAN: tc(125, 207, 255), GOLD: tc(224, 175, 104), WHITE: tc(192, 202, 245) } },
  rosepine:   { cmap: [[49, 116, 143], [156, 207, 216], [196, 167, 231], [235, 188, 186]], mix: 45, pal: { RED: tc(235, 111, 146), AMBER: tc(246, 193, 119), GREEN: tc(156, 207, 216), BLUE: tc(49, 116, 143), CYAN: tc(156, 207, 216), GOLD: tc(246, 193, 119), WHITE: tc(224, 222, 244) } },
};

/** Cohesive accents sampled from a colormap, with a brightness floor for readability. */
function deriveCmapPal(cmap: import('./types').RGB[]): Palette {
  const f = (p: number, floor = 125): string => {
    let c = cmapSample(cmap, p);
    const mx = Math.max(c[0], c[1], c[2]);
    if (mx < floor) { const k = floor / (mx || 1); c = c.map((v) => Math.min(255, Math.round(v * k))) as import('./types').RGB; }
    return tc(c[0], c[1], c[2]);
  };
  return { RED: f(93), AMBER: f(72), GREEN: f(48), BLUE: f(22), CYAN: f(40), GOLD: f(85), WHITE: tc(228, 228, 228) };
}

export const TH: Theme = THEMES[cfg.themeName] || THEMES.heat;
export const PAL: Palette = TH.pal || deriveCmapPal(TH.cmap as import('./types').RGB[]);
export const { RED, GREEN, AMBER, BLUE, CYAN, WHITE, GOLD } = PAL;

// Explicit SL_RAINBOW_MIX wins; else the theme's mix; else 50.
export const RAINBOW_MIX = cfg.rainbowMixRaw != null ? cfg.rainbowMixRaw : (TH.mix != null ? TH.mix : 50);

// Colour at fill position 0..100 along the active theme's gradient — same colour
// the bar shows there. Used to tint percentage text so it lerps smoothly with the
// value instead of jumping at thresholds. Floored to stay readable on dark bg.
export function gradientColor(posp: number): string {
  posp = Math.max(0, Math.min(100, posp));
  let c: RGB;
  if (TH.cmap) {
    c = cmapSample(TH.cmap, posp);
  } else {
    const bh = (TH.hueHi as number) - idiv(posp * ((TH.hueHi as number) - (TH.hueLo as number)), 100);
    const vv = (TH.valLo as number) + idiv(((TH.valHi as number) - (TH.valLo as number)) * posp, 100);
    c = hsv(bh, TH.sat as number, vv);
  }
  const mx = Math.max(c[0], c[1], c[2]);
  if (mx < 150) { const k = 150 / (mx || 1); c = [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k))]; }
  return tc(c[0], c[1], c[2]);
}
