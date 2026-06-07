#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
  mod2
));

// src/index.ts
var fs3 = __toESM(require("fs"));
var os3 = __toESM(require("os"));
var path2 = __toESM(require("path"));

// src/ansi.ts
var import_child_process = require("child_process");

// src/util.ts
var env = (k, d) => process.env[k] !== void 0 && process.env[k] !== "" ? process.env[k] : d;
var idiv = (a, b) => Math.trunc(a / b);
var mod = (a, b) => (a % b + b) % b;

// src/presets.ts
var PRESETS = {
  // Quiet and static: no motion, greyscale, plain bar.
  minimal: { SL_THEME: "mono", SL_SHIMMER: "off", SL_BAR_STYLE: "blocks" },
  // Colourful and lively without the joke modes.
  pretty: { SL_THEME: "synthwave", SL_SHIMMER: "wave", SL_CREST: "on", SL_MOON: "on", SL_RAINBOW_STATS: "on" },
  // Calm but informative — for long working sessions.
  focus: { SL_THEME: "nord", SL_SHIMMER: "breathe", SL_BURN: "on", SL_GIT_EXTRA: "on" },
  // Everything loud, on purpose.
  chaos: { SL_SHIMMER: "disco", SL_THEME: "plasma", SL_PET: "on", SL_CREST: "on", SL_COST_FLAIR: "on", SL_RAINBOW_STATS: "on" },
  // The kitchen-sink showcase used for screenshots/GIFs.
  demo: { SL_THEME: "viridis", SL_SHIMMER: "comet", SL_CREST: "on", SL_PET: "on", SL_MOON: "on", SL_DAYNIGHT: "on", SL_BURN: "on", SL_GIT_EXTRA: "on", SL_RAINBOW_STATS: "on" }
};

// src/config.ts
var preset = PRESETS[(process.env.SL_PRESET || "").toLowerCase()] || {};
var penv = (k, d) => {
  const e = process.env[k];
  if (e !== void 0 && e !== "")
    return e;
  if (preset[k] !== void 0)
    return preset[k];
  return d;
};
var pbool = (k) => /^(on|1|true|yes)$/i.test(penv(k, ""));
var pint = (k, d) => {
  const v = parseInt(penv(k, ""), 10);
  return Number.isFinite(v) ? v : d;
};
function resolveColorMode() {
  if (process.env.NO_COLOR !== void 0 && process.env.NO_COLOR !== "")
    return "mono";
  const m = penv("SL_COLOR_MODE", "auto").toLowerCase();
  if (m === "truecolor" || m === "256" || m === "16" || m === "mono")
    return m;
  const ct = (process.env.COLORTERM || "").toLowerCase();
  if (ct.includes("truecolor") || ct.includes("24bit"))
    return "truecolor";
  const term = (process.env.TERM || "").toLowerCase();
  if (term === "dumb")
    return "mono";
  if (term.includes("256"))
    return "256";
  return "truecolor";
}
var shimmer = penv("SL_SHIMMER", "sweep");
if (shimmer === "pulse")
  shimmer = "breathe";
if (shimmer === "march")
  shimmer = "scan";
if (pbool("SL_ACCESSIBLE"))
  shimmer = "off";
var nowMs = parseInt(env("SL_FRAME_MS", ""), 10) || Date.now();
var clockMs = parseInt(env("SL_CLOCK_MS", ""), 10) || nowMs;
var rainbowMix = penv("SL_RAINBOW_MIX", "");
var cfg = {
  shimmer,
  speed: pint("SL_SPEED", 3),
  glow: pint("SL_GLOW", 240),
  waveHue: pint("SL_WAVE_HUE", 32),
  themeName: penv("SL_THEME", "heat"),
  barStyle: penv("SL_BAR_STYLE", "blocks"),
  rainbowMixRaw: rainbowMix !== "" ? parseInt(rainbowMix, 10) : null,
  margin: pint("SL_MARGIN", 6),
  colorMode: resolveColorMode(),
  themeFile: penv("SL_THEME_FILE", ""),
  base16: penv("SL_BASE16", ""),
  pet: pbool("SL_PET"),
  crest: pbool("SL_CREST"),
  moon: pbool("SL_MOON"),
  daynight: pbool("SL_DAYNIGHT"),
  costFlair: pbool("SL_COST_FLAIR"),
  burn: pbool("SL_BURN"),
  gitExtra: pbool("SL_GIT_EXTRA"),
  rainbowStats: pbool("SL_RAINBOW_STATS"),
  trend: pbool("SL_TREND"),
  weather: pbool("SL_WEATHER"),
  limits: pbool("SL_LIMITS"),
  limitWarn: pint("SL_LIMIT_WARN", 80),
  limitCrit: pint("SL_LIMIT_CRIT", 95),
  layout: penv("SL_LAYOUT", "3line"),
  separator: penv("SL_SEPARATOR", ""),
  hide: penv("SL_HIDE", ""),
  privacy: pbool("SL_PRIVACY"),
  privacyHide: penv("SL_PRIVACY_HIDE", ""),
  projectAliases: penv("SL_PROJECT_ALIASES", ""),
  path: penv("SL_PATH", "auto"),
  sysinfo: pbool("SL_SYSINFO"),
  accessible: pbool("SL_ACCESSIBLE"),
  responsive: pbool("SL_RESPONSIVE"),
  gitRisk: pbool("SL_GIT_RISK"),
  nowMs,
  clockMs,
  baseFrame: idiv(nowMs, 1e3)
};

// src/ansi.ts
var ESC = "\x1B";
var R = "\x1B[0m";
var DIM = "\x1B[2m";
var BOLD = "\x1B[1m";
function rgbTo256(r, g, b) {
  if (r === g && g === b) {
    if (r < 8)
      return 16;
    if (r > 248)
      return 231;
    return Math.round((r - 8) / 247 * 24) + 232;
  }
  const q = (v) => Math.round(v / 255 * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}
function rgbTo16(r, g, b, isBg) {
  const max = Math.max(r, g, b);
  if (max < 40)
    return isBg ? 40 : 30;
  const thr = max / 2;
  const code = (r >= thr ? 1 : 0) | (g >= thr ? 2 : 0) | (b >= thr ? 4 : 0);
  const bright = max > 170;
  return (isBg ? bright ? 100 : 40 : bright ? 90 : 30) + code;
}
function tc(r, g, b) {
  switch (cfg.colorMode) {
    case "mono":
      return "";
    case "16":
      return `${ESC}[${rgbTo16(r, g, b, false)}m`;
    case "256":
      return `${ESC}[38;5;${rgbTo256(r, g, b)}m`;
    default:
      return `${ESC}[38;2;${r};${g};${b}m`;
  }
}
function bg(r, g, b) {
  switch (cfg.colorMode) {
    case "mono":
      return "";
    case "16":
      return `${ESC}[${rgbTo16(r, g, b, true)}m`;
    case "256":
      return `${ESC}[48;5;${rgbTo256(r, g, b)}m`;
    default:
      return `${ESC}[48;2;${r};${g};${b}m`;
  }
}
function fgbg(f, b) {
  if (cfg.colorMode === "truecolor")
    return `${ESC}[38;2;${f[0]};${f[1]};${f[2]};48;2;${b[0]};${b[1]};${b[2]}m`;
  return tc(f[0], f[1], f[2]) + bg(b[0], b[1], b[2]);
}
function dimFg(r, g, b) {
  if (cfg.colorMode === "truecolor")
    return `${ESC}[2;38;2;${r};${g};${b}m`;
  return DIM + tc(r, g, b);
}
var VS = "\uFE0E";
var txt = (glyph) => glyph + VS;
var stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
var printLen = (s) => Array.from(stripAnsi(s).replace(/[︀-️]/g, "")).length;
function termCols() {
  let c = 0;
  try {
    c = parseInt(
      (0, import_child_process.execFileSync)("tput", ["cols"], { encoding: "utf8", stdio: ["inherit", "pipe", "ignore"], windowsHide: true }),
      10
    );
  } catch {
  }
  if (!c)
    c = process.stdout.columns || parseInt(env("COLUMNS", ""), 10) || 120;
  if (!Number.isFinite(c) || c < 20)
    c = 120;
  return c;
}
function justified(left, right) {
  if (stripAnsi(right).length === 0)
    return left;
  let pad = termCols() - printLen(left) - printLen(right) - cfg.margin;
  if (pad < 1)
    pad = 1;
  return left + " ".repeat(pad) + right;
}

// src/color.ts
function hsv(h, s, v) {
  h = mod(h, 360);
  const vmax = idiv(255 * v, 100), vmin = idiv(vmax * (100 - s), 100);
  const reg = idiv(h, 60), fr = h % 60;
  const ris = vmin + idiv((vmax - vmin) * fr, 60);
  const fal = vmax - idiv((vmax - vmin) * fr, 60);
  switch (reg) {
    case 0:
      return [vmax, ris, vmin];
    case 1:
      return [fal, vmax, vmin];
    case 2:
      return [vmin, vmax, ris];
    case 3:
      return [vmin, fal, vmax];
    case 4:
      return [ris, vmin, vmax];
    default:
      return [vmax, vmin, fal];
  }
}
function cmapSample(stops, posp) {
  const t = Math.max(0, Math.min(100, posp)) / 100 * (stops.length - 1);
  const i = Math.floor(t), f = t - i;
  const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f)
  ];
}
function shiftHue([r, g, b], deg) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  const s = mx === 0 ? 0 : d / mx, v = mx;
  if (d !== 0) {
    h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + deg) % 360;
    if (h < 0)
      h += 360;
  }
  const c = v * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = v - c, hp = h / 60;
  let rr, gg, bb;
  if (hp < 1)
    [rr, gg, bb] = [c, x, 0];
  else if (hp < 2)
    [rr, gg, bb] = [x, c, 0];
  else if (hp < 3)
    [rr, gg, bb] = [0, c, x];
  else if (hp < 4)
    [rr, gg, bb] = [0, x, c];
  else if (hp < 5)
    [rr, gg, bb] = [x, 0, c];
  else
    [rr, gg, bb] = [c, 0, x];
  return [Math.round((rr + m) * 255), Math.round((gg + m) * 255), Math.round((bb + m) * 255)];
}
function hueRgb(h, mix) {
  h = mod(h, 360);
  const region = idiv(h, 60), f = h % 60;
  const rise = idiv(f * 255, 60), fall = 255 - rise;
  let r, g, b;
  switch (region) {
    case 0:
      r = 255;
      g = rise;
      b = 0;
      break;
    case 1:
      r = fall;
      g = 255;
      b = 0;
      break;
    case 2:
      r = 0;
      g = 255;
      b = rise;
      break;
    case 3:
      r = 0;
      g = fall;
      b = 255;
      break;
    case 4:
      r = rise;
      g = 0;
      b = 255;
      break;
    default:
      r = 255;
      g = 0;
      b = fall;
      break;
  }
  return [r + idiv((255 - r) * mix, 100), g + idiv((255 - g) * mix, 100), b + idiv((255 - b) * mix, 100)];
}

// src/themes.ts
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));

// src/themes.data.ts
var THEMES_DATA = {
  // hue-ramp themes
  heat: {
    hueHi: 120,
    hueLo: 0,
    sat: 88,
    valLo: 84,
    valHi: 84,
    mix: null,
    palRaw: { RED: "\x1B[31m", GREEN: "\x1B[32m", AMBER: "\x1B[33m", BLUE: "\x1B[34m", CYAN: "\x1B[36m", WHITE: "\x1B[37m", GOLD: "\x1B[38;5;220m" },
    // RGB approximations of the literals above, used only when degrading (256/16).
    palRgb: { RED: [205, 0, 0], GREEN: [0, 205, 0], AMBER: [205, 205, 0], BLUE: [0, 0, 238], CYAN: [0, 205, 205], WHITE: [229, 229, 229], GOLD: [255, 215, 0] }
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
  // designer palettes
  dracula: { cmap: [[80, 250, 123], [139, 233, 253], [189, 147, 249], [255, 121, 198]], mix: 35, palRgb: { RED: [255, 85, 85], AMBER: [255, 184, 108], GREEN: [80, 250, 123], BLUE: [189, 147, 249], CYAN: [139, 233, 253], GOLD: [241, 250, 140], WHITE: [248, 248, 242] } },
  nord: { cmap: [[94, 129, 172], [129, 161, 193], [136, 192, 208], [143, 188, 187]], mix: 40, palRgb: { RED: [191, 97, 106], AMBER: [235, 203, 139], GREEN: [163, 190, 140], BLUE: [129, 161, 193], CYAN: [136, 192, 208], GOLD: [235, 203, 139], WHITE: [236, 239, 244] } },
  gruvbox: { cmap: [[131, 165, 152], [184, 187, 38], [250, 189, 47], [254, 128, 25]], mix: 25, palRgb: { RED: [251, 73, 52], AMBER: [250, 189, 47], GREEN: [184, 187, 38], BLUE: [131, 165, 152], CYAN: [142, 192, 124], GOLD: [250, 189, 47], WHITE: [235, 219, 178] } },
  tokyonight: { cmap: [[122, 162, 247], [125, 207, 255], [187, 154, 247], [247, 118, 142]], mix: 30, palRgb: { RED: [247, 118, 142], AMBER: [224, 175, 104], GREEN: [158, 206, 106], BLUE: [122, 162, 247], CYAN: [125, 207, 255], GOLD: [224, 175, 104], WHITE: [192, 202, 245] } },
  rosepine: { cmap: [[49, 116, 143], [156, 207, 216], [196, 167, 231], [235, 188, 186]], mix: 45, palRgb: { RED: [235, 111, 146], AMBER: [246, 193, 119], GREEN: [156, 207, 216], BLUE: [49, 116, 143], CYAN: [156, 207, 216], GOLD: [246, 193, 119], WHITE: [224, 222, 244] } }
};

// src/themes.ts
var EMPTY_PAL = { RED: "", GREEN: "", AMBER: "", BLUE: "", CYAN: "", WHITE: "", GOLD: "" };
var palFromRgb = (p) => ({
  RED: tc(...p.RED),
  GREEN: tc(...p.GREEN),
  AMBER: tc(...p.AMBER),
  BLUE: tc(...p.BLUE),
  CYAN: tc(...p.CYAN),
  WHITE: tc(...p.WHITE),
  GOLD: tc(...p.GOLD)
});
function deriveCmapPal(cmap) {
  const f = (p, floor = 125) => {
    let c = cmapSample(cmap, p);
    const mx = Math.max(c[0], c[1], c[2]);
    if (mx < floor) {
      const k = floor / (mx || 1);
      c = c.map((v) => Math.min(255, Math.round(v * k)));
    }
    return tc(c[0], c[1], c[2]);
  };
  return { RED: f(93), AMBER: f(72), GREEN: f(48), BLUE: f(22), CYAN: f(40), GOLD: f(85), WHITE: tc(228, 228, 228) };
}
function buildTheme(d) {
  let pal;
  if (cfg.colorMode === "mono")
    pal = EMPTY_PAL;
  else if (cfg.colorMode === "truecolor" && d.palRaw)
    pal = d.palRaw;
  else if (d.palRgb)
    pal = palFromRgb(d.palRgb);
  else if (d.palRaw)
    pal = d.palRaw;
  return { hueHi: d.hueHi, hueLo: d.hueLo, sat: d.sat, valLo: d.valLo, valHi: d.valHi, cmap: d.cmap, mix: d.mix, pal };
}
var THEMES = {};
for (const k of Object.keys(THEMES_DATA))
  THEMES[k] = buildTheme(THEMES_DATA[k]);
var clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
var isRgb = (x) => Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === "number");
var hexToRgb = (h) => {
  const m = h.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m))
    return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};
function coerceThemeData(j) {
  if (!j || typeof j !== "object")
    return null;
  const d = { mix: typeof j.mix === "number" ? j.mix : null };
  if (Array.isArray(j.cmap)) {
    const c = j.cmap.filter(isRgb).map((s) => s.map(clamp));
    if (c.length >= 2)
      d.cmap = c;
  }
  for (const k of ["hueHi", "hueLo", "sat", "valLo", "valHi"])
    if (typeof j[k] === "number")
      d[k] = j[k];
  if (j.palette && typeof j.palette === "object") {
    const keys = ["RED", "GREEN", "AMBER", "BLUE", "CYAN", "WHITE", "GOLD"];
    if (keys.every((k) => isRgb(j.palette[k]))) {
      d.palRgb = keys.reduce((o, k) => {
        o[k] = j.palette[k].map(clamp);
        return o;
      }, {});
    }
  }
  if (!d.cmap && d.hueHi === void 0 && !d.palRgb)
    return null;
  if (!d.cmap && d.hueHi === void 0 && d.palRgb)
    d.cmap = [d.palRgb.GREEN, d.palRgb.AMBER, d.palRgb.RED];
  return d;
}
function themeFromBase16(spec) {
  const cols = spec.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(hexToRgb);
  if (cols.length < 16 || cols.some((c2) => c2 === null))
    return null;
  const c = cols;
  const palRgb = { RED: c[8], GREEN: c[11], AMBER: c[10], BLUE: c[13], CYAN: c[12], WHITE: c[5], GOLD: c[9] };
  return { cmap: [c[11], c[10], c[9], c[8]], mix: 30, palRgb };
}
function loadCustom() {
  try {
    const p = cfg.themeFile || `${os.homedir()}/.claude/statusline-theme.json`;
    if (fs.existsSync(p)) {
      const d = coerceThemeData(JSON.parse(fs.readFileSync(p, "utf8")));
      if (d)
        return buildTheme(d);
    }
  } catch {
  }
  try {
    if (cfg.base16) {
      const d = themeFromBase16(cfg.base16);
      if (d)
        return buildTheme(d);
    }
  } catch {
  }
  return null;
}
var CUSTOM = cfg.themeName === "custom" ? loadCustom() : null;
var TH = CUSTOM || THEMES[cfg.themeName] || THEMES.heat;
var PAL = cfg.colorMode === "mono" ? EMPTY_PAL : TH.pal || deriveCmapPal(TH.cmap);
var { RED, GREEN, AMBER, BLUE, CYAN, WHITE, GOLD } = PAL;
var RAINBOW_MIX = cfg.rainbowMixRaw != null ? cfg.rainbowMixRaw : TH.mix != null ? TH.mix : 50;
function gradientColor(posp) {
  posp = Math.max(0, Math.min(100, posp));
  let c;
  if (TH.cmap) {
    c = cmapSample(TH.cmap, posp);
  } else {
    const bh = TH.hueHi - idiv(posp * (TH.hueHi - TH.hueLo), 100);
    const vv = TH.valLo + idiv((TH.valHi - TH.valLo) * posp, 100);
    c = hsv(bh, TH.sat, vv);
  }
  const mx = Math.max(c[0], c[1], c[2]);
  if (mx < 150) {
    const k = 150 / (mx || 1);
    c = [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k))];
  }
  return tc(c[0], c[1], c[2]);
}

// src/bar.ts
var MATRIX_CHARS = "01<>{}[]/\\|=+*".split("");
var hashI = (n) => Math.imul(n >>> 0, 2654435761) >>> 0;
function drawBar(width, filled, marker, phaseMs = 0) {
  const { shimmer: shimmer2, speed, glow, waveHue, barStyle, nowMs: nowMs2, baseFrame, colorMode } = cfg;
  const t = nowMs2 + phaseMs;
  let span = filled;
  if (span < 1)
    span = 1;
  let posc = 0, hglob = 0;
  const wrap = span * 100;
  if (shimmer2 === "sweep" || shimmer2 === "comet" || shimmer2 === "wave") {
    posc = mod(idiv(t * speed, 10), wrap);
  } else if (shimmer2 === "scan") {
    let cyclec = span * 200;
    if (cyclec < 1)
      cyclec = 1;
    posc = mod(idiv(t * speed, 10), cyclec);
    if (posc >= span * 100)
      posc = span * 200 - posc;
  } else if (shimmer2 === "breathe") {
    let tri = mod(t, 2600);
    if (tri >= 1300)
      tri = 2600 - tri;
    hglob = idiv(waveHue * tri, 1300);
  }
  const snakeHead = idiv(mod(idiv(t * speed, 10), span * 100), 100);
  const px = (sx) => {
    if (shimmer2 === "disco")
      return hsv(idiv(sx * 3, 10) + idiv(t, 30), 95, 92);
    let posp = idiv(sx, width);
    if (posp > 100)
      posp = 100;
    if (posp < 0)
      posp = 0;
    let hoff = 0;
    const torus = () => {
      const d = Math.abs(sx - posc);
      return Math.min(d, wrap - d);
    };
    switch (shimmer2) {
      case "sweep": {
        const dc = torus();
        if (dc < glow)
          hoff = idiv(waveHue * (glow - dc) * (glow - dc), glow * glow);
        break;
      }
      case "wave": {
        const dc = torus();
        if (dc < 450)
          hoff = idiv(waveHue * (450 - dc), 450);
        break;
      }
      case "comet": {
        const lead = mod(posc - sx, wrap);
        if (lead < 420)
          hoff = idiv(waveHue * (420 - lead), 420);
        if (torus() < 70)
          hoff = waveHue;
        break;
      }
      case "scan": {
        const dc = Math.abs(sx - posc);
        if (dc < 140)
          hoff = idiv(waveHue * (140 - dc), 140);
        break;
      }
      case "breathe":
        hoff = hglob;
        break;
    }
    if (TH.cmap) {
      const c = cmapSample(TH.cmap, posp);
      return hoff ? shiftHue(c, hoff) : c;
    }
    const bh = TH.hueHi - idiv(posp * (TH.hueHi - TH.hueLo), 100);
    const vv = TH.valLo + idiv((TH.valHi - TH.valLo) * posp, 100);
    return hsv(bh + hoff, TH.sat, vv);
  };
  const fg = (sx) => {
    const [r, g, b] = px(sx);
    return tc(r, g, b);
  };
  let out = "";
  for (let i = 0; i < width; i++) {
    if (marker >= 0 && i === marker) {
      out += `${WHITE}\u2503${R}`;
      continue;
    }
    const isFill = i < filled;
    if (barStyle === "pacman") {
      if (isFill && i === filled - 1)
        out += `${ESC}[1m${fg(i * 100 + 50)}C${R}`;
      else if (isFill)
        out += `${fg(i * 100 + 50)}=${R}`;
      else
        out += `${DIM}\xB7${R}`;
      continue;
    }
    if (barStyle === "snake") {
      if (isFill)
        out += i === snakeHead ? `${ESC}[1m${fg(i * 100 + 50)}@${R}` : `${fg(i * 100 + 50)}~${R}`;
      else
        out += `${DIM}\xB7${R}`;
      continue;
    }
    if (barStyle === "matrix") {
      if (isFill)
        out += `${fg(i * 100 + 50)}\u2588${R}`;
      else
        out += `${dimFg(0, 120, 0)}${MATRIX_CHARS[hashI(i * 131 + baseFrame) % MATRIX_CHARS.length]}${R}`;
      continue;
    }
    if (isFill && shimmer2 === "disco") {
      const [r, g, b] = px(i * 100 + 50);
      out += `${tc(r, g, b)}\u2588${R}`;
      continue;
    }
    if (isFill) {
      const left = px(i * 100 + 25);
      const right = px(i * 100 + 75);
      if (colorMode === "mono")
        out += `${BOLD}\u2588${R}`;
      else if (colorMode === "16")
        out += `${tc(left[0], left[1], left[2])}\u2588${R}`;
      else
        out += `${fgbg(left, right)}\u258C${R}`;
    } else
      out += `${DIM}\u2591${R}`;
  }
  return out;
}

// src/rainbow.ts
function rainbow(text) {
  const disco = cfg.shimmer === "disco";
  const step = disco ? 55 : 38;
  const mix = disco ? 0 : RAINBOW_MIX;
  const flow = disco ? 6 : 18;
  const frame = cfg.shimmer === "off" ? 0 : cfg.nowMs;
  const chars = Array.from(text);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const [r, g, b] = hueRgb(i * step + idiv(frame, flow), mix);
    out += `${tc(r, g, b)}${chars[i]}`;
  }
  return out + R;
}

// src/format.ts
function fmtK(n) {
  if (n >= 1e6)
    return idiv(n, 1e6) + "M";
  if (n >= 1e3)
    return idiv(n, 1e3) + "k";
  return String(n);
}
function fmtCountdown(secs) {
  if (secs >= 86400)
    return `${idiv(secs, 86400)}d ${idiv(secs % 86400, 3600)}h`;
  if (secs >= 3600)
    return `${idiv(secs, 3600)}h ${idiv(secs % 3600, 60)}m`;
  return `${idiv(secs, 60)}m`;
}

// src/git.ts
var import_child_process2 = require("child_process");
function gitOut(cwd, args) {
  if (!cwd)
    return "";
  try {
    return (0, import_child_process2.execFileSync)(
      "git",
      ["-C", cwd, "--no-optional-locks", ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }
    ).trim();
  } catch {
    return "";
  }
}
var countLines = (s) => s ? s.split("\n").filter((l) => l.length).length : 0;

// src/state.ts
var fs2 = __toESM(require("fs"));
var os2 = __toESM(require("os"));
var path = __toESM(require("path"));
var DIR = path.join(os2.tmpdir(), "claude-statusline");
var HISTORY = path.join(os2.homedir(), ".claude", "statusline-history.jsonl");
var TTL_MS = 7 * 864e5;
var SPARK_CAP = 30;
var ETA_CAP = 20;
var HISTORY_CAP = 1e3;
var now = () => cfg.nowMs;
var fresh = () => ({ v: 1, updated: 0, spark: [], compactions: 0 });
function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16);
}
var sanitize = (s) => s.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
function sessionKey(input) {
  const sid = input.session_id ? sanitize(String(input.session_id)) : "";
  if (sid)
    return sid;
  if (input.transcript_path)
    return hash(input.transcript_path);
  return "default";
}
var fileFor = (key) => path.join(DIR, `${key}.json`);
function readState(key) {
  try {
    const s = JSON.parse(fs2.readFileSync(fileFor(key), "utf8"));
    if (!s || typeof s !== "object")
      return fresh();
    if (now() - (s.updated || 0) > TTL_MS)
      return fresh();
    return { ...fresh(), ...s };
  } catch {
    return fresh();
  }
}
function writeState(key, s) {
  try {
    fs2.mkdirSync(DIR, { recursive: true });
    s.v = 1;
    s.updated = now();
    if (s.spark.length > SPARK_CAP)
      s.spark = s.spark.slice(-SPARK_CAP);
    if (s.etaSamples && s.etaSamples.length > ETA_CAP)
      s.etaSamples = s.etaSamples.slice(-ETA_CAP);
    const tmp = `${fileFor(key)}.${process.pid}.tmp`;
    fs2.writeFileSync(tmp, JSON.stringify(s));
    try {
      fs2.renameSync(tmp, fileFor(key));
    } catch {
      fs2.writeFileSync(fileFor(key), JSON.stringify(s));
    }
    janitor();
  } catch {
  }
}
function pushSpark(s, pct) {
  s.spark.push(Math.max(0, Math.min(100, Math.round(pct))));
  if (s.spark.length > SPARK_CAP)
    s.spark = s.spark.slice(-SPARK_CAP);
}
function janitor() {
  if (now() % 100 >= 1)
    return;
  try {
    for (const f of fs2.readdirSync(DIR)) {
      const fp = path.join(DIR, f);
      try {
        if (now() - fs2.statSync(fp).mtimeMs > TTL_MS)
          fs2.unlinkSync(fp);
      } catch {
      }
    }
  } catch {
  }
}
function appendHistory(rec) {
  try {
    fs2.mkdirSync(path.dirname(HISTORY), { recursive: true });
    fs2.appendFileSync(HISTORY, JSON.stringify(rec) + "\n");
    if (now() % 50 < 1) {
      const kept = readHistory();
      if (kept.length >= HISTORY_CAP)
        fs2.writeFileSync(HISTORY, kept.map((r) => JSON.stringify(r)).join("\n") + "\n");
    }
  } catch {
  }
}
function readHistory() {
  try {
    const out = [];
    for (const l of fs2.readFileSync(HISTORY, "utf8").split("\n")) {
      if (!l)
        continue;
      try {
        const r = JSON.parse(l);
        if (r && typeof r.cost === "number")
          out.push(r);
      } catch {
      }
    }
    return out.slice(-HISTORY_CAP);
  } catch {
    return [];
  }
}

// src/insight.ts
var SPARK = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588".split("");
function sparkline(values, width = 12) {
  const v = values.slice(-width);
  if (!v.length)
    return "";
  return v.map((x) => {
    const c = Math.max(0, Math.min(100, x));
    return SPARK[Math.min(7, idiv(c * 8, 100))];
  }).join("");
}
function etaMinutes(samples, target, cur) {
  if (cur >= target)
    return -1;
  const pts = samples.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 3)
    return -1;
  const n = pts.length;
  let sx = 0, sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  const mx = sx / n, my = sy / n;
  let num = 0, den = 0;
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my);
    den += (x - mx) * (x - mx);
  }
  if (den === 0)
    return -1;
  const slope = num / den;
  if (slope <= 0)
    return -1;
  const ms = (target - cur) / slope;
  if (!Number.isFinite(ms) || ms <= 0)
    return -1;
  const mins = Math.round(ms / 6e4);
  return mins > 1e5 ? -1 : mins;
}
function median(nums) {
  if (!nums.length)
    return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function weatherWord(pct, target) {
  if (target > 0 && pct >= target)
    return "compacting";
  if (pct >= 85)
    return "stormy";
  if (pct >= 65)
    return "dense";
  if (pct >= 40)
    return "breezy";
  return "clear";
}

// src/index.ts
function displayPath(cwd) {
  if (!cwd)
    return cwd;
  let p = cwd;
  if (cfg.projectAliases) {
    try {
      const map = JSON.parse(cfg.projectAliases);
      let best = "";
      for (const k of Object.keys(map))
        if ((p === k || p.startsWith(k + "/")) && k.length > best.length)
          best = k;
      if (best)
        p = map[best] + p.slice(best.length);
    } catch {
    }
  }
  if (cfg.path === "full")
    return p;
  const home = os3.homedir();
  if (home && (p === home || p.startsWith(home + "/")))
    p = "~" + p.slice(home.length);
  const parts = p.split("/").filter(Boolean);
  if (parts.length > 5)
    p = `${p.startsWith("/") ? "/" : ""}${parts[0]}/\u2026/${parts.slice(-2).join("/")}`;
  return p;
}
function build() {
  let input = "";
  try {
    input = fs3.readFileSync(0, "utf8");
  } catch {
  }
  let data = {};
  try {
    data = JSON.parse(input) || {};
  } catch {
    data = {};
  }
  const ws = data.workspace || {};
  const CWD = ws.current_dir || "";
  const model = data.model || {};
  const MODEL_ID = model.id || "";
  const MODEL_NAME = model.display_name || "Claude";
  const cw = data.context_window || {};
  const PCT = Math.floor(cw.used_percentage || 0);
  const MAX_TOK = cw.context_window_size || 2e5;
  const cost = data.cost || {};
  const ADDED = cost.total_lines_added || 0;
  const REMOVED = cost.total_lines_removed || 0;
  const COST = cost.total_cost_usd || 0;
  const DURATION_MS = Math.floor(cost.total_duration_ms || 0);
  const TRANSCRIPT = data.transcript_path || "";
  const EFFORT = data.effort && data.effort.level || "";
  const THINKING = !!(data.thinking && data.thinking.enabled);
  const cu = cw.current_usage;
  const CU_READ = cu && cu.cache_read_input_tokens || 0;
  const CU_WRITE = cu && cu.cache_creation_input_tokens || 0;
  const CU_INPUT = cu && cu.input_tokens || 0;
  const CU_OUT = cu && cu.output_tokens || 0;
  const rl = data.rate_limits;
  let SPARK2 = [], COMPACTIONS = 0, ETA_SAMPLES = [];
  try {
    const sk = sessionKey(data);
    const st = readState(sk);
    const prev = st.spark.length ? st.spark[st.spark.length - 1] : -1;
    if (prev >= 0 && PCT <= prev - 25)
      st.compactions += 1;
    pushSpark(st, PCT);
    st.etaSamples = (st.etaSamples || []).concat([[DURATION_MS, PCT]]).slice(-20);
    const bucket = idiv(DURATION_MS, 3e5);
    if (cfg.burn && COST > 0 && bucket > (st.histBucket ?? -1)) {
      st.histBucket = bucket;
      appendHistory({ t: cfg.nowMs, cost: COST, ctx: PCT, dur: DURATION_MS });
    }
    writeState(sk, st);
    SPARK2 = st.spark.slice();
    COMPACTIONS = st.compactions;
    ETA_SAMPLES = st.etaSamples;
  } catch {
  }
  const idl = MODEL_ID.toLowerCase();
  let TIER = "Sonnet", MODEL_COLOUR = CYAN;
  if (idl.includes("haiku")) {
    TIER = "Haiku";
    MODEL_COLOUR = BLUE;
  } else if (idl.includes("opus")) {
    TIER = "Opus";
    MODEL_COLOUR = GOLD;
  }
  const vm = idl.match(/(opus|sonnet|haiku)-(\d+)-(\d+)/);
  const MODEL_VER = vm ? `${vm[2]}.${vm[3]}` : "";
  const MODEL_DISPLAY = MODEL_VER ? `${MODEL_COLOUR}${TIER} ${MODEL_VER}${R}` : `${MODEL_COLOUR}${MODEL_NAME}${R}`;
  const ONEM = MAX_TOK >= 9e5 ? `${DIM}1M${R}` : "";
  let CREST = "";
  if (cfg.crest) {
    if (TIER === "Opus")
      CREST = `${GOLD}\u2605${R} `;
    else if (TIER === "Haiku")
      CREST = `${BLUE}\u25B2${R} `;
    else
      CREST = `${CYAN}\u25C6${R} `;
  }
  let EFFORT_C = "", EFFORT_WORD = "";
  switch (EFFORT) {
    case "low":
      EFFORT_C = WHITE;
      EFFORT_WORD = `${DIM}low${R}`;
      break;
    case "medium":
      EFFORT_C = WHITE;
      EFFORT_WORD = `${DIM}${WHITE}med${R}`;
      break;
    case "high":
      EFFORT_C = WHITE;
      EFFORT_WORD = `${WHITE}high${R}`;
      break;
    case "xhigh":
      EFFORT_C = AMBER;
      EFFORT_WORD = `${AMBER}xhigh${R}`;
      break;
    case "max":
      EFFORT_C = RED;
      EFFORT_WORD = `${BOLD}${RED}MAX${R}`;
      break;
  }
  const THINKING_WORD = THINKING ? `${DIM}${EFFORT_C}thinking${R}` : "";
  const FAST = data.fast_mode ? `${GOLD}${txt("\u26A1")}${R}` : `${DIM}${txt("\u25AB")}${R}`;
  let VIM = "";
  const vmode = data.vim && data.vim.mode || "";
  if (vmode) {
    const u = vmode.toUpperCase();
    const col = u.startsWith("INS") ? GREEN : u.startsWith("VIS") ? AMBER : CYAN;
    VIM = ` ${col}${u[0] || "?"}${R}`;
  }
  const LEAD = `${FAST}${VIM}`;
  let PET = "";
  if (cfg.pet) {
    let face, col;
    if (COST >= 0.5) {
      face = "[$_$]";
      col = GOLD;
    } else if (PCT >= 85) {
      face = "[>_<]";
      col = RED;
    } else if (PCT >= 70) {
      face = "[o_o]";
      col = AMBER;
    } else if (PCT >= 40) {
      face = "[._.]";
      col = "";
    } else {
      face = "[^_^]";
      col = GREEN;
    }
    PET = `${col}${face}${R} `;
  }
  let MOON = "";
  if (cfg.moon) {
    const days = cfg.nowMs / 864e5 - 10961.26;
    const phase = (days / 29.530589 % 1 + 1) % 1;
    const g = ["\u25CF", "\u25D0", "\u25CB", "\u25D1"][Math.round(phase * 4) % 4];
    MOON = `${DIM}${g}${R} `;
  }
  const clockColour = () => {
    if (!cfg.daynight)
      return DIM;
    const h = new Date(cfg.clockMs).getHours();
    if (h < 5 || h >= 22)
      return tc(90, 110, 170);
    if (h < 8)
      return tc(150, 170, 210);
    if (h < 17)
      return tc(230, 225, 180);
    if (h < 20)
      return tc(235, 165, 90);
    return tc(150, 130, 180);
  };
  const DIR_SEG = `${DIM}${displayPath(CWD)}${R}`;
  const BRANCH = gitOut(CWD, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const DIRTY = countLines(gitOut(CWD, ["status", "--porcelain"]));
  const STAGED = countLines(gitOut(CWD, ["diff", "--cached", "--name-only"]));
  const GIT_ID = gitOut(CWD, ["config", "user.email"]);
  let GIT_AB = "", GIT_AGE = "", GIT_UNTRACKED = "", GIT_STASH = "", BRANCH_MOOD = "";
  let BRANCH_LABEL = BRANCH, GIT_STATE = "", GIT_TODAY = "", GIT_RISK = "";
  if (cfg.gitExtra && BRANCH) {
    if (BRANCH === "HEAD") {
      const sha = gitOut(CWD, ["rev-parse", "--short", "HEAD"]);
      if (sha)
        BRANCH_LABEL = `:${sha}`;
    }
    try {
      let gd = gitOut(CWD, ["rev-parse", "--git-dir"]);
      if (gd) {
        if (!path2.isAbsolute(gd))
          gd = path2.join(CWD, gd);
        if (fs3.existsSync(path2.join(gd, "MERGE_HEAD")))
          GIT_STATE = "merge";
        else if (fs3.existsSync(path2.join(gd, "rebase-merge")) || fs3.existsSync(path2.join(gd, "rebase-apply")))
          GIT_STATE = "rebase";
        else if (fs3.existsSync(path2.join(gd, "CHERRY_PICK_HEAD")))
          GIT_STATE = "cherry";
      }
    } catch {
    }
    const mid = new Date(cfg.clockMs);
    mid.setHours(0, 0, 0, 0);
    const ct2 = parseInt(gitOut(CWD, ["rev-list", "--count", `--since=${idiv(mid.getTime(), 1e3)}`, "HEAD"]), 10);
    if (Number.isFinite(ct2) && ct2 > 0)
      GIT_TODAY = ` ${GREEN}${txt("\u2713")}${ct2}${R}`;
    const ab = gitOut(CWD, ["rev-list", "--count", "--left-right", "@{upstream}...HEAD"]);
    const m = ab.match(/^(\d+)\s+(\d+)$/);
    if (m) {
      const behind = +m[1], ahead = +m[2];
      let s = "";
      if (ahead)
        s += `${GREEN}${txt("\u2191")}${ahead}${R}`;
      if (behind)
        s += `${RED}${txt("\u2193")}${behind}${R}`;
      if (s)
        GIT_AB = `  ${s}`;
    }
    const ct = parseInt(gitOut(CWD, ["log", "-1", "--format=%ct"]), 10);
    if (Number.isFinite(ct) && ct > 0) {
      const secs = Math.max(0, cfg.baseFrame - ct);
      const a = secs < 60 ? `${secs}s` : secs < 3600 ? `${idiv(secs, 60)}m` : secs < 86400 ? `${idiv(secs, 3600)}h` : `${idiv(secs, 86400)}d`;
      GIT_AGE = `  ${DIM}\xB7${a}${R}`;
    }
    const ut = countLines(gitOut(CWD, ["ls-files", "--others", "--exclude-standard"]));
    if (ut > 0)
      GIT_UNTRACKED = `  ${AMBER}?${ut}${R}`;
    const st = countLines(gitOut(CWD, ["stash", "list"]));
    if (st > 0)
      GIT_STASH = ` ${DIM}s:${st}${R}`;
    const tag = /^wip\//i.test(BRANCH) ? "wip" : /^(hotfix|fix)\//i.test(BRANCH) ? "fix" : /^(feat|feature)\//i.test(BRANCH) ? "feat" : /^test\//i.test(BRANCH) ? "test" : "";
    if (tag)
      BRANCH_MOOD = `${DIM}[${tag}]${R} `;
  }
  if (cfg.gitRisk && BRANCH) {
    let s = 0;
    if (DIRTY > 0)
      s += DIRTY >= 10 ? 2 : 1;
    if (countLines(gitOut(CWD, ["stash", "list"])) > 0)
      s += 1;
    const rm = gitOut(CWD, ["rev-list", "--count", "--left-right", "@{upstream}...HEAD"]).match(/^(\d+)\s+(\d+)$/);
    if (rm) {
      if (+rm[1] > 0)
        s += 1;
      if (+rm[2] >= 5)
        s += 1;
    }
    if (GIT_STATE)
      s += 2;
    const level = s >= 4 ? "high" : s >= 2 ? "med" : "low";
    const rc = level === "high" ? RED : level === "med" ? AMBER : GREEN;
    GIT_RISK = `  ${rc}risk:${level}${R}`;
  }
  let CLAUDE_USER = "";
  try {
    const cj = JSON.parse(fs3.readFileSync(`${os3.homedir()}/.claude.json`, "utf8"));
    CLAUDE_USER = cj.oauthAccount && (cj.oauthAccount.displayName || cj.oauthAccount.emailAddress) || "";
  } catch {
  }
  let LAST_FILE = "";
  try {
    if (TRANSCRIPT && fs3.existsSync(TRANSCRIPT)) {
      const lines2 = fs3.readFileSync(TRANSCRIPT, "utf8").split("\n").filter(Boolean).slice(-80);
      const re = /write|edit|read|str_replace|create/;
      for (const line of lines2) {
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (!ev || ev.type !== "assistant" || !ev.message || !Array.isArray(ev.message.content))
          continue;
        for (const c of ev.message.content) {
          if (c && c.type === "tool_use" && typeof c.name === "string" && re.test(c.name)) {
            const p = c.input && (c.input.path || c.input.file_path) || "";
            if (p)
              LAST_FILE = p.split(/[\\/]/).pop();
          }
        }
      }
    }
  } catch {
  }
  const FILE_SEG = LAST_FILE ? ` ${DIM}\u203A ${LAST_FILE}${R}` : "";
  let COMPACT_PCT = "", COMPACT_OFF = false;
  try {
    const st = JSON.parse(fs3.readFileSync(`${os3.homedir()}/.claude/settings.json`, "utf8"));
    if (st.env && st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE)
      COMPACT_PCT = String(st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
    if (st.autoCompactEnabled === false || st.autoCompact === false)
      COMPACT_OFF = true;
  } catch {
  }
  let COMPACT_LABEL, COMPACT_PCT_VAL;
  if (COMPACT_OFF) {
    COMPACT_LABEL = "";
    COMPACT_PCT_VAL = -1;
  } else if (COMPACT_PCT) {
    COMPACT_LABEL = `${DIM} |${COMPACT_PCT}%${R}`;
    COMPACT_PCT_VAL = parseInt(COMPACT_PCT, 10);
  } else {
    COMPACT_LABEL = `${DIM} |95%${R}`;
    COMPACT_PCT_VAL = 95;
  }
  const BAR_WIDTH = 28;
  const FILLED = idiv(PCT * BAR_WIDTH, 100);
  const MARKER_POS = COMPACT_OFF ? -1 : idiv(COMPACT_PCT_VAL * BAR_WIDTH, 100);
  const BAR = drawBar(BAR_WIDTH, FILLED, MARKER_POS, 0);
  const PCT_SEG = `${gradientColor(PCT)}${PCT}%${R}`;
  let TREND_SEG = "";
  if (cfg.trend) {
    const parts = [];
    const spark = sparkline(SPARK2);
    if (spark)
      parts.push(`${DIM}${spark}${R}`);
    if (!COMPACT_OFF && COMPACT_PCT_VAL > 0) {
      const eta = etaMinutes(ETA_SAMPLES, COMPACT_PCT_VAL, PCT);
      if (eta >= 0)
        parts.push(`${gradientColor(PCT)}~${fmtCountdown(eta * 60)}${R}`);
    }
    if (COMPACTIONS > 0)
      parts.push(`${DIM}\u21BA${COMPACTIONS}${R}`);
    TREND_SEG = parts.join(" ");
  }
  const WEATHER_SEG = cfg.weather ? `${gradientColor(PCT)}${weatherWord(PCT, COMPACT_OFF ? 0 : COMPACT_PCT_VAL)}${R}` : "";
  let TURN_SEG = "";
  if (cu != null) {
    const total = CU_INPUT + CU_WRITE + CU_READ;
    let HIT_SEG = "";
    if (total > 0 && CU_READ > 0) {
      const hit = idiv(CU_READ * 100, total);
      const hc = hit >= 70 ? `${BOLD}${GREEN}` : hit >= 40 ? GREEN : `${DIM}${GREEN}`;
      HIT_SEG = `${hc}\u2726${hit}%${R}`;
    }
    const readSeg = CU_READ > 0 ? ` ${GREEN}\u2726${fmtK(CU_READ)}${R}` : "";
    const writeSeg = CU_WRITE > 0 ? ` ${AMBER}+${fmtK(CU_WRITE)}w${R}` : "";
    const inSeg = CU_INPUT > 0 ? ` ${DIM}${txt("\u2193")}${fmtK(CU_INPUT)}${R}` : "";
    const outSeg = CU_OUT > 0 ? ` ${DIM}${txt("\u2191")}${fmtK(CU_OUT)}${R}` : "";
    TURN_SEG = HIT_SEG + readSeg + writeSeg + inSeg + outSeg;
  }
  const COST_FMT = Number(COST).toFixed(3);
  const costNum = parseFloat(COST_FMT);
  const COST_COLOUR = costNum >= 0.5 ? RED : costNum >= 0.1 ? AMBER : GREEN;
  const COST_FLAIR = cfg.costFlair ? (costNum >= 1 ? "!$" : costNum >= 0.5 ? "$$" : costNum >= 0.1 ? "$" : "\xB7") + " " : "";
  let COST_SEG, BAR_PREFIX;
  if (COST_FMT === "0.000") {
    COST_SEG = `${DIM}$0${R}`;
    BAR_PREFIX = `${DIM}\u2205 ${R}`;
  } else {
    const price = `${COST_FLAIR}$${COST_FMT}`;
    COST_SEG = cfg.rainbowStats ? rainbow(price) : `${COST_COLOUR}${price}${R}`;
    BAR_PREFIX = "";
  }
  if (cfg.burn && DURATION_MS >= 6e4 && costNum > 0) {
    const ratePerHr = COST / (DURATION_MS / 36e5);
    COST_SEG += ` ${DIM}$${ratePerHr.toFixed(2)}/hr${R}`;
    try {
      const rates = readHistory().filter((h) => h.dur >= 3e5 && h.cost > 0).map((h) => h.cost / (h.dur / 36e5));
      if (rates.length >= 5) {
        const med = median(rates);
        if (med > 0) {
          const ratio = ratePerHr / med;
          const rc = ratio >= 1.5 ? RED : ratio >= 1.1 ? AMBER : DIM;
          COST_SEG += ` ${rc}${ratio.toFixed(1)}x${R}`;
        }
      }
    } catch {
    }
  }
  const DUR_S = idiv(DURATION_MS, 1e3);
  let AGE_C, AGE_LABEL;
  if (DUR_S >= 7200) {
    AGE_C = RED;
    AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`;
  } else if (DUR_S >= 3600) {
    AGE_C = AMBER;
    AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`;
  } else if (DUR_S >= 60) {
    AGE_C = GREEN;
    AGE_LABEL = `${idiv(DUR_S, 60)}m`;
  } else {
    AGE_C = DIM;
    AGE_LABEL = `${DUR_S}s`;
  }
  const AGE_SEG = cfg.rainbowStats ? rainbow(AGE_LABEL) : `${AGE_C}${AGE_LABEL}${R}`;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dt = new Date(cfg.clockMs);
  const p2 = (n) => String(n).padStart(2, "0");
  const CLOCK_SEG = `${clockColour()}${DAYS[dt.getDay()]} ${p2(dt.getDate())} ${MONTHS[dt.getMonth()]}  ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}${R}`;
  let USAGE_SEG = "";
  if (rl != null) {
    const NOW = cfg.baseFrame;
    const rlSeg = (label, pctIn, resetsAt, phase) => {
      let pct = Math.floor(pctIn || 0);
      if (pct > 100)
        pct = 100;
      const filled = idiv(pct * 10, 100);
      const bar = drawBar(10, filled, -1, phase);
      let pc = gradientColor(pct);
      let warn = "";
      if (cfg.limits) {
        if (pct >= cfg.limitCrit) {
          pc = `${BOLD}${RED}`;
          warn = ` ${BOLD}${RED}LOW${R}`;
        } else if (pct >= cfg.limitWarn) {
          pc = AMBER;
        }
      }
      let secsLeft = 0;
      const ra = typeof resetsAt === "number" ? resetsAt : parseInt(String(resetsAt), 10);
      if (Number.isFinite(ra) && ra > 0)
        secsLeft = ra - NOW;
      const cd = secsLeft <= 0 ? `${DIM}now${R}` : `${DIM}${fmtCountdown(secsLeft)}${R}`;
      return `${DIM}${label}${R} ${bar} ${pc}${pct}%${R}${warn} ${cd}`;
    };
    const fh = rl.five_hour || {}, sd = rl.seven_day || {};
    USAGE_SEG = `${rlSeg("5h", fh.used_percentage, fh.resets_at, 1500)}   ${rlSeg("7d", sd.used_percentage, sd.resets_at, 3e3)}`;
  }
  const HIDE = new Set(cfg.hide.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean));
  if (cfg.privacy) {
    const alias = { email: "email", path: "dir", account: "name", cost: "cost" };
    const toks = cfg.privacyHide ? cfg.privacyHide.split(/[\s,]+/).filter(Boolean) : ["email", "path", "account", "cost"];
    for (const t of toks)
      HIDE.add(alias[t] || t);
  }
  const sh = (name, val) => HIDE.has(name) ? "" : val;
  const SEP = cfg.separator ? ` ${DIM}${cfg.separator}${R} ` : "  ";
  let SYS_SEG = "";
  if (cfg.sysinfo) {
    const la = os3.loadavg()[0];
    if (la > 0)
      SYS_SEG = `${DIM}\u21AF${la.toFixed(2)}${R} `;
  }
  const CTX_SIZE_K = fmtK(MAX_TOK);
  let BRACKET = `${sh("crest", CREST)}${sh("model", MODEL_DISPLAY)}`;
  if (ONEM)
    BRACKET += ` ${ONEM}`;
  if (EFFORT_WORD)
    BRACKET += ` ${sh("effort", EFFORT_WORD)}`;
  if (THINKING_WORD)
    BRACKET += ` ${sh("thinking", THINKING_WORD)}`;
  const L1_LEFT = `${LEAD} ${sh("pet", PET)}${DIM}[${R}${BRACKET}${DIM}]${R}`;
  const L1_RIGHT = `${sh("sysinfo", SYS_SEG)}${sh("moon", MOON)}${sh("clock", CLOCK_SEG)}`;
  const PCT_FULL = WEATHER_SEG ? `${PCT_SEG} ${sh("weather", WEATHER_SEG)}` : PCT_SEG;
  let CTX_STATS = `${DIM}${CTX_SIZE_K}${R}`;
  if (TURN_SEG)
    CTX_STATS += ` ${sh("tokens", TURN_SEG)}`;
  if (TREND_SEG)
    CTX_STATS += `${SEP}${sh("trend", TREND_SEG)}`;
  const L2_LEFT = `${BAR_PREFIX}${BAR}  ${PCT_FULL}${COMPACT_LABEL}${SEP}${CTX_STATS}`;
  const L2_RIGHT = sh("usage", USAGE_SEG);
  let L3_LEFT = `${sh("dir", DIR_SEG)}${sh("file", FILE_SEG)}`;
  let GIT_SEG = "";
  if (BRANCH) {
    GIT_SEG += `  ${BRANCH_MOOD}${CYAN}\u2387 ${BRANCH_LABEL}${R}`;
    if (GIT_STATE)
      GIT_SEG += ` ${BOLD}${RED}${GIT_STATE}!${R}`;
    GIT_SEG += GIT_TODAY;
  }
  GIT_SEG += GIT_AB + GIT_AGE;
  if (GIT_ID && !HIDE.has("email"))
    GIT_SEG += `  ${DIM}${GIT_ID}${R}`;
  if (ADDED > 0 || REMOVED > 0)
    GIT_SEG += `  ${GREEN}+${ADDED}${R}/${RED}-${REMOVED}${R}`;
  if (DIRTY > 0)
    GIT_SEG += `  ${AMBER}~${DIRTY}${R}`;
  if (STAGED > 0)
    GIT_SEG += ` ${GREEN}\u25CF${STAGED}${R}`;
  GIT_SEG += GIT_UNTRACKED + GIT_STASH + GIT_RISK;
  L3_LEFT += sh("git", GIT_SEG);
  let L3_RIGHT = "";
  if (CLAUDE_USER)
    L3_RIGHT = `${sh("name", `${rainbow(CLAUDE_USER)}  `)}`;
  L3_RIGHT += `${sh("cost", COST_SEG)}  ${sh("age", AGE_SEG)}`;
  const J = justified;
  let lines;
  let layout = cfg.layout;
  if (cfg.responsive) {
    const c = termCols();
    layout = c < 70 ? "tiny" : c < 100 ? "1line" : c < 140 ? "2line" : "3line";
  }
  switch (layout) {
    case "tiny":
      lines = [J(`${BAR} ${PCT_SEG}`, sh("cost", COST_SEG))];
      break;
    case "1line":
      lines = [J(`${LEAD} ${BAR}  ${PCT_FULL}  ${BRACKET}`, L3_RIGHT)];
      break;
    case "2line":
      lines = [J(L1_LEFT, L1_RIGHT), J(L2_LEFT, L3_RIGHT)];
      break;
    default:
      lines = [J(L1_LEFT, L1_RIGHT), J(L2_LEFT, L2_RIGHT), J(L3_LEFT, L3_RIGHT)];
  }
  if (cfg.shimmer === "disco") {
    const disco = (line) => {
      const glyphs = [];
      for (const ch of Array.from(stripAnsi(line))) {
        const code = ch.codePointAt(0) || 0;
        if (code >= 65024 && code <= 65039 && glyphs.length)
          glyphs[glyphs.length - 1] += ch;
        else
          glyphs.push(ch);
      }
      let out = "", col = 0;
      for (const g of glyphs) {
        if (g === " ") {
          out += " ";
          col++;
          continue;
        }
        const [r, gg, b] = hueRgb(col * 14 + idiv(cfg.nowMs, 6), 0);
        out += `${tc(r, gg, b)}${g}${R}`;
        col++;
      }
      return out;
    };
    lines = lines.map(disco);
  }
  return lines.join("\n") + "\n";
}
try {
  process.stdout.write(build());
} catch (e) {
  process.stdout.write(`${DIM}claude-statusline: ${e && e.message || "error"}${R}
`);
}
