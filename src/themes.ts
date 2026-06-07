// Theme resolution. Palettes live as pure data in themes.data.ts; here we turn
// the active one into a runtime Theme, building accent escapes through the
// colour-mode-aware tc() (so every theme degrades for free). The active theme
// recolours the WHOLE statusline. `heat` reproduces the original byte-for-byte.
import * as fs from 'fs';
import * as os from 'os';
import { tc, DIM } from './ansi';
import { hsv, cmapSample } from './color';
import { cfg } from './config';
import { idiv } from './util';
import { THEMES_DATA, A11Y_PAL, A11Y_GAUGES } from './themes.data';
import type { Theme, Palette, PaletteRGB, ThemeData, RGB, Role } from './types';

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
  return {
    hueHi: d.hueHi, hueLo: d.hueLo, sat: d.sat, valLo: d.valLo, valHi: d.valHi, cmap: d.cmap, mix: d.mix, pal,
    elements: d.elements, glyphs: d.glyphs, labels: d.labels,
  };
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
  // theme-v2 pass-through (per-element styles / glyphs / labels) for inline themes.
  if (j.elements && typeof j.elements === 'object') d.elements = j.elements;
  if (j.glyphs && typeof j.glyphs === 'object') d.glyphs = j.glyphs;
  if (j.labels && typeof j.labels === 'object') d.labels = j.labels;
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
  // 1) inline customTheme in the JSON config, 2) an external theme file, 3) base16.
  try { if (cfg.customTheme) { const d = coerceThemeData(cfg.customTheme); if (d) return buildTheme(d); } } catch { /* ignore */ }
  try {
    const p = cfg.themeFile || `${os.homedir()}/.claude/statusline-theme.json`;
    if (fs.existsSync(p)) { const d = coerceThemeData(JSON.parse(fs.readFileSync(p, 'utf8'))); if (d) return buildTheme(d); }
  } catch { /* ignore */ }
  try { if (cfg.base16) { const d = themeFromBase16(cfg.base16); if (d) return buildTheme(d); } } catch { /* ignore */ }
  return null;
}

// SL_ACCESSIBLE forces the high-contrast palette over everything (incl. custom);
// accessibility should win regardless of the chosen theme. (Motion is also off.)
// SL_ACCESSIBLE_GAUGE swaps the bar ramp; the accent palette is the same either way.
const a11yTheme = (): Theme =>
  buildTheme({ cmap: A11Y_GAUGES[cfg.accessibleGauge] || A11Y_GAUGES.cvd, mix: 0, palRgb: A11Y_PAL });

// Active theme + everything derived from it. Rebuilt from cfg by rebuildTheme()
// (below): once at module load, and again at render time when branch auto-theming
// changes cfg.themeName (build.ts). Consumers read these at call time, so esbuild's
// live bindings deliver the rebuilt values.
export let TH: Theme;
export let PAL: Palette;
export let WHITE: string;
export let ROLES: Record<Role, string>;
export let RAINBOW_MIX: number;

// ── semantic roles ────────────────────────────────────────────────────────────
// The styling engine (style.ts) targets these instead of literal colour names, so
// themes + the accessibility profile recolour every element consistently. `muted`
// is the theme-derived replacement for the old literal DIM: the foreground pulled
// toward the background (still visible via a floor), so "dim" bits finally follow
// the theme. In mono there's no colour to dim → fall back to the SGR dim attribute.
function fgRgb(): RGB {
  if (cfg.accessible) return A11Y_PAL.WHITE;
  // Mirror TH's fallback: an unknown / failed-custom theme resolves to heat, so its
  // muted must too (else a malformed custom theme wouldn't be byte-identical to heat).
  const d = THEMES_DATA[cfg.themeName] || THEMES_DATA.heat;
  if (d.palRgb) return d.palRgb.WHITE;
  if (d.palRaw) return [229, 229, 229];
  if (d.cmap) return [228, 228, 228];
  return [220, 222, 230];
}
function deriveMuted(): string {
  if (cfg.colorMode === 'mono') return DIM;
  // Accessibility never dims into low contrast: muted stays a bright, AAA-clearing
  // secondary (light blue-grey) instead of a pulled-down foreground.
  if (cfg.accessible) return tc(150, 170, 210);
  const m = fgRgb().map((v) => Math.max(72, Math.round(v * 0.5))) as RGB;
  return tc(m[0], m[1], m[2]);
}
// A theme may pin explicit role colours (themes.data `roles`); they win over the
// palette-derived ones (but not in mono, which has no colour, or accessible).
function roleOverrides(): Partial<Record<Role, string>> {
  if (cfg.accessible || cfg.colorMode === 'mono') return {};
  const d = THEMES_DATA[cfg.themeName];
  if (!d || !d.roles) return {};
  const o: Partial<Record<Role, string>> = {};
  for (const k of Object.keys(d.roles) as Role[]) { const c = d.roles[k]; if (c) o[k] = tc(c[0], c[1], c[2]); }
  return o;
}
// Rebuild the active theme and its derived palette/roles/rainbow-mix from cfg.
// Idempotent — called once at load, and again when branch auto-theming changes
// cfg.themeName at render time (build.ts).
export function rebuildTheme(): void {
  const CUSTOM = cfg.themeName === 'custom' ? loadCustom() : null;
  TH = cfg.accessible ? a11yTheme() : (CUSTOM || THEMES[cfg.themeName] || THEMES.heat);
  PAL = cfg.colorMode === 'mono' ? EMPTY_PAL : (TH.pal || deriveCmapPal(TH.cmap as RGB[]));
  WHITE = PAL.WHITE;
  // Explicit SL_RAINBOW_MIX wins; else the theme's mix; else 50.
  RAINBOW_MIX = cfg.rainbowMixRaw != null ? cfg.rainbowMixRaw : (TH.mix != null ? TH.mix : 50);
  ROLES = {
    fg: PAL.WHITE, muted: deriveMuted(), accent: PAL.CYAN, ok: PAL.GREEN,
    warn: PAL.AMBER, bad: PAL.RED, info: PAL.BLUE, gold: PAL.GOLD, ...roleOverrides(),
  };
  TH.roles = ROLES;
}
rebuildTheme();

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
