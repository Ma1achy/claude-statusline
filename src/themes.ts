// Theme resolution. Palettes live as pure data in themes.data.ts; here we turn
// the active one into a runtime Theme, building accent escapes through the
// colour-mode-aware tc() (so every theme degrades for free). The active theme
// recolours the WHOLE statusline. `heat` reproduces the original byte-for-byte.
import * as fs from 'fs';
import * as os from 'os';
import { tc } from './ansi';
import { hsv, cmapSample } from './color';
import { cfg } from './config';
import { idiv } from './util';
import { THEMES_DATA } from './themes.data';
import type { Theme, Palette, PaletteRGB, ThemeData, RGB } from './types';

const EMPTY_PAL: Palette = { RED: '', GREEN: '', AMBER: '', BLUE: '', CYAN: '', WHITE: '', GOLD: '' };
const palFromRgb = (p: PaletteRGB): Palette => ({
  RED: tc(...p.RED), GREEN: tc(...p.GREEN), AMBER: tc(...p.AMBER), BLUE: tc(...p.BLUE),
  CYAN: tc(...p.CYAN), WHITE: tc(...p.WHITE), GOLD: tc(...p.GOLD),
});

/** Cohesive accents sampled from a colormap, with a brightness floor for readability. */
function deriveCmapPal(cmap: RGB[]): Palette {
  const f = (p: number, floor = 125): string => {
    let c = cmapSample(cmap, p);
    const mx = Math.max(c[0], c[1], c[2]);
    if (mx < floor) { const k = floor / (mx || 1); c = c.map((v) => Math.min(255, Math.round(v * k))) as RGB; }
    return tc(c[0], c[1], c[2]);
  };
  return { RED: f(93), AMBER: f(72), GREEN: f(48), BLUE: f(22), CYAN: f(40), GOLD: f(85), WHITE: tc(228, 228, 228) };
}

/** Build a runtime Theme (with mode-appropriate accent escapes) from pure data. */
function buildTheme(d: ThemeData): Theme {
  let pal: Palette | undefined;
  if (cfg.colorMode === 'mono') pal = EMPTY_PAL;
  else if (cfg.colorMode === 'truecolor' && d.palRaw) pal = d.palRaw;   // byte-exact carve-out (heat)
  else if (d.palRgb) pal = palFromRgb(d.palRgb);
  else if (d.palRaw) pal = d.palRaw;
  // else: cmap theme with no explicit palette → leave undefined, derived below.
  return { hueHi: d.hueHi, hueLo: d.hueLo, sat: d.sat, valLo: d.valLo, valHi: d.valHi, cmap: d.cmap, mix: d.mix, pal };
}

export const THEMES: Record<string, Theme> = {};
for (const k of Object.keys(THEMES_DATA)) THEMES[k] = buildTheme(THEMES_DATA[k]);

// ── custom theme (SL_THEME=custom): a JSON file, else SL_BASE16 ───────────────
const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
const isRgb = (x: unknown): x is RGB => Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === 'number');
const hexToRgb = (h: string): RGB | null => {
  const m = h.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};

/** Validate arbitrary JSON into a ThemeData (or null). Never throws. */
function coerceThemeData(j: any): ThemeData | null {
  if (!j || typeof j !== 'object') return null;
  const d: ThemeData = { mix: typeof j.mix === 'number' ? j.mix : null };
  if (Array.isArray(j.cmap)) { const c = j.cmap.filter(isRgb).map((s: RGB) => s.map(clamp) as RGB); if (c.length >= 2) d.cmap = c; }
  for (const k of ['hueHi', 'hueLo', 'sat', 'valLo', 'valHi'] as const) if (typeof j[k] === 'number') (d as any)[k] = j[k];
  if (j.palette && typeof j.palette === 'object') {
    const keys = ['RED', 'GREEN', 'AMBER', 'BLUE', 'CYAN', 'WHITE', 'GOLD'] as const;
    if (keys.every((k) => isRgb(j.palette[k]))) {
      d.palRgb = keys.reduce((o, k) => { o[k] = (j.palette[k] as RGB).map(clamp) as RGB; return o; }, {} as PaletteRGB);
    }
  }
  // need at least a ramp, a cmap, or a palette to be usable.
  if (!d.cmap && d.hueHi === undefined && !d.palRgb) return null;
  // a palette-only theme still needs a bar gradient → synthesize green→amber→red.
  if (!d.cmap && d.hueHi === undefined && d.palRgb) d.cmap = [d.palRgb.GREEN, d.palRgb.AMBER, d.palRgb.RED];
  return d;
}

/** base16/base24 hex list → ThemeData. Maps the standard slots onto our accents. */
function themeFromBase16(spec: string): ThemeData | null {
  const cols = spec.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(hexToRgb);
  if (cols.length < 16 || cols.some((c) => c === null)) return null;
  const c = cols as RGB[];
  // base16 slots: 05 fg, 08 red, 09 orange, 0A yellow, 0B green, 0C cyan, 0D blue, 0E magenta.
  const palRgb: PaletteRGB = { RED: c[8], GREEN: c[11], AMBER: c[10], BLUE: c[13], CYAN: c[12], WHITE: c[5], GOLD: c[9] };
  return { cmap: [c[11], c[10], c[9], c[8]], mix: 30, palRgb };   // green→yellow→orange→red bar
}

function loadCustom(): Theme | null {
  try {
    const p = cfg.themeFile || `${os.homedir()}/.claude/statusline-theme.json`;
    if (fs.existsSync(p)) { const d = coerceThemeData(JSON.parse(fs.readFileSync(p, 'utf8'))); if (d) return buildTheme(d); }
  } catch { /* ignore */ }
  try { if (cfg.base16) { const d = themeFromBase16(cfg.base16); if (d) return buildTheme(d); } } catch { /* ignore */ }
  return null;
}

const CUSTOM = cfg.themeName === 'custom' ? loadCustom() : null;
// SL_ACCESSIBLE forces the high-contrast theme over everything (incl. custom);
// accessibility should win regardless of the chosen theme. (Motion is also off.)
export const TH: Theme = cfg.accessible
  ? THEMES['high-contrast']
  : (CUSTOM || THEMES[cfg.themeName] || THEMES.heat);
export const PAL: Palette = cfg.colorMode === 'mono'
  ? EMPTY_PAL
  : (TH.pal || deriveCmapPal(TH.cmap as RGB[]));
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
