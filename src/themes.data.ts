// Theme palettes as PURE DATA — no escape strings, no logic. Add a theme by
// adding an entry here; themes.ts turns this into runtime Theme objects (building
// the accent escapes through the colour-mode-aware tc(), so every theme degrades
// for free). A theme is either a hue-ramp (hueHi/hueLo/sat/valLo/valHi) or a
// `cmap` (multi-stop RGB). `palRgb` is the accent palette; cmap themes may omit
// it and get one auto-derived. `heat` additionally carries `palRaw` (literal SGR)
// so its original truecolor output stays byte-for-byte identical.
import type { ThemeData, PaletteRGB, RGB } from './types';

// ── accessibility (SL_ACCESSIBLE) ──────────────────────────────────────────────
// A high-contrast palette + gauge ramps that follow WCAG/colour-blind guidance on
// a dark terminal background (the statusline's target). Every accent here clears
// the WCAG AAA 7:1 contrast ratio against a near-black bg (so the coloured numbers
// they tint stay legible); pure red/blue are lightened to reach it. Text is pure
// white (≈17:1). Meaning is never carried by colour alone — bars encode value by
// length, +/- carry signs, "LOW" is a word — so colour is always redundant.
export const A11Y_PAL: PaletteRGB = {
  WHITE: [255, 255, 255],   // primary text, ~17:1
  GREEN: [0, 255, 0],       // ~12.7:1
  CYAN: [0, 255, 255],      // ~14:1
  AMBER: [255, 255, 0],     // ~16:1 (pure yellow)
  GOLD: [255, 225, 60],     // bright gold
  BLUE: [120, 190, 255],    // lightened — pure blue is only ~2:1 on black
  RED: [255, 120, 120],     // lightened — pure red is only ~4.7:1; this clears 7:1
};
// Gauge ramps (low→high) selected by SL_ACCESSIBLE_GAUGE; default is `cvd`.
export const A11Y_GAUGES: Record<string, RGB[]> = {
  // CVD-safe: the blue→yellow axis survives protan/deutan/tritan colour-blindness;
  // luminance also rises low→high so it reads in greyscale.
  cvd: [[100, 170, 255], [0, 230, 255], [255, 255, 0]],
  // Familiar traffic-light, pushed to max luminance (red lightened to clear AAA).
  traffic: [[0, 255, 0], [255, 255, 0], [255, 120, 120]],
  // Pure luminance — unambiguous for every CVD type and on monochrome displays.
  grayscale: [[160, 160, 160], [205, 205, 205], [255, 255, 255]],
};

export const THEMES_DATA: Record<string, ThemeData> = {
  // hue-ramp themes
  heat: {
    hueHi: 120, hueLo: 0, sat: 88, valLo: 84, valHi: 84, mix: null,
    palRaw: { RED: '\x1b[31m', GREEN: '\x1b[32m', AMBER: '\x1b[33m', BLUE: '\x1b[34m', CYAN: '\x1b[36m', WHITE: '\x1b[37m', GOLD: '\x1b[38;5;220m' },
    // RGB approximations of the literals above, used only when degrading (256/16).
    palRgb: { RED: [205, 0, 0], GREEN: [0, 205, 0], AMBER: [205, 205, 0], BLUE: [0, 0, 238], CYAN: [0, 205, 205], WHITE: [229, 229, 229], GOLD: [255, 215, 0] },
  },
  synthwave: { hueHi: 300, hueLo: 180, sat: 92, valLo: 75, valHi: 92, mix: 30, palRgb: { RED: [255, 55, 135], GREEN: [0, 255, 170], AMBER: [255, 170, 70], BLUE: [150, 90, 255], CYAN: [0, 229, 255], WHITE: [235, 225, 255], GOLD: [255, 95, 205] } },
  matrix: { hueHi: 128, hueLo: 100, sat: 95, valLo: 45, valHi: 92, mix: null, palRgb: { RED: [0, 150, 45], GREEN: [0, 255, 65], AMBER: [120, 235, 40], BLUE: [0, 200, 95], CYAN: [0, 225, 120], WHITE: [170, 255, 170], GOLD: [120, 255, 90] } },
  mono: { hueHi: 0, hueLo: 0, sat: 0, valLo: 38, valHi: 95, mix: null, palRgb: { RED: [120, 120, 120], GREEN: [190, 190, 190], AMBER: [155, 155, 155], BLUE: [165, 165, 165], CYAN: [205, 205, 205], WHITE: [228, 228, 228], GOLD: [238, 238, 238] } },
  pastel: { hueHi: 120, hueLo: 0, sat: 52, valLo: 88, valHi: 88, mix: 70, palRgb: { RED: [255, 150, 150], GREEN: [150, 230, 160], AMBER: [240, 210, 140], BLUE: [165, 185, 240], CYAN: [150, 215, 230], WHITE: [238, 238, 238], GOLD: [240, 220, 160] } },
  // matplotlib colormaps (palette auto-derived)
  viridis: { cmap: [[68, 1, 84], [70, 50, 126], [54, 92, 141], [39, 127, 142], [31, 161, 135], [74, 193, 109], [160, 218, 57], [253, 231, 37]], mix: 25 },
  inferno: { cmap: [[0, 0, 4], [40, 11, 83], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 194, 40], [252, 255, 164]], mix: 20 },
  magma: { cmap: [[0, 0, 4], [34, 17, 80], [95, 24, 127], [152, 45, 128], [211, 67, 110], [248, 118, 92], [254, 187, 129], [252, 253, 191]], mix: 22 },
  plasma: { cmap: [[13, 8, 135], [83, 2, 163], [139, 10, 165], [184, 50, 137], [219, 92, 104], [244, 136, 73], [254, 189, 42], [240, 249, 33]], mix: 22 },
  cividis: { cmap: [[0, 34, 78], [33, 59, 110], [76, 85, 108], [108, 110, 114], [142, 137, 120], [177, 165, 112], [217, 197, 92], [254, 232, 56]], mix: 25 },
  // cyclic (ends match → a looping crest wraps seamlessly)
  twilight: { cmap: [[226, 217, 226], [152, 131, 197], [80, 66, 140], [55, 45, 85], [110, 55, 95], [200, 150, 170], [226, 217, 226]], mix: 25 },
  twilight_shifted: { cmap: [[55, 45, 85], [100, 80, 160], [200, 180, 215], [215, 150, 170], [120, 60, 95], [55, 45, 85]], mix: 25 },
  // monotonic-brightness / perceptually-uniform extras
  cubehelix: { cmap: [[0, 0, 0], [22, 30, 55], [30, 75, 75], [110, 108, 55], [200, 140, 150], [212, 200, 226], [255, 255, 255]], mix: 22 },
  batlow: { cmap: [[1, 25, 89], [24, 80, 104], [71, 109, 76], [140, 123, 52], [213, 140, 88], [250, 179, 150], [250, 206, 229]], mix: 22 },
  turbo: { cmap: [[48, 18, 59], [60, 130, 250], [30, 230, 180], [160, 250, 60], [230, 220, 50], [250, 140, 40], [210, 40, 20], [122, 4, 3]], mix: 18 },
  // diverging (blue=low → red=high reads as cool→hot for a usage bar)
  coolwarm: { cmap: [[59, 76, 192], [120, 150, 230], [205, 205, 205], [230, 150, 130], [180, 4, 38]], mix: 20 },
  rdbu: { cmap: [[103, 0, 31], [210, 100, 80], [240, 240, 240], [70, 120, 180], [5, 48, 97]], mix: 20 },
  // oceanographic (cmocean)
  ice: { cmap: [[3, 5, 26], [20, 40, 90], [40, 90, 150], [90, 150, 200], [170, 210, 230], [232, 250, 250]], mix: 22 },
  deep: { cmap: [[40, 30, 90], [50, 80, 130], [60, 140, 150], [130, 200, 160], [220, 245, 200]], mix: 22 },
  // designer palettes
  dracula: { cmap: [[80, 250, 123], [139, 233, 253], [189, 147, 249], [255, 121, 198]], mix: 35, palRgb: { RED: [255, 85, 85], AMBER: [255, 184, 108], GREEN: [80, 250, 123], BLUE: [189, 147, 249], CYAN: [139, 233, 253], GOLD: [241, 250, 140], WHITE: [248, 248, 242] } },
  nord: { cmap: [[94, 129, 172], [129, 161, 193], [136, 192, 208], [143, 188, 187]], mix: 40, palRgb: { RED: [191, 97, 106], AMBER: [235, 203, 139], GREEN: [163, 190, 140], BLUE: [129, 161, 193], CYAN: [136, 192, 208], GOLD: [235, 203, 139], WHITE: [236, 239, 244] } },
  gruvbox: { cmap: [[131, 165, 152], [184, 187, 38], [250, 189, 47], [254, 128, 25]], mix: 25, palRgb: { RED: [251, 73, 52], AMBER: [250, 189, 47], GREEN: [184, 187, 38], BLUE: [131, 165, 152], CYAN: [142, 192, 124], GOLD: [250, 189, 47], WHITE: [235, 219, 178] } },
  tokyonight: { cmap: [[122, 162, 247], [125, 207, 255], [187, 154, 247], [247, 118, 142]], mix: 30, palRgb: { RED: [247, 118, 142], AMBER: [224, 175, 104], GREEN: [158, 206, 106], BLUE: [122, 162, 247], CYAN: [125, 207, 255], GOLD: [224, 175, 104], WHITE: [192, 202, 245] } },
  rosepine: { cmap: [[49, 116, 143], [156, 207, 216], [196, 167, 231], [235, 188, 186]], mix: 45, palRgb: { RED: [235, 111, 146], AMBER: [246, 193, 119], GREEN: [156, 207, 216], BLUE: [49, 116, 143], CYAN: [156, 207, 216], GOLD: [246, 193, 119], WHITE: [224, 222, 244] } },

  // ── Catppuccin family ───────────────────────────────────────────────────────
  'catppuccin-mocha': { cmap: [[137, 180, 250], [148, 226, 213], [166, 227, 161], [249, 226, 175], [250, 179, 135], [243, 139, 168]], mix: 35, palRgb: { RED: [243, 139, 168], GREEN: [166, 227, 161], AMBER: [249, 226, 175], BLUE: [137, 180, 250], CYAN: [148, 226, 213], WHITE: [205, 214, 244], GOLD: [249, 226, 175] } },
  'catppuccin-macchiato': { cmap: [[138, 173, 244], [139, 213, 202], [166, 218, 149], [238, 212, 159], [245, 169, 127], [237, 135, 150]], mix: 35, palRgb: { RED: [237, 135, 150], GREEN: [166, 218, 149], AMBER: [238, 212, 159], BLUE: [138, 173, 244], CYAN: [139, 213, 202], WHITE: [202, 211, 245], GOLD: [238, 212, 159] } },
  'catppuccin-frappe': { cmap: [[140, 170, 238], [129, 200, 190], [166, 209, 137], [229, 200, 144], [239, 159, 118], [231, 130, 132]], mix: 35, palRgb: { RED: [231, 130, 132], GREEN: [166, 209, 137], AMBER: [229, 200, 144], BLUE: [140, 170, 238], CYAN: [129, 200, 190], WHITE: [198, 208, 245], GOLD: [229, 200, 144] } },
  'catppuccin-latte': { cmap: [[30, 102, 245], [23, 146, 153], [64, 160, 43], [223, 142, 29], [254, 100, 11], [210, 15, 57]], mix: 20, palRgb: { RED: [210, 15, 57], GREEN: [64, 160, 43], AMBER: [223, 142, 29], BLUE: [30, 102, 245], CYAN: [23, 146, 153], WHITE: [76, 79, 105], GOLD: [223, 142, 29] } },
  // ── editor palettes ─────────────────────────────────────────────────────────
  'solarized-dark': { cmap: [[38, 139, 210], [42, 161, 152], [133, 153, 0], [181, 137, 0], [203, 75, 22]], mix: 25, palRgb: { RED: [220, 50, 47], GREEN: [133, 153, 0], AMBER: [181, 137, 0], BLUE: [38, 139, 210], CYAN: [42, 161, 152], WHITE: [147, 161, 161], GOLD: [181, 137, 0] } },
  'solarized-light': { cmap: [[38, 139, 210], [42, 161, 152], [133, 153, 0], [181, 137, 0], [203, 75, 22]], mix: 25, palRgb: { RED: [220, 50, 47], GREEN: [133, 153, 0], AMBER: [181, 137, 0], BLUE: [38, 139, 210], CYAN: [42, 161, 152], WHITE: [88, 110, 117], GOLD: [181, 137, 0] } },
  kanagawa: { cmap: [[126, 156, 216], [127, 180, 202], [106, 149, 137], [152, 187, 108], [230, 195, 132], [220, 165, 97]], mix: 30, palRgb: { RED: [195, 64, 67], GREEN: [152, 187, 108], AMBER: [220, 165, 97], BLUE: [126, 156, 216], CYAN: [127, 180, 202], WHITE: [220, 215, 186], GOLD: [230, 195, 132] } },
  everforest: { cmap: [[127, 187, 179], [131, 192, 146], [167, 192, 128], [219, 188, 127], [230, 152, 117], [230, 126, 128]], mix: 28, palRgb: { RED: [230, 126, 128], GREEN: [167, 192, 128], AMBER: [219, 188, 127], BLUE: [127, 187, 179], CYAN: [131, 192, 146], WHITE: [211, 198, 170], GOLD: [219, 188, 127] } },
  onedark: { cmap: [[97, 175, 239], [86, 182, 194], [152, 195, 121], [229, 192, 123], [209, 154, 102], [224, 108, 117]], mix: 30, palRgb: { RED: [224, 108, 117], GREEN: [152, 195, 121], AMBER: [229, 192, 123], BLUE: [97, 175, 239], CYAN: [86, 182, 194], WHITE: [171, 178, 191], GOLD: [229, 192, 123] } },
  'ayu-dark': { cmap: [[89, 194, 255], [149, 230, 203], [170, 217, 76], [255, 180, 84], [240, 113, 120]], mix: 25, palRgb: { RED: [240, 113, 120], GREEN: [170, 217, 76], AMBER: [255, 180, 84], BLUE: [89, 194, 255], CYAN: [149, 230, 203], WHITE: [191, 189, 182], GOLD: [255, 180, 84] } },
  'ayu-mirage': { cmap: [[115, 208, 255], [149, 230, 203], [186, 230, 126], [255, 204, 102], [242, 135, 121]], mix: 25, palRgb: { RED: [242, 135, 121], GREEN: [186, 230, 126], AMBER: [255, 204, 102], BLUE: [115, 208, 255], CYAN: [149, 230, 203], WHITE: [204, 202, 194], GOLD: [255, 204, 102] } },
  'ayu-light': { cmap: [[57, 158, 230], [76, 191, 153], [134, 179, 0], [255, 153, 64], [240, 113, 113]], mix: 18, palRgb: { RED: [240, 113, 113], GREEN: [134, 179, 0], AMBER: [255, 153, 64], BLUE: [57, 158, 230], CYAN: [76, 191, 153], WHITE: [92, 97, 102], GOLD: [255, 153, 64] } },
  'github-dark': { cmap: [[88, 166, 255], [57, 197, 207], [63, 185, 80], [210, 153, 34], [219, 109, 40], [248, 81, 73]], mix: 28, palRgb: { RED: [248, 81, 73], GREEN: [63, 185, 80], AMBER: [210, 153, 34], BLUE: [88, 166, 255], CYAN: [57, 197, 207], WHITE: [201, 209, 217], GOLD: [210, 153, 34] } },
  'github-light': { cmap: [[9, 105, 218], [27, 124, 131], [26, 127, 55], [154, 103, 0], [207, 34, 46]], mix: 18, palRgb: { RED: [207, 34, 46], GREEN: [26, 127, 55], AMBER: [154, 103, 0], BLUE: [9, 105, 218], CYAN: [27, 124, 131], WHITE: [36, 41, 47], GOLD: [154, 103, 0] } },
  monokai: { cmap: [[102, 217, 239], [166, 226, 46], [230, 219, 116], [253, 151, 31], [249, 38, 114]], mix: 22, palRgb: { RED: [249, 38, 114], GREEN: [166, 226, 46], AMBER: [230, 219, 116], BLUE: [174, 129, 255], CYAN: [102, 217, 239], WHITE: [248, 248, 242], GOLD: [253, 151, 31] } },
  'monokai-pro': { cmap: [[120, 220, 232], [169, 220, 118], [255, 216, 102], [252, 152, 103], [255, 97, 136]], mix: 22, palRgb: { RED: [255, 97, 136], GREEN: [169, 220, 118], AMBER: [255, 216, 102], BLUE: [171, 157, 242], CYAN: [120, 220, 232], WHITE: [252, 252, 250], GOLD: [255, 216, 102] } },
  cyberpunk: {
    cmap: [[0, 240, 255], [0, 255, 159], [243, 230, 0], [255, 0, 160]], mix: 0,
    palRgb: { RED: [255, 0, 160], GREEN: [0, 255, 159], AMBER: [243, 230, 0], BLUE: [0, 184, 255], CYAN: [0, 240, 255], WHITE: [240, 240, 240], GOLD: [243, 230, 0] },
    // theme-v2 showcase: this theme restyles individual elements (proving the cascade)
    elements: { clock: { fill: 'accent' }, 'cost.amount': { weight: 'bold' } },
  },
  // ── monochrome CRT phosphors (cmap-only → auto-derived accents) ──────────────
  phosphor: { cmap: [[40, 22, 0], [120, 70, 0], [200, 130, 0], [255, 176, 0], [255, 214, 130]], mix: 10 },
  'phosphor-green': { cmap: [[0, 30, 0], [0, 90, 0], [0, 160, 0], [0, 230, 40], [150, 255, 150]], mix: 10 },
  'phosphor-white': { cmap: [[24, 24, 24], [80, 80, 80], [150, 150, 150], [220, 220, 220], [255, 255, 255]], mix: 10 },
  // ── muted / aesthetic (cmap-only) ───────────────────────────────────────────
  verdigris: { cmap: [[193, 154, 107], [184, 115, 51], [125, 140, 74], [67, 150, 140], [94, 140, 106]], mix: 22 },
  'sumi-e': { cmap: [[40, 38, 34], [90, 86, 78], [150, 144, 130], [210, 202, 184], [239, 232, 216]], mix: 15 },
  stealth: { cmap: [[30, 32, 36], [60, 64, 70], [90, 96, 104], [130, 138, 148]], mix: 10 },
  zen: { cmap: [[120, 130, 125], [150, 160, 150], [180, 185, 170], [205, 200, 185]], mix: 40 },
  void: { cmap: [[20, 18, 30], [40, 36, 60], [70, 60, 100], [110, 96, 150], [150, 140, 190]], mix: 18 },
  gothic: { cmap: [[24, 24, 26], [60, 60, 64], [110, 110, 114], [176, 176, 176]], mix: 5, palRgb: { RED: [138, 3, 3], GREEN: [150, 150, 150], AMBER: [160, 160, 160], BLUE: [130, 130, 134], CYAN: [150, 150, 154], WHITE: [200, 200, 200], GOLD: [176, 176, 176] } },
  oceanic: { cmap: [[8, 24, 48], [12, 60, 90], [20, 100, 120], [30, 150, 160], [90, 230, 210]], mix: 20 },
  // ── identity palettes (vivid; cmap = the flag) ──────────────────────────────
  pride: { cmap: [[228, 3, 3], [255, 140, 0], [255, 237, 0], [0, 128, 38], [0, 77, 255], [117, 7, 135]], mix: 0 },
  trans: { cmap: [[91, 206, 250], [245, 169, 184], [240, 240, 240], [245, 169, 184], [91, 206, 250]], mix: 0 },
  bi: { cmap: [[214, 2, 112], [155, 79, 150], [0, 56, 168]], mix: 0 },
  ace: { cmap: [[70, 70, 70], [130, 130, 130], [200, 200, 200], [128, 0, 128]], mix: 10 },
  nonbinary: { cmap: [[252, 244, 52], [240, 240, 240], [156, 89, 209], [80, 80, 88]], mix: 5 },
  // crisp silver normally; pairs with the danger wash (deep safelight red when
  // context/limits are critical — the darkroom convention). See SL_DANGER.
  'silver-halide': { cmap: [[40, 42, 46], [90, 94, 100], [150, 154, 160], [210, 214, 220], [245, 247, 250]], mix: 8 },
  // Accessibility palette (SL_ACCESSIBLE) — see A11Y_PAL below. Default gauge is
  // the CVD-safe ramp; SL_ACCESSIBLE_GAUGE swaps it (themes.ts). Paired with motion
  // off (config.ts forces shimmer='off' under SL_ACCESSIBLE).
  'high-contrast': { cmap: A11Y_GAUGES.cvd, mix: 0, palRgb: A11Y_PAL },
};
