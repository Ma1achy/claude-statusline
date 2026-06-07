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

// src/ansi.ts
var import_child_process2 = require("child_process");

// src/util.ts
var env = (k, d) => process.env[k] !== void 0 && process.env[k] !== "" ? process.env[k] : d;
var idiv = (a, b) => Math.trunc(a / b);
var mod = (a, b) => (a % b + b) % b;

// src/config.ts
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));

// src/presets.ts
var PRESETS = {
  // Quiet and static: no motion, greyscale, plain bar.
  minimal: { theme: "mono", shimmer: "off", barStyle: "blocks" },
  // Colourful and lively without the joke modes.
  pretty: { theme: "synthwave", shimmer: "wave", crest: true, moon: true, rainbowStats: true },
  // Calm but informative — for long working sessions.
  focus: { theme: "nord", shimmer: "breathe", burn: true, gitExtra: true },
  // Everything loud, on purpose.
  chaos: { shimmer: "disco", theme: "plasma", pet: true, crest: true, costFlair: true, rainbowStats: true },
  // The kitchen-sink showcase used for screenshots/GIFs.
  demo: { theme: "viridis", shimmer: "comet", crest: true, pet: true, moon: true, daynight: true, burn: true, gitExtra: true, rainbowStats: true }
};

// src/git.ts
var import_child_process = require("child_process");
function gitOut(cwd, args) {
  if (!cwd)
    return "";
  try {
    return (0, import_child_process.execFileSync)(
      "git",
      ["-C", cwd, "--no-optional-locks", ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }
    ).trim();
  } catch {
    return "";
  }
}
var countLines = (s) => s ? s.split("\n").filter((l) => l.length).length : 0;

// src/config.ts
var preInput = null;
function loadJson() {
  try {
    const p = process.env.SL_CONFIG || `${os.homedir()}/.claude/statusline.json`;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}
function loadConfig() {
  const nowMs = parseInt(env("SL_FRAME_MS", ""), 10) || Date.now();
  const clockMs = parseInt(env("SL_CLOCK_MS", ""), 10) || nowMs;
  const raw = loadJson();
  const preset = typeof raw.preset === "string" && PRESETS[raw.preset.toLowerCase()] || {};
  const J = { ...preset, ...raw };
  const jstr = (k, d) => typeof J[k] === "string" ? J[k] : d;
  const jbool = (k) => J[k] === true;
  const jint = (k, d) => typeof J[k] === "number" && Number.isFinite(J[k]) ? J[k] : d;
  const jobj = (k) => J[k] && typeof J[k] === "object" && !Array.isArray(J[k]) ? J[k] : void 0;
  const jlist = (k) => (
    // hide / privacyHide: array or string
    Array.isArray(J[k]) ? J[k].join(" ") : typeof J[k] === "string" ? J[k] : ""
  );
  const resolveColorMode = () => {
    if (process.env.NO_COLOR !== void 0 && process.env.NO_COLOR !== "")
      return "mono";
    const m = (process.env.SL_COLOR_MODE || jstr("colorMode", "auto")).toLowerCase();
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
  };
  let shimmer = jstr("shimmer", "sweep");
  if (shimmer === "pulse")
    shimmer = "breathe";
  if (shimmer === "march")
    shimmer = "scan";
  if (jbool("accessible"))
    shimmer = "off";
  let themeName = jstr("theme", "heat");
  const autoTheme = jstr("autoTheme", "");
  if (autoTheme === "daynight") {
    const h = new Date(clockMs).getHours();
    themeName = h >= 7 && h < 19 ? jstr("dayTheme", "heat") : jstr("nightTheme", "tokyonight");
  } else if (autoTheme === "seasonal") {
    const m = new Date(clockMs).getMonth();
    themeName = m <= 1 || m === 11 ? "void" : m <= 4 ? "everforest" : m <= 7 ? "oceanic" : "verdigris";
  } else if (autoTheme === "branch") {
    try {
      if (!process.stdin.isTTY) {
        preInput = JSON.parse(fs.readFileSync(0, "utf8"));
        const cwd = preInput && preInput.workspace && preInput.workspace.current_dir || "";
        const br = gitOut(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
        const bt = jobj("branchThemes") || {};
        if (/^(main|master)$/i.test(br))
          themeName = bt.main || "nord";
        else if (/^(feat|feature)\//i.test(br))
          themeName = bt.feat || "everforest";
        else if (/^hotfix\//i.test(br))
          themeName = bt.hotfix || "heat";
        else if (/^(fix|bugfix)\//i.test(br))
          themeName = bt.fix || "gruvbox";
        else if (/^(exp|experiment)\//i.test(br))
          themeName = bt.exp || "tokyonight";
      }
    } catch {
    }
  }
  const projAliases = jobj("projectAliases");
  return {
    shimmer,
    speed: jint("speed", 3),
    glow: jint("glow", 240),
    waveHue: jint("waveHue", 32),
    easing: jstr("easing", ""),
    themeName,
    barStyle: jstr("barStyle", "blocks"),
    barScale: jstr("barScale", "linear"),
    rainbowMixRaw: typeof J.rainbowMix === "number" ? J.rainbowMix : null,
    margin: jint("margin", 6),
    colorMode: resolveColorMode(),
    themeFile: jstr("themeFile", ""),
    base16: jstr("base16", ""),
    pet: jbool("pet"),
    crest: jbool("crest"),
    moon: jbool("moon"),
    daynight: jbool("daynight"),
    costFlair: jbool("costFlair"),
    burn: jbool("burn"),
    gitExtra: jbool("gitExtra"),
    rainbowStats: jbool("rainbowStats"),
    trend: jbool("trend"),
    weather: jbool("weather"),
    limits: jbool("limits"),
    limitWarn: jint("limitWarn", 80),
    limitCrit: jint("limitCrit", 95),
    layout: jstr("layout", "3line"),
    separator: jstr("separator", ""),
    hide: jlist("hide"),
    privacy: jbool("privacy"),
    privacyHide: jlist("privacyHide"),
    projectAliases: projAliases ? JSON.stringify(projAliases) : jstr("projectAliases", ""),
    path: jstr("path", "auto"),
    sysinfo: jbool("sysinfo"),
    accessible: jbool("accessible"),
    accessibleGauge: jstr("accessibleGauge", "cvd"),
    responsive: jbool("responsive"),
    gitRisk: jbool("gitRisk"),
    danger: jbool("danger"),
    petStyle: jstr("petStyle", "default"),
    petReactsTo: jstr("petReactsTo", ""),
    bell: jbool("bell"),
    nerdfont: jbool("nerdfont"),
    customSegment: jstr("customSegment", ""),
    event: false,
    tmuxPassthrough: jbool("tmuxPassthrough"),
    elements: jobj("elements"),
    glyphs: jobj("glyphs"),
    labels: jobj("labels"),
    customTheme: jobj("customTheme"),
    nowMs,
    clockMs,
    baseFrame: idiv(nowMs, 1e3)
  };
}
var cfg = loadConfig();

// src/ansi.ts
var ESC = "\x1B";
var R = "\x1B[0m";
var DIM = "\x1B[2m";
var BOLD = "\x1B[1m";
var ITALIC = "\x1B[3m";
var UNDERLINE = "\x1B[4m";
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
      (0, import_child_process2.execFileSync)("tput", ["cols"], { encoding: "utf8", stdio: ["inherit", "pipe", "ignore"], windowsHide: true }),
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

// src/cli.ts
var fs3 = __toESM(require("fs"));
var os3 = __toESM(require("os"));
var import_child_process3 = require("child_process");

// src/themes.data.ts
var A11Y_PAL = {
  WHITE: [255, 255, 255],
  // primary text, ~17:1
  GREEN: [0, 255, 0],
  // ~12.7:1
  CYAN: [0, 255, 255],
  // ~14:1
  AMBER: [255, 255, 0],
  // ~16:1 (pure yellow)
  GOLD: [255, 225, 60],
  // bright gold
  BLUE: [120, 190, 255],
  // lightened — pure blue is only ~2:1 on black
  RED: [255, 120, 120]
  // lightened — pure red is only ~4.7:1; this clears 7:1
};
var A11Y_GAUGES = {
  // CVD-safe: the blue→yellow axis survives protan/deutan/tritan colour-blindness;
  // luminance also rises low→high so it reads in greyscale.
  cvd: [[100, 170, 255], [0, 230, 255], [255, 255, 0]],
  // Familiar traffic-light, pushed to max luminance (red lightened to clear AAA).
  traffic: [[0, 255, 0], [255, 255, 0], [255, 120, 120]],
  // Pure luminance — unambiguous for every CVD type and on monochrome displays.
  grayscale: [[160, 160, 160], [205, 205, 205], [255, 255, 255]]
};
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
  "catppuccin-mocha": { cmap: [[137, 180, 250], [148, 226, 213], [166, 227, 161], [249, 226, 175], [250, 179, 135], [243, 139, 168]], mix: 35, palRgb: { RED: [243, 139, 168], GREEN: [166, 227, 161], AMBER: [249, 226, 175], BLUE: [137, 180, 250], CYAN: [148, 226, 213], WHITE: [205, 214, 244], GOLD: [249, 226, 175] } },
  "catppuccin-macchiato": { cmap: [[138, 173, 244], [139, 213, 202], [166, 218, 149], [238, 212, 159], [245, 169, 127], [237, 135, 150]], mix: 35, palRgb: { RED: [237, 135, 150], GREEN: [166, 218, 149], AMBER: [238, 212, 159], BLUE: [138, 173, 244], CYAN: [139, 213, 202], WHITE: [202, 211, 245], GOLD: [238, 212, 159] } },
  "catppuccin-frappe": { cmap: [[140, 170, 238], [129, 200, 190], [166, 209, 137], [229, 200, 144], [239, 159, 118], [231, 130, 132]], mix: 35, palRgb: { RED: [231, 130, 132], GREEN: [166, 209, 137], AMBER: [229, 200, 144], BLUE: [140, 170, 238], CYAN: [129, 200, 190], WHITE: [198, 208, 245], GOLD: [229, 200, 144] } },
  "catppuccin-latte": { cmap: [[30, 102, 245], [23, 146, 153], [64, 160, 43], [223, 142, 29], [254, 100, 11], [210, 15, 57]], mix: 20, palRgb: { RED: [210, 15, 57], GREEN: [64, 160, 43], AMBER: [223, 142, 29], BLUE: [30, 102, 245], CYAN: [23, 146, 153], WHITE: [76, 79, 105], GOLD: [223, 142, 29] } },
  // ── editor palettes ─────────────────────────────────────────────────────────
  "solarized-dark": { cmap: [[38, 139, 210], [42, 161, 152], [133, 153, 0], [181, 137, 0], [203, 75, 22]], mix: 25, palRgb: { RED: [220, 50, 47], GREEN: [133, 153, 0], AMBER: [181, 137, 0], BLUE: [38, 139, 210], CYAN: [42, 161, 152], WHITE: [147, 161, 161], GOLD: [181, 137, 0] } },
  "solarized-light": { cmap: [[38, 139, 210], [42, 161, 152], [133, 153, 0], [181, 137, 0], [203, 75, 22]], mix: 25, palRgb: { RED: [220, 50, 47], GREEN: [133, 153, 0], AMBER: [181, 137, 0], BLUE: [38, 139, 210], CYAN: [42, 161, 152], WHITE: [88, 110, 117], GOLD: [181, 137, 0] } },
  kanagawa: { cmap: [[126, 156, 216], [127, 180, 202], [106, 149, 137], [152, 187, 108], [230, 195, 132], [220, 165, 97]], mix: 30, palRgb: { RED: [195, 64, 67], GREEN: [152, 187, 108], AMBER: [220, 165, 97], BLUE: [126, 156, 216], CYAN: [127, 180, 202], WHITE: [220, 215, 186], GOLD: [230, 195, 132] } },
  everforest: { cmap: [[127, 187, 179], [131, 192, 146], [167, 192, 128], [219, 188, 127], [230, 152, 117], [230, 126, 128]], mix: 28, palRgb: { RED: [230, 126, 128], GREEN: [167, 192, 128], AMBER: [219, 188, 127], BLUE: [127, 187, 179], CYAN: [131, 192, 146], WHITE: [211, 198, 170], GOLD: [219, 188, 127] } },
  onedark: { cmap: [[97, 175, 239], [86, 182, 194], [152, 195, 121], [229, 192, 123], [209, 154, 102], [224, 108, 117]], mix: 30, palRgb: { RED: [224, 108, 117], GREEN: [152, 195, 121], AMBER: [229, 192, 123], BLUE: [97, 175, 239], CYAN: [86, 182, 194], WHITE: [171, 178, 191], GOLD: [229, 192, 123] } },
  "ayu-dark": { cmap: [[89, 194, 255], [149, 230, 203], [170, 217, 76], [255, 180, 84], [240, 113, 120]], mix: 25, palRgb: { RED: [240, 113, 120], GREEN: [170, 217, 76], AMBER: [255, 180, 84], BLUE: [89, 194, 255], CYAN: [149, 230, 203], WHITE: [191, 189, 182], GOLD: [255, 180, 84] } },
  "ayu-mirage": { cmap: [[115, 208, 255], [149, 230, 203], [186, 230, 126], [255, 204, 102], [242, 135, 121]], mix: 25, palRgb: { RED: [242, 135, 121], GREEN: [186, 230, 126], AMBER: [255, 204, 102], BLUE: [115, 208, 255], CYAN: [149, 230, 203], WHITE: [204, 202, 194], GOLD: [255, 204, 102] } },
  "ayu-light": { cmap: [[57, 158, 230], [76, 191, 153], [134, 179, 0], [255, 153, 64], [240, 113, 113]], mix: 18, palRgb: { RED: [240, 113, 113], GREEN: [134, 179, 0], AMBER: [255, 153, 64], BLUE: [57, 158, 230], CYAN: [76, 191, 153], WHITE: [92, 97, 102], GOLD: [255, 153, 64] } },
  "github-dark": { cmap: [[88, 166, 255], [57, 197, 207], [63, 185, 80], [210, 153, 34], [219, 109, 40], [248, 81, 73]], mix: 28, palRgb: { RED: [248, 81, 73], GREEN: [63, 185, 80], AMBER: [210, 153, 34], BLUE: [88, 166, 255], CYAN: [57, 197, 207], WHITE: [201, 209, 217], GOLD: [210, 153, 34] } },
  "github-light": { cmap: [[9, 105, 218], [27, 124, 131], [26, 127, 55], [154, 103, 0], [207, 34, 46]], mix: 18, palRgb: { RED: [207, 34, 46], GREEN: [26, 127, 55], AMBER: [154, 103, 0], BLUE: [9, 105, 218], CYAN: [27, 124, 131], WHITE: [36, 41, 47], GOLD: [154, 103, 0] } },
  monokai: { cmap: [[102, 217, 239], [166, 226, 46], [230, 219, 116], [253, 151, 31], [249, 38, 114]], mix: 22, palRgb: { RED: [249, 38, 114], GREEN: [166, 226, 46], AMBER: [230, 219, 116], BLUE: [174, 129, 255], CYAN: [102, 217, 239], WHITE: [248, 248, 242], GOLD: [253, 151, 31] } },
  "monokai-pro": { cmap: [[120, 220, 232], [169, 220, 118], [255, 216, 102], [252, 152, 103], [255, 97, 136]], mix: 22, palRgb: { RED: [255, 97, 136], GREEN: [169, 220, 118], AMBER: [255, 216, 102], BLUE: [171, 157, 242], CYAN: [120, 220, 232], WHITE: [252, 252, 250], GOLD: [255, 216, 102] } },
  cyberpunk: {
    cmap: [[0, 240, 255], [0, 255, 159], [243, 230, 0], [255, 0, 160]],
    mix: 0,
    palRgb: { RED: [255, 0, 160], GREEN: [0, 255, 159], AMBER: [243, 230, 0], BLUE: [0, 184, 255], CYAN: [0, 240, 255], WHITE: [240, 240, 240], GOLD: [243, 230, 0] },
    // theme-v2 showcase: this theme restyles individual elements (proving the cascade)
    elements: { clock: { fill: "accent" }, "cost.amount": { weight: "bold" } }
  },
  // ── monochrome CRT phosphors (cmap-only → auto-derived accents) ──────────────
  phosphor: { cmap: [[40, 22, 0], [120, 70, 0], [200, 130, 0], [255, 176, 0], [255, 214, 130]], mix: 10 },
  "phosphor-green": { cmap: [[0, 30, 0], [0, 90, 0], [0, 160, 0], [0, 230, 40], [150, 255, 150]], mix: 10 },
  "phosphor-white": { cmap: [[24, 24, 24], [80, 80, 80], [150, 150, 150], [220, 220, 220], [255, 255, 255]], mix: 10 },
  // ── muted / aesthetic (cmap-only) ───────────────────────────────────────────
  verdigris: { cmap: [[193, 154, 107], [184, 115, 51], [125, 140, 74], [67, 150, 140], [94, 140, 106]], mix: 22 },
  "sumi-e": { cmap: [[40, 38, 34], [90, 86, 78], [150, 144, 130], [210, 202, 184], [239, 232, 216]], mix: 15 },
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
  "silver-halide": { cmap: [[40, 42, 46], [90, 94, 100], [150, 154, 160], [210, 214, 220], [245, 247, 250]], mix: 8 },
  // Accessibility palette (SL_ACCESSIBLE) — see A11Y_PAL below. Default gauge is
  // the CVD-safe ramp; SL_ACCESSIBLE_GAUGE swaps it (themes.ts). Paired with motion
  // off (config.ts forces shimmer='off' under SL_ACCESSIBLE).
  "high-contrast": { cmap: A11Y_GAUGES.cvd, mix: 0, palRgb: A11Y_PAL },
  // A demo theme that exercises the per-element typography + animation engine:
  // UPPERCASE bold model, small-caps branch, italic cost, animated name + clock.
  showcase: {
    cmap: [[80, 200, 255], [180, 140, 255], [255, 120, 200]],
    mix: 30,
    elements: {
      "model.tier": { case: "upper", weight: "bold" },
      "git.branch": { font: "smallcaps" },
      "cost.amount": { attrs: ["italic"] },
      "name": { fill: "gradient", anim: { kind: "gradient-cycle" } },
      "clock": { fill: "accent", anim: { kind: "pulse" } }
    }
  }
};

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
var HISTORY_BUCKET_MS = 3e5;
var BURN_BASELINE_MIN_MS = 3e5;
var BURN_MIN_SESSION_MS = 6e4;
var REPORT_MIN_SESSION_MS = 6e4;
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

// src/cli.ts
var SAMPLE = JSON.stringify({
  session_id: "preview",
  model: { id: "claude-opus-4-8", display_name: "Opus" },
  workspace: { current_dir: process.cwd() },
  context_window: { used_percentage: 58, context_window_size: 2e5, current_usage: { cache_read_input_tokens: 61e3, input_tokens: 380, output_tokens: 210 } },
  cost: { total_cost_usd: 0.34, total_duration_ms: 186e4, total_lines_added: 124, total_lines_removed: 18 },
  fast_mode: true,
  rate_limits: { five_hour: { used_percentage: 63, resets_at: 9999999999 }, seven_day: { used_percentage: 38, resets_at: 9999999999 } }
});
function renderBar(env2) {
  try {
    const out = (0, import_child_process3.execFileSync)(process.execPath, [process.argv[1]], {
      input: SAMPLE,
      encoding: "utf8",
      env: { ...process.env, COLUMNS: "120", SL_FRAME_MS: "1700000000123", SL_COLOR_MODE: "truecolor", ...env2 }
    });
    return out.split("\n")[1] || "";
  } catch {
    return `${DIM}(error)${R}`;
  }
}
function runPreview() {
  const pad = (s) => (s + " ".repeat(22)).slice(0, 22);
  const section = (title, rows) => {
    process.stdout.write(`
${BOLD}${title}${R}
`);
    for (const [label, env2] of rows)
      process.stdout.write(`  ${DIM}${pad(label)}${R} ${renderBar(env2)}
`);
  };
  section("Themes (SL_THEME)", Object.keys(THEMES_DATA).map((t) => [t, { SL_THEME: t }]));
  section("Bar styles (SL_BAR_STYLE)", ["blocks", "pacman", "snake", "matrix", "braille", "battery", "thermo", "shade", "lines", "rule", "equalizer", "dna", "train"].map((b) => [b, { SL_BAR_STYLE: b }]));
  section("Shimmer (SL_SHIMMER)", ["sweep", "wave", "comet", "breathe", "scan", "drift", "plasma", "lumin", "heartbeat", "twinkle", "storm", "glitch", "off"].map((s) => [s, { SL_SHIMMER: s }]));
  process.stdout.write("\n");
}
function runDoctor() {
  const ok = (b) => b ? `${ESC}[32m\u2713${R}` : `${ESC}[31m\u2717${R}`;
  const line = (k, v) => {
    process.stdout.write(`  ${DIM}${(k + " ".repeat(16)).slice(0, 16)}${R} ${v}
`);
  };
  process.stdout.write(`${BOLD}claude-statusline --doctor${R}
`);
  const ct = (process.env.COLORTERM || "").toLowerCase();
  const truecolor = ct.includes("truecolor") || ct.includes("24bit");
  let gitVer = "";
  try {
    gitVer = (0, import_child_process3.execFileSync)("git", ["--version"], { encoding: "utf8" }).trim();
  } catch {
  }
  line("node", process.version);
  line("truecolor", `${ok(truecolor)} ${DIM}(COLORTERM=${process.env.COLORTERM || "unset"})${R}`);
  line("resolved mode", cfg.colorMode);
  line("TERM", process.env.TERM || "unset");
  line("tmux", process.env.TMUX ? `${ok(true)} (multiplexer \u2014 truecolor may need passthrough)` : "no");
  line("git", gitVer ? `${ok(true)} ${gitVer}` : `${ok(false)} not found`);
  line("git mode", `${DIM}cached + background refresh (off the hot path; refreshInterval-safe)${R}`);
  line("NO_COLOR", process.env.NO_COLOR ? "set (forces mono)" : "unset");
  const cfgPath = process.env.SL_CONFIG || `${os3.homedir()}/.claude/statusline.json`;
  let cfgFound = false;
  try {
    cfgFound = fs3.existsSync(cfgPath);
  } catch {
  }
  line("config", `${ok(cfgFound)} ${DIM}${cfgPath}${cfgFound ? "" : " (using defaults)"}${R}`);
  line("theme", cfg.themeName);
  line("layout", cfg.layout);
  const warn = [];
  const legacy = Object.keys(process.env).filter((k) => /^SL_/.test(k) && !["SL_CONFIG", "SL_FRAME_MS", "SL_CLOCK_MS", "SL_COLOR_MODE"].includes(k));
  if (legacy.length)
    warn.push(`Legacy ${legacy.join(", ")} ${legacy.length > 1 ? "are" : "is"} ignored \u2014 config moved to JSON. Run \`statusline.js --migrate\` to convert.`);
  if (cfg.colorMode === "mono" && cfg.shimmer === "disco")
    warn.push("disco needs colour but the mode is mono \u2014 animation will be invisible.");
  if (cfg.colorMode !== "truecolor" && cfg.themeName !== "heat")
    warn.push(`Colour mode is ${cfg.colorMode}; themes are approximated below truecolor.`);
  if (warn.length) {
    process.stdout.write(`
${BOLD}Notes${R}
`);
    for (const w of warn)
      process.stdout.write(`  ${ESC}[33m!${R} ${w}
`);
  }
  process.stdout.write("\n");
}
var MIGRATE = {
  SL_THEME: ["theme", "s"],
  SL_SHIMMER: ["shimmer", "s"],
  SL_SPEED: ["speed", "i"],
  SL_GLOW: ["glow", "i"],
  SL_WAVE_HUE: ["waveHue", "i"],
  SL_EASING: ["easing", "s"],
  SL_AUTO_THEME: ["autoTheme", "s"],
  SL_DAY_THEME: ["dayTheme", "s"],
  SL_NIGHT_THEME: ["nightTheme", "s"],
  SL_BAR_STYLE: ["barStyle", "s"],
  SL_BAR_SCALE: ["barScale", "s"],
  SL_RAINBOW_MIX: ["rainbowMix", "i"],
  SL_MARGIN: ["margin", "i"],
  SL_THEME_FILE: ["themeFile", "s"],
  SL_BASE16: ["base16", "s"],
  SL_LAYOUT: ["layout", "s"],
  SL_SEPARATOR: ["separator", "s"],
  SL_HIDE: ["hide", "s"],
  SL_PRIVACY_HIDE: ["privacyHide", "s"],
  SL_PROJECT_ALIASES: ["projectAliases", "j"],
  SL_PATH: ["path", "s"],
  SL_ACCESSIBLE_GAUGE: ["accessibleGauge", "s"],
  SL_PET_STYLE: ["petStyle", "s"],
  SL_PET_REACTS_TO: ["petReactsTo", "s"],
  SL_CUSTOM_SEGMENT: ["customSegment", "s"],
  SL_PRESET: ["preset", "s"],
  SL_LIMIT_WARN: ["limitWarn", "i"],
  SL_LIMIT_CRIT: ["limitCrit", "i"],
  SL_PET: ["pet", "b"],
  SL_CREST: ["crest", "b"],
  SL_MOON: ["moon", "b"],
  SL_DAYNIGHT: ["daynight", "b"],
  SL_COST_FLAIR: ["costFlair", "b"],
  SL_BURN: ["burn", "b"],
  SL_GIT_EXTRA: ["gitExtra", "b"],
  SL_RAINBOW_STATS: ["rainbowStats", "b"],
  SL_TREND: ["trend", "b"],
  SL_WEATHER: ["weather", "b"],
  SL_LIMITS: ["limits", "b"],
  SL_PRIVACY: ["privacy", "b"],
  SL_SYSINFO: ["sysinfo", "b"],
  SL_ACCESSIBLE: ["accessible", "b"],
  SL_RESPONSIVE: ["responsive", "b"],
  SL_GIT_RISK: ["gitRisk", "b"],
  SL_DANGER: ["danger", "b"],
  SL_BELL: ["bell", "b"],
  SL_NERDFONT: ["nerdfont", "b"],
  SL_TMUX_PASSTHROUGH: ["tmuxPassthrough", "b"]
};
function runMigrate() {
  const conf = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === void 0)
      continue;
    if (k.startsWith("SL_BRANCH_")) {
      (conf.branchThemes || (conf.branchThemes = {}))[k.slice(10).toLowerCase()] = v;
      continue;
    }
    const m = MIGRATE[k];
    if (!m)
      continue;
    const [key, t] = m;
    try {
      conf[key] = t === "b" ? /^(on|1|true|yes)$/i.test(v) : t === "i" ? parseInt(v, 10) : t === "j" ? JSON.parse(v) : v;
    } catch {
    }
  }
  process.stdout.write(JSON.stringify(conf, null, 2) + "\n");
}
function runReport() {
  process.stdout.write(`${BOLD}claude-statusline --report${R}
`);
  const hist = readHistory();
  if (!hist.length) {
    process.stdout.write(`  ${DIM}no cross-session history yet (enable "burn" in your config to start recording)${R}
`);
    return;
  }
  const rates = hist.filter((h) => h.dur >= REPORT_MIN_SESSION_MS && h.cost > 0).map((h) => h.cost / (h.dur / 36e5));
  const totalCost = hist.reduce((m, h) => Math.max(m, h.cost), 0);
  const line = (k, v) => {
    process.stdout.write(`  ${DIM}${(k + " ".repeat(18)).slice(0, 18)}${R} ${v}
`);
  };
  line("samples", String(hist.length));
  line("peak cost seen", `$${totalCost.toFixed(2)}`);
  if (rates.length) {
    line("median burn", `$${median(rates).toFixed(2)}/hr`);
    line("fastest burn", `$${Math.max(...rates).toFixed(2)}/hr`);
  }
  line("peak context", `${Math.max(...hist.map((h) => h.ctx))}%`);
  process.stdout.write("\n");
}

// src/io/input.ts
var fs4 = __toESM(require("fs"));
function readInput() {
  if (preInput)
    return preInput;
  let input = "";
  try {
    input = fs4.readFileSync(0, "utf8");
  } catch {
  }
  try {
    return JSON.parse(input) || {};
  } catch {
    return {};
  }
}
function readTail(file, maxBytes) {
  let fd = -1;
  try {
    fd = fs4.openSync(file, "r");
    const size = fs4.fstatSync(fd).size;
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    fs4.readSync(fd, buf, 0, len, size - len);
    let s = buf.toString("utf8");
    if (size > maxBytes) {
      const nl = s.indexOf("\n");
      s = nl >= 0 ? s.slice(nl + 1) : "";
    }
    return s;
  } catch {
    return "";
  } finally {
    if (fd >= 0)
      try {
        fs4.closeSync(fd);
      } catch {
      }
  }
}

// src/io/gitcache.ts
var fs5 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
function readGit(CWD, gc) {
  const branch = gc(["rev-parse", "--abbrev-ref", "HEAD"]);
  const g = {
    branch,
    branchLabel: branch,
    dirty: countLines(gc(["status", "--porcelain"])),
    staged: countLines(gc(["diff", "--cached", "--name-only"])),
    gitId: gc(["config", "user.email"]),
    state: "",
    today: 0,
    ahead: 0,
    behind: 0,
    ageSecs: -1,
    untracked: 0,
    stash: 0,
    mood: "",
    riskLevel: ""
  };
  if (cfg.gitExtra && branch) {
    if (branch === "HEAD") {
      const sha = gc(["rev-parse", "--short", "HEAD"]);
      if (sha)
        g.branchLabel = `:${sha}`;
    }
    try {
      let gd = gc(["rev-parse", "--git-dir"]);
      if (gd) {
        if (!path2.isAbsolute(gd))
          gd = path2.join(CWD, gd);
        if (fs5.existsSync(path2.join(gd, "MERGE_HEAD")))
          g.state = "merge";
        else if (fs5.existsSync(path2.join(gd, "rebase-merge")) || fs5.existsSync(path2.join(gd, "rebase-apply")))
          g.state = "rebase";
        else if (fs5.existsSync(path2.join(gd, "CHERRY_PICK_HEAD")))
          g.state = "cherry";
      }
    } catch {
    }
    const mid = new Date(cfg.clockMs);
    mid.setHours(0, 0, 0, 0);
    const ct2 = parseInt(gc(["rev-list", "--count", `--since=${idiv(mid.getTime(), 1e3)}`, "HEAD"]), 10);
    if (Number.isFinite(ct2) && ct2 > 0)
      g.today = ct2;
    const m = gc(["rev-list", "--count", "--left-right", "@{upstream}...HEAD"]).match(/^(\d+)\s+(\d+)$/);
    if (m) {
      g.behind = +m[1];
      g.ahead = +m[2];
    }
    const ct = parseInt(gc(["log", "-1", "--format=%ct"]), 10);
    if (Number.isFinite(ct) && ct > 0)
      g.ageSecs = Math.max(0, cfg.baseFrame - ct);
    g.untracked = countLines(gc(["ls-files", "--others", "--exclude-standard"]));
    g.stash = countLines(gc(["stash", "list"]));
    g.mood = /^wip\//i.test(branch) ? "wip" : /^(hotfix|fix)\//i.test(branch) ? "fix" : /^(feat|feature)\//i.test(branch) ? "feat" : /^test\//i.test(branch) ? "test" : "";
  }
  if (cfg.gitRisk && branch) {
    let s = 0;
    if (g.dirty > 0)
      s += g.dirty >= 10 ? 2 : 1;
    if (countLines(gc(["stash", "list"])) > 0)
      s += 1;
    const rm = gc(["rev-list", "--count", "--left-right", "@{upstream}...HEAD"]).match(/^(\d+)\s+(\d+)$/);
    if (rm) {
      if (+rm[1] > 0)
        s += 1;
      if (+rm[2] >= 5)
        s += 1;
    }
    if (g.state)
      s += 2;
    g.riskLevel = s >= 4 ? "high" : s >= 2 ? "med" : "low";
  }
  return g;
}
function refreshGitCache(data) {
  const CWD = data.workspace && data.workspace.current_dir || "";
  const gitMemo = {};
  const gc = (args) => {
    const key = args.join(" ");
    if (key in gitMemo)
      return gitMemo[key];
    const v = gitOut(CWD, args);
    gitMemo[key] = v;
    return v;
  };
  try {
    const sk = sessionKey(data);
    readGit(CWD, gc);
    const st2 = readState(sk);
    st2.git = { cwd: CWD, ts: cfg.nowMs, data: gitMemo };
    writeState(sk, st2);
  } catch {
  }
}

// src/build.ts
var os7 = __toESM(require("os"));
var import_child_process5 = require("child_process");

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

// src/themes.ts
var fs6 = __toESM(require("fs"));
var os4 = __toESM(require("os"));

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
  return {
    hueHi: d.hueHi,
    hueLo: d.hueLo,
    sat: d.sat,
    valLo: d.valLo,
    valHi: d.valHi,
    cmap: d.cmap,
    mix: d.mix,
    pal,
    elements: d.elements,
    glyphs: d.glyphs,
    labels: d.labels
  };
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
  if (j.elements && typeof j.elements === "object")
    d.elements = j.elements;
  if (j.glyphs && typeof j.glyphs === "object")
    d.glyphs = j.glyphs;
  if (j.labels && typeof j.labels === "object")
    d.labels = j.labels;
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
    if (cfg.customTheme) {
      const d = coerceThemeData(cfg.customTheme);
      if (d)
        return buildTheme(d);
    }
  } catch {
  }
  try {
    const p = cfg.themeFile || `${os4.homedir()}/.claude/statusline-theme.json`;
    if (fs6.existsSync(p)) {
      const d = coerceThemeData(JSON.parse(fs6.readFileSync(p, "utf8")));
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
var a11yTheme = () => buildTheme({ cmap: A11Y_GAUGES[cfg.accessibleGauge] || A11Y_GAUGES.cvd, mix: 0, palRgb: A11Y_PAL });
var TH = cfg.accessible ? a11yTheme() : CUSTOM || THEMES[cfg.themeName] || THEMES.heat;
var PAL = cfg.colorMode === "mono" ? EMPTY_PAL : TH.pal || deriveCmapPal(TH.cmap);
var { RED, GREEN, AMBER, BLUE, CYAN, WHITE, GOLD } = PAL;
function fgRgb() {
  if (cfg.accessible)
    return A11Y_PAL.WHITE;
  const d = THEMES_DATA[cfg.themeName] || THEMES_DATA.heat;
  if (d.palRgb)
    return d.palRgb.WHITE;
  if (d.palRaw)
    return [229, 229, 229];
  if (d.cmap)
    return [228, 228, 228];
  return [220, 222, 230];
}
function deriveMuted() {
  if (cfg.colorMode === "mono")
    return DIM;
  if (cfg.accessible)
    return tc(150, 170, 210);
  const m = fgRgb().map((v) => Math.max(72, Math.round(v * 0.5)));
  return tc(m[0], m[1], m[2]);
}
function roleOverrides() {
  if (cfg.accessible || cfg.colorMode === "mono")
    return {};
  const d = THEMES_DATA[cfg.themeName];
  if (!d || !d.roles)
    return {};
  const o = {};
  for (const k of Object.keys(d.roles)) {
    const c = d.roles[k];
    if (c)
      o[k] = tc(c[0], c[1], c[2]);
  }
  return o;
}
var ROLES = {
  fg: WHITE,
  muted: deriveMuted(),
  accent: CYAN,
  ok: GREEN,
  warn: AMBER,
  bad: RED,
  info: BLUE,
  gold: GOLD,
  ...roleOverrides()
};
TH.roles = ROLES;
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

// src/textfx.ts
function toCase(s, mode) {
  if (mode === "upper")
    return s.toUpperCase();
  if (mode === "lower")
    return s.toLowerCase();
  if (mode === "title")
    return s.replace(/(^|[^A-Za-z])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  return s;
}
var SMALLCAPS = "\u1D00\u0299\u1D04\u1D05\u1D07\uA730\u0262\u029C\u026A\u1D0A\u1D0B\u029F\u1D0D\u0274\u1D0F\u1D18\uA7AF\u0280\uA731\u1D1B\u1D1C\u1D20\u1D21x\u028F\u1D22";
var SCRIPT_U = { B: "\u212C", E: "\u2130", F: "\u2131", H: "\u210B", I: "\u2110", L: "\u2112", M: "\u2133", R: "\u211B" };
var SCRIPT_L = { e: "\u212F", g: "\u210A", o: "\u2134" };
function mapChar(ch, kind) {
  const c = ch.codePointAt(0) || 0;
  const U = c >= 65 && c <= 90, L = c >= 97 && c <= 122, D = c >= 48 && c <= 57;
  if (kind === "bold") {
    if (U)
      return String.fromCodePoint(119808 + c - 65);
    if (L)
      return String.fromCodePoint(119834 + c - 97);
    if (D)
      return String.fromCodePoint(120782 + c - 48);
  } else if (kind === "italic") {
    if (U)
      return String.fromCodePoint(119860 + c - 65);
    if (ch === "h")
      return "\u210E";
    if (L)
      return String.fromCodePoint(119886 + c - 97);
  } else if (kind === "script") {
    if (U)
      return SCRIPT_U[ch] || String.fromCodePoint(119964 + c - 65);
    if (L)
      return SCRIPT_L[ch] || String.fromCodePoint(119990 + c - 97);
  } else if (kind === "smallcaps") {
    if (L)
      return SMALLCAPS[c - 97];
  }
  return ch;
}
function pseudoFont(s, kind) {
  if (!kind || kind === "none")
    return s;
  let out = "";
  for (const ch of s)
    out += mapChar(ch, kind);
  return out;
}

// src/elements.ts
var ELEMENT_DEFAULTS = {
  "lead.fast": { fill: "gold" },
  "lead.vim": { fill: "accent" },
  "pet": { fill: "ok" },
  "bracket.delim": { fill: "muted" },
  "crest": { fill: "gold" },
  "model.tier": { fill: "accent" },
  "model.version": { fill: "accent" },
  "model.badge1m": { fill: "muted" },
  "effort": { fill: "fg" },
  "thinking": { fill: "muted" },
  "moon": { fill: "muted" },
  "clock": { fill: "muted" },
  "sysinfo": { fill: "muted" },
  "bar.empty": { fill: "muted" },
  "ctx.pct": { fill: "gradient" },
  "ctx.weather": { fill: "gradient" },
  "ctx.size": { fill: "muted" },
  "ctx.compactLabel": { fill: "muted" },
  "trend.spark": { fill: "muted" },
  "trend.eta": { fill: "gradient" },
  "trend.compactions": { fill: "muted" },
  "tokens.hit": { fill: "ok" },
  "tokens.read": { fill: "ok" },
  "tokens.write": { fill: "warn" },
  "tokens.in": { fill: "muted" },
  "tokens.out": { fill: "muted" },
  "usage.label": { fill: "muted" },
  "usage.pct": { fill: "gradient" },
  "usage.warn": { fill: "bad", weight: "bold" },
  "usage.countdown": { fill: "muted" },
  "dir": { fill: "muted" },
  "file": { fill: "muted" },
  "git.branch": { fill: "accent" },
  "git.mood": { fill: "muted" },
  "git.state": { fill: "bad", weight: "bold" },
  "git.today": { fill: "ok" },
  "git.ahead": { fill: "ok" },
  "git.behind": { fill: "bad" },
  "git.age": { fill: "muted" },
  "git.email": { fill: "muted" },
  "git.added": { fill: "ok" },
  "git.removed": { fill: "bad" },
  "git.dirty": { fill: "warn" },
  "git.staged": { fill: "ok" },
  "git.untracked": { fill: "warn" },
  "git.stash": { fill: "muted" },
  "git.risk": { fill: "ok" },
  "name": { fill: "rainbow" },
  "cost.amount": { fill: "ok" },
  "cost.flair": { fill: "ok" },
  "cost.rate": { fill: "muted" },
  "cost.ratio": { fill: "muted" },
  "age": { fill: "ok" },
  "separator": { fill: "muted" }
};

// src/style.ts
var hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function throb(speed) {
  const m = mod(idiv(cfg.nowMs * speed, 16), 100);
  const tri = m < 50 ? m : 100 - m;
  return 0.55 + 0.45 * (tri / 50);
}
function modBright(esc, f) {
  const m = esc.match(/38;2;(\d+);(\d+);(\d+)/);
  if (!m)
    return esc;
  const g = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return tc(g(+m[1]), g(+m[2]), g(+m[3]));
}
function st(id, text, opts = {}) {
  if (text === "")
    return "";
  const d = { ...ELEMENT_DEFAULTS[id], ...TH.elements && TH.elements[id], ...cfg.elements && cfg.elements[id] };
  const a11y = cfg.accessible;
  let fill = opts.role ?? d.fill ?? "fg";
  if (a11y && fill === "rainbow")
    fill = "fg";
  const weight = opts.weight ?? d.weight ?? "normal";
  const anim = a11y ? "none" : d.anim && d.anim.kind || "none";
  const speed = d.anim && d.anim.speed || 1;
  let t = toCase(text, d.case);
  if (!a11y && d.font && d.font !== "none")
    t = pseudoFont(t, d.font);
  let pre = weight === "bold" ? BOLD : weight === "dim" ? DIM : "";
  if (d.attrs)
    for (const a of d.attrs)
      pre += a === "italic" ? ITALIC : a === "underline" ? UNDERLINE : "";
  if (fill === "rainbow" || anim === "rainbow")
    return `${pre}${rainbow(t)}`;
  let pct = opts.pct ?? 0;
  if (anim === "gradient-cycle")
    pct = mod(pct + idiv(cfg.nowMs * speed, 80), 100);
  let colour = fill === "gradient" ? gradientColor(pct) : fill[0] === "#" ? tc(...hexRgb(fill)) : TH.roles && TH.roles[fill] || "";
  if (anim === "pulse" || anim === "breathe" || anim === "wave")
    colour = modBright(colour, throb(speed));
  return `${pre}${colour}${t}${R}`;
}

// src/io/settings.ts
var fs7 = __toESM(require("fs"));
var os5 = __toESM(require("os"));
function readAccountName() {
  try {
    const cj = JSON.parse(fs7.readFileSync(`${os5.homedir()}/.claude.json`, "utf8"));
    return cj.oauthAccount && (cj.oauthAccount.displayName || cj.oauthAccount.emailAddress) || "";
  } catch {
    return "";
  }
}
function readAutocompact() {
  let pct = "", off = false;
  try {
    const s = JSON.parse(fs7.readFileSync(`${os5.homedir()}/.claude/settings.json`, "utf8"));
    if (s.env && s.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE)
      pct = String(s.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
    if (s.autoCompactEnabled === false || s.autoCompact === false)
      off = true;
  } catch {
  }
  return { pct, off };
}

// src/io/tick.ts
var GIT_TTL = 2500;
function persistTick(data, CWD, PCT, COST, DURATION_MS) {
  let gitMemo = {};
  let kickRefresh = false;
  let SPARK2 = [], COMPACTIONS = 0, ETA_SAMPLES = [], BELL = "";
  try {
    const sk = sessionKey(data);
    const st2 = readState(sk);
    let gitFresh = false;
    if (st2.git && st2.git.cwd === CWD) {
      gitMemo = { ...st2.git.data };
      gitFresh = cfg.nowMs - st2.git.ts < GIT_TTL;
    }
    if (CWD && !gitFresh && cfg.nowMs - (st2.lastGitRefresh || 0) > GIT_TTL) {
      kickRefresh = true;
      st2.lastGitRefresh = cfg.nowMs;
    }
    if (cfg.bell) {
      const lvl = PCT >= 95 ? 2 : PCT >= 80 ? 1 : 0;
      if (lvl > (st2.bellLevel ?? 0))
        BELL = "\x07";
      st2.bellLevel = lvl;
    }
    const prev = st2.spark.length ? st2.spark[st2.spark.length - 1] : -1;
    if (prev >= 0 && PCT !== prev)
      cfg.event = true;
    if (prev >= 0 && PCT <= prev - 25)
      st2.compactions += 1;
    pushSpark(st2, PCT);
    st2.etaSamples = (st2.etaSamples || []).concat([[DURATION_MS, PCT]]).slice(-20);
    const bucket = idiv(DURATION_MS, HISTORY_BUCKET_MS);
    if (cfg.burn && COST > 0 && bucket > (st2.histBucket ?? -1)) {
      st2.histBucket = bucket;
      appendHistory({ t: cfg.nowMs, cost: COST, ctx: PCT, dur: DURATION_MS });
    }
    writeState(sk, st2);
    SPARK2 = st2.spark.slice();
    COMPACTIONS = st2.compactions;
    ETA_SAMPLES = st2.etaSamples;
  } catch {
  }
  return { gitMemo, kickRefresh, SPARK: SPARK2, COMPACTIONS, ETA_SAMPLES, BELL };
}

// src/segments/path.ts
var os6 = __toESM(require("os"));
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
  const home = os6.homedir();
  if (home && (p === home || p.startsWith(home + "/")))
    p = "~" + p.slice(home.length);
  const parts = p.split("/").filter(Boolean);
  if (parts.length > 5)
    p = `${p.startsWith("/") ? "/" : ""}${parts[0]}/\u2026/${parts.slice(-2).join("/")}`;
  return p;
}

// src/segments/pet.ts
var PET_FACES = {
  default: ["[^_^]", "[._.]", "[o_o]", "[>_<]", "[$_$]"],
  cat: ["=^_^=", "=._.=", "=o_o=", "=>_<=", "=$_$="],
  frog: ["(^_^)", "(o_o)", "(._.)", "(O_O)", "(>_<)"],
  robot: ["[0_0]", "[o_o]", "[._.]", "[!_!]", "[x_x]"],
  ghost: ["<^_^>", "<o_o>", "<._.>", "<!_!>", "<x_x>"],
  slime: ["(~_~)", "(o_o)", "(._.)", "(>_<)", "(@_@)"],
  dog: ["[^o^]", "[^.^]", "[-.-]", "[>n<]", "[ToT]"]
};
function buildPet(COST, DIRTY, PCT) {
  if (!cfg.pet)
    return "";
  let lvl;
  switch (cfg.petReactsTo) {
    case "cost":
      lvl = COST >= 2 ? 4 : COST >= 1 ? 3 : COST >= 0.5 ? 2 : COST >= 0.1 ? 1 : 0;
      break;
    case "git":
      lvl = DIRTY > 10 ? 4 : DIRTY >= 6 ? 3 : DIRTY >= 3 ? 2 : DIRTY >= 1 ? 1 : 0;
      break;
    case "time": {
      const h = new Date(cfg.clockMs).getHours();
      lvl = h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : h < 22 ? 3 : 0;
      break;
    }
    case "random":
      lvl = (Math.imul(idiv(cfg.nowMs, 3e3), 2654435761) >>> 0) % 5;
      break;
    case "context":
      lvl = PCT >= 95 ? 4 : PCT >= 85 ? 3 : PCT >= 70 ? 2 : PCT >= 40 ? 1 : 0;
      break;
    default:
      lvl = COST >= 0.5 ? 4 : PCT >= 85 ? 3 : PCT >= 70 ? 2 : PCT >= 40 ? 1 : 0;
  }
  const faces = PET_FACES[cfg.petStyle] || PET_FACES.default;
  const role = ["ok", "fg", "warn", "bad", "gold"][lvl];
  return `${st("pet", faces[lvl], { role })} `;
}

// src/anim/shimmers.ts
var hashI = (n) => Math.imul(n >>> 0, 2654435761) >>> 0;
var torus = (sx, c) => {
  const d = Math.abs(sx - c.posc);
  return Math.min(d, c.wrap - d);
};
var MORSE = { C: "-.-.", L: ".-..", A: ".-", U: "..-", D: "-..", E: "." };
var MORSE_SEQ = (() => {
  const out = [];
  const push = (on, n) => {
    for (let i = 0; i < n; i++)
      out.push(on);
  };
  const word = "CLAUDE".split("");
  word.forEach((ch, li) => {
    const code = MORSE[ch] || "";
    code.split("").forEach((sym, si) => {
      push(true, sym === "-" ? 3 : 1);
      if (si < code.length - 1)
        push(false, 1);
    });
    push(false, li < word.length - 1 ? 3 : 7);
  });
  return out;
})();
var HUE_SHIMMERS = {
  sweep(sx, c) {
    const dc = torus(sx, c);
    return dc < c.glow ? idiv(c.waveHue * (c.glow - dc) * (c.glow - dc), c.glow * c.glow) : 0;
  },
  wave(sx, c) {
    const dc = torus(sx, c);
    return dc < 450 ? idiv(c.waveHue * (450 - dc), 450) : 0;
  },
  comet(sx, c) {
    let hoff = 0;
    const lead = mod(c.posc - sx, c.wrap);
    if (lead < 420)
      hoff = idiv(c.waveHue * (420 - lead), 420);
    if (torus(sx, c) < 70)
      hoff = c.waveHue;
    return hoff;
  },
  scan(sx, c) {
    const dc = Math.abs(sx - c.posc);
    return dc < 140 ? idiv(c.waveHue * (140 - dc), 140) : 0;
  },
  breathe(_sx, c) {
    return c.hglob;
  },
  drift(sx, c) {
    return idiv(c.waveHue * c.tri(idiv(sx, 8) + idiv(c.t * c.speed, 25)), 100);
  },
  plasma(sx, c) {
    return idiv(c.waveHue * (c.tri(idiv(sx, 6) + idiv(c.t, 30)) + c.tri(idiv(sx, 11) - idiv(c.t, 45))), 200);
  },
  glitch(sx, c) {
    const bk = idiv(c.t, 220);
    if (hashI(sx * 13 + bk) % 100 < 12)
      return hashI(sx + bk) % 2 ? c.waveHue * 3 : -c.waveHue * 2;
    return 0;
  }
};
HUE_SHIMMERS.aurora = HUE_SHIMMERS.drift;
var BRIGHT_SHIMMERS = {
  lumin(_sx, c) {
    return 55 + idiv(45 * c.tri(idiv(c.t, 12)), 100);
  },
  heartbeat(_sx, c) {
    const m = mod(c.t, 1400);
    const bump = (k, w) => {
      const d = Math.abs(m - k);
      return d < w ? w - d : 0;
    };
    return 70 + idiv(60 * Math.max(bump(150, 150), bump(450, 120)), 150);
  },
  twinkle(sx, c) {
    return hashI(sx * 29 + idiv(c.t, 180)) % 100 < 14 ? 165 : 75;
  },
  storm(sx, c) {
    const flash = mod(idiv(c.t * c.speed, 8), c.wrap);
    const d = Math.abs(sx - flash);
    const dd = Math.min(d, c.wrap - d);
    let bf = dd < 120 ? 150 : 68;
    if (hashI(idiv(c.t, 400)) % 100 < 8)
      bf = 185;
    return bf;
  },
  morse(_sx, c) {
    return MORSE_SEQ[idiv(c.t, 160) % MORSE_SEQ.length] ? 100 : 22;
  },
  flash(_sx, c) {
    return c.event ? 175 : 100;
  },
  // bright pulse the tick the % changes
  ripple(sx, c) {
    return c.event ? Math.abs(sx - c.filled * 100) < 250 ? 175 : 88 : 88;
  }
  // ring at the fill edge on update
};

// src/bar.ts
var MATRIX_CHARS = "01<>{}[]/\\|=+*".split("");
var EQ = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588".split("");
var SHADE = "\u2591\u2592\u2593\u2588".split("");
var hashI2 = (n) => Math.imul(n >>> 0, 2654435761) >>> 0;
function scaleCells(pct, width) {
  const p = Math.max(0, Math.min(100, pct));
  if (cfg.barScale === "log" || cfg.barScale === "compact")
    return Math.round(width * (p / 100) * (p / 100));
  return idiv(p * width, 100);
}
function drawBar(width, filled, marker, phaseMs = 0) {
  const { shimmer, speed, glow, waveHue, barStyle, nowMs, baseFrame, colorMode } = cfg;
  const t = nowMs + phaseMs;
  let span = filled;
  if (span < 1)
    span = 1;
  let posc = 0, hglob = 0;
  const wrap = span * 100;
  const tri = (x) => {
    const m = mod(Math.round(x), 200);
    return m < 100 ? m : 200 - m;
  };
  if (shimmer === "sweep" || shimmer === "comet" || shimmer === "wave") {
    posc = mod(idiv(t * speed, 10), wrap);
    if (cfg.easing) {
      const f = posc / wrap;
      let e = f;
      if (cfg.easing === "ease")
        e = f * f * (3 - 2 * f);
      else if (cfg.easing === "bounce") {
        const g = 1 - f;
        e = 1 - g * g * Math.abs(Math.cos(g * 6));
      } else if (cfg.easing === "elastic")
        e = Math.max(0, Math.min(1, f + 0.12 * Math.sin(f * 12)));
      posc = mod(Math.round(e * wrap), wrap);
    }
  } else if (shimmer === "scan") {
    let cyclec = span * 200;
    if (cyclec < 1)
      cyclec = 1;
    posc = mod(idiv(t * speed, 10), cyclec);
    if (posc >= span * 100)
      posc = span * 200 - posc;
  } else if (shimmer === "breathe") {
    let trib = mod(t, 2600);
    if (trib >= 1300)
      trib = 2600 - trib;
    hglob = idiv(waveHue * trib, 1300);
  }
  const snakeHead = idiv(mod(idiv(t * speed, 10), span * 100), 100);
  const sctx = { t, speed, wrap, glow, waveHue, posc, hglob, filled, event: cfg.event, tri };
  const px = (sx) => {
    if (shimmer === "disco")
      return hsv(idiv(sx * 3, 10) + idiv(t, 30), 95, 92);
    let posp = idiv(sx, width);
    if (posp > 100)
      posp = 100;
    if (posp < 0)
      posp = 0;
    const hoff = HUE_SHIMMERS[shimmer]?.(sx, sctx) ?? 0;
    let base;
    if (TH.cmap) {
      const c = cmapSample(TH.cmap, posp);
      base = hoff ? shiftHue(c, hoff) : c;
    } else {
      const bh = TH.hueHi - idiv(posp * (TH.hueHi - TH.hueLo), 100);
      const vv = TH.valLo + idiv((TH.valHi - TH.valLo) * posp, 100);
      base = hsv(bh + hoff, TH.sat, vv);
    }
    const bf = BRIGHT_SHIMMERS[shimmer]?.(sx, sctx) ?? 100;
    if (bf !== 100)
      base = [Math.min(255, idiv(base[0] * bf, 100)), Math.min(255, idiv(base[1] * bf, 100)), Math.min(255, idiv(base[2] * bf, 100))];
    return base;
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
        out += `${ROLES.muted}\xB7${R}`;
      continue;
    }
    if (barStyle === "snake") {
      if (isFill)
        out += i === snakeHead ? `${ESC}[1m${fg(i * 100 + 50)}@${R}` : `${fg(i * 100 + 50)}~${R}`;
      else
        out += `${ROLES.muted}\xB7${R}`;
      continue;
    }
    if (barStyle === "matrix") {
      if (isFill)
        out += `${fg(i * 100 + 50)}\u2588${R}`;
      else
        out += `${dimFg(0, 120, 0)}${MATRIX_CHARS[hashI2(i * 131 + baseFrame) % MATRIX_CHARS.length]}${R}`;
      continue;
    }
    if (barStyle === "braille") {
      out += isFill ? `${fg(i * 100 + 50)}\u28FF${R}` : `${ROLES.muted}\u2804${R}`;
      continue;
    }
    if (barStyle === "battery") {
      out += isFill ? `${fg(i * 100 + 50)}\u2588${R}` : `${ROLES.muted}\u2591${R}`;
      continue;
    }
    if (barStyle === "thermo") {
      out += isFill ? `${fg(i * 100 + 50)}\u25B0${R}` : `${ROLES.muted}\u25B1${R}`;
      continue;
    }
    if (barStyle === "shade") {
      if (isFill)
        out += `${fg(i * 100 + 50)}${SHADE[Math.min(3, idiv(i * 4, span))]}${R}`;
      else
        out += `${ROLES.muted}\u2591${R}`;
      continue;
    }
    if (barStyle === "lines" || barStyle === "minimal") {
      out += isFill ? `${fg(i * 100 + 50)}\u2501${R}` : `${ROLES.muted}\u2500${R}`;
      continue;
    }
    if (barStyle === "rule") {
      if (isFill)
        out += `${fg(i * 100 + 50)}${i % 5 === 0 ? "\u253C" : "\u2500"}${R}`;
      else
        out += `${ROLES.muted}${i % 5 === 0 ? "\u250A" : "\u2504"}${R}`;
      continue;
    }
    if (barStyle === "equalizer" || barStyle === "waveform") {
      if (isFill)
        out += `${fg(i * 100 + 50)}${EQ[hashI2(i * 17 + idiv(nowMs, 140)) % 8]}${R}`;
      else
        out += `${ROLES.muted}\u2581${R}`;
      continue;
    }
    if (barStyle === "dna") {
      if (isFill)
        out += `${fg(i * 100 + 50)}${(i + idiv(nowMs, 200)) % 2 ? "X" : "x"}${R}`;
      else
        out += `${ROLES.muted}\xB7${R}`;
      continue;
    }
    if (barStyle === "train") {
      if (isFill && i === filled - 1)
        out += `${ESC}[1m${fg(i * 100 + 50)}O${R}`;
      else if (isFill)
        out += `${fg(i * 100 + 50)}=${R}`;
      else
        out += `${ROLES.muted}-${R}`;
      continue;
    }
    if (isFill && shimmer === "disco") {
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
      out += `${ROLES.muted}\u2591${R}`;
  }
  return out;
}

// src/segments/usage.ts
function buildUsage(rl) {
  const NOW = cfg.baseFrame;
  const rlSeg = (label, pctIn, resetsAt, phase) => {
    let pct = Math.floor(pctIn || 0);
    if (pct > 100)
      pct = 100;
    const bar = drawBar(10, scaleCells(pct, 10), -1, phase);
    let pctStr, warn = "";
    if (cfg.limits && pct >= cfg.limitCrit) {
      pctStr = st("usage.pct", `${pct}%`, { role: "bad", weight: "bold" });
      warn = ` ${st("usage.warn", "LOW")}`;
    } else if (cfg.limits && pct >= cfg.limitWarn) {
      pctStr = st("usage.pct", `${pct}%`, { role: "warn" });
    } else
      pctStr = st("usage.pct", `${pct}%`, { pct });
    let secsLeft = 0;
    const ra = typeof resetsAt === "number" ? resetsAt : parseInt(String(resetsAt), 10);
    if (Number.isFinite(ra) && ra > 0)
      secsLeft = ra - NOW;
    const cd = st("usage.countdown", secsLeft <= 0 ? "now" : fmtCountdown(secsLeft));
    return `${st("usage.label", label)} ${bar} ${pctStr}${warn} ${cd}`;
  };
  const fh = rl.five_hour || {}, sd = rl.seven_day || {};
  return `${rlSeg("5h", fh.used_percentage, fh.resets_at, 1500)}   ${rlSeg("7d", sd.used_percentage, sd.resets_at, 3e3)}`;
}

// src/segments/model.ts
function buildModel(MODEL_ID, MODEL_NAME, MAX_TOK) {
  const idl = MODEL_ID.toLowerCase();
  let TIER = "Sonnet", modelRole = "accent";
  if (idl.includes("haiku")) {
    TIER = "Haiku";
    modelRole = "info";
  } else if (idl.includes("opus")) {
    TIER = "Opus";
    modelRole = "gold";
  }
  const vm = idl.match(/(opus|sonnet|haiku)-(\d+)-(\d+)/);
  const MODEL_VER = vm ? `${vm[2]}.${vm[3]}` : "";
  const display = st("model.tier", MODEL_VER ? `${TIER} ${MODEL_VER}` : MODEL_NAME, { role: modelRole });
  const oneM = MAX_TOK >= 9e5 ? st("model.badge1m", "1M") : "";
  let crest = "";
  if (cfg.crest) {
    const g = TIER === "Opus" ? "\u2605" : TIER === "Haiku" ? "\u25B2" : "\u25C6";
    crest = st("crest", g, { role: modelRole }) + " ";
  }
  return { display, oneM, crest };
}
function buildEffort(EFFORT, THINKING) {
  let effortRole = "fg", effortWeight = "normal", effortText = "";
  switch (EFFORT) {
    case "low":
      effortWeight = "dim";
      effortText = "low";
      break;
    case "medium":
      effortWeight = "dim";
      effortText = "med";
      break;
    case "high":
      effortText = "high";
      break;
    case "xhigh":
      effortRole = "warn";
      effortText = "xhigh";
      break;
    case "max":
      effortRole = "bad";
      effortWeight = "bold";
      effortText = "MAX";
      break;
  }
  const word = effortText ? st("effort", effortText, { role: effortRole, weight: effortWeight }) : "";
  const thinking = THINKING ? st("thinking", "thinking", { role: effortRole, weight: "dim" }) : "";
  return { word, thinking };
}

// src/segments/lead.ts
function buildLead(data) {
  const FAST = data.fast_mode ? st("lead.fast", txt("\u26A1")) : st("lead.fast", txt("\u25AB"), { role: "muted" });
  let VIM = "";
  const vmode = data.vim && data.vim.mode || "";
  if (vmode) {
    const u = vmode.toUpperCase();
    const role = u.startsWith("INS") ? "ok" : u.startsWith("VIS") ? "warn" : "accent";
    VIM = ` ${st("lead.vim", u[0] || "?", { role })}`;
  }
  return `${FAST}${VIM}`;
}

// src/segments/clock.ts
function clockColour() {
  if (!cfg.daynight)
    return ROLES.muted;
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
}
var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function buildClock() {
  let moon = "";
  if (cfg.moon) {
    const days = cfg.nowMs / 864e5 - 10961.26;
    const phase = (days / 29.530589 % 1 + 1) % 1;
    const g = ["\u25CF", "\u25D0", "\u25CB", "\u25D1"][Math.round(phase * 4) % 4];
    moon = `${st("moon", g)} `;
  }
  const dt = new Date(cfg.clockMs);
  const p2 = (n) => String(n).padStart(2, "0");
  const clock = `${clockColour()}${DAYS[dt.getDay()]} ${p2(dt.getDate())} ${MONTHS[dt.getMonth()]}  ${p2(dt.getHours())}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())}${R}`;
  return { clock, moon };
}

// src/segments/context.ts
var BAR_WIDTH = 28;
function buildContext(PCT, compactPctRaw, compactOff, SPARK2, ETA_SAMPLES, COMPACTIONS) {
  let compactLabel, compactPctVal;
  if (compactOff) {
    compactLabel = "";
    compactPctVal = -1;
  } else if (compactPctRaw) {
    compactLabel = st("ctx.compactLabel", ` |${compactPctRaw}%`);
    compactPctVal = parseInt(compactPctRaw, 10);
  } else {
    compactLabel = st("ctx.compactLabel", " |95%");
    compactPctVal = 95;
  }
  const FILLED = scaleCells(PCT, BAR_WIDTH);
  const MARKER_POS = compactOff ? -1 : scaleCells(compactPctVal, BAR_WIDTH);
  const bar = drawBar(BAR_WIDTH, FILLED, MARKER_POS, 0);
  const pctSeg = st("ctx.pct", `${PCT}%`, { pct: PCT });
  let trend = "";
  if (cfg.trend) {
    const parts = [];
    const spark = sparkline(SPARK2);
    if (spark)
      parts.push(st("trend.spark", spark));
    if (!compactOff && compactPctVal > 0) {
      const eta = etaMinutes(ETA_SAMPLES, compactPctVal, PCT);
      if (eta >= 0)
        parts.push(st("trend.eta", `~${fmtCountdown(eta * 60)}`, { pct: PCT }));
    }
    if (COMPACTIONS > 0)
      parts.push(st("trend.compactions", `\u21BA${COMPACTIONS}`));
    trend = parts.join(" ");
  }
  const weather = cfg.weather ? st("ctx.weather", weatherWord(PCT, compactOff ? 0 : compactPctVal), { pct: PCT }) : "";
  return { bar, pctSeg, trend, weather, compactLabel };
}

// src/segments/tokens.ts
function buildTokens(cu) {
  if (cu == null)
    return "";
  const CU_READ = cu.cache_read_input_tokens || 0;
  const CU_WRITE = cu.cache_creation_input_tokens || 0;
  const CU_INPUT = cu.input_tokens || 0;
  const CU_OUT = cu.output_tokens || 0;
  const total = CU_INPUT + CU_WRITE + CU_READ;
  let HIT_SEG = "";
  if (total > 0 && CU_READ > 0) {
    const hit = idiv(CU_READ * 100, total);
    HIT_SEG = st("tokens.hit", `\u2726${hit}%`, { weight: hit >= 70 ? "bold" : hit >= 40 ? "normal" : "dim" });
  }
  const readSeg = CU_READ > 0 ? ` ${st("tokens.read", `\u2726${fmtK(CU_READ)}`)}` : "";
  const writeSeg = CU_WRITE > 0 ? ` ${st("tokens.write", `+${fmtK(CU_WRITE)}w`)}` : "";
  const inSeg = CU_INPUT > 0 ? ` ${st("tokens.in", `${txt("\u2193")}${fmtK(CU_INPUT)}`)}` : "";
  const outSeg = CU_OUT > 0 ? ` ${st("tokens.out", `${txt("\u2191")}${fmtK(CU_OUT)}`)}` : "";
  return HIT_SEG + readSeg + writeSeg + inSeg + outSeg;
}

// src/segments/cost.ts
function buildCost(COST, DURATION_MS) {
  const COST_FMT = Number(COST).toFixed(3);
  const costNum = parseFloat(COST_FMT);
  const costRole = costNum >= 0.5 ? "bad" : costNum >= 0.1 ? "warn" : "ok";
  const COST_FLAIR = cfg.costFlair ? (costNum >= 1 ? "!$" : costNum >= 0.5 ? "$$" : costNum >= 0.1 ? "$" : "\xB7") + " " : "";
  let seg, barPrefix;
  if (COST_FMT === "0.000") {
    seg = st("cost.amount", "$0", { role: "muted" });
    barPrefix = `${ROLES.muted}\u2205 ${R}`;
  } else {
    const price = `${COST_FLAIR}$${COST_FMT}`;
    seg = cfg.rainbowStats && !cfg.accessible ? rainbow(price) : st("cost.amount", price, { role: costRole });
    barPrefix = "";
  }
  if (cfg.burn && DURATION_MS >= BURN_MIN_SESSION_MS && costNum > 0) {
    const ratePerHr = COST / (DURATION_MS / 36e5);
    seg += ` ${st("cost.rate", `$${ratePerHr.toFixed(2)}/hr`)}`;
    try {
      const rates = readHistory().filter((h) => h.dur >= BURN_BASELINE_MIN_MS && h.cost > 0).map((h) => h.cost / (h.dur / 36e5));
      if (rates.length >= 5) {
        const med = median(rates);
        if (med > 0) {
          const ratio = ratePerHr / med;
          const rRole = ratio >= 1.5 ? "bad" : ratio >= 1.1 ? "warn" : "muted";
          seg += ` ${st("cost.ratio", `${ratio.toFixed(1)}x`, { role: rRole })}`;
        }
      }
    } catch {
    }
  }
  return { seg, barPrefix };
}
function buildAge(DURATION_MS) {
  const DUR_S = idiv(DURATION_MS, 1e3);
  let ageRole, AGE_LABEL;
  if (DUR_S >= 7200) {
    ageRole = "bad";
    AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`;
  } else if (DUR_S >= 3600) {
    ageRole = "warn";
    AGE_LABEL = `${idiv(DUR_S, 3600)}h ${idiv(DUR_S % 3600, 60)}m`;
  } else if (DUR_S >= 60) {
    ageRole = "ok";
    AGE_LABEL = `${idiv(DUR_S, 60)}m`;
  } else {
    ageRole = "muted";
    AGE_LABEL = `${DUR_S}s`;
  }
  return cfg.rainbowStats && !cfg.accessible ? rainbow(AGE_LABEL) : st("age", AGE_LABEL, { role: ageRole });
}

// src/segments/git.ts
function buildGitSeg(G, ADDED, REMOVED, hideEmail) {
  const GIT_TODAY = G.today > 0 ? ` ${st("git.today", `${txt("\u2713")}${G.today}`)}` : "";
  let GIT_AB = "";
  {
    let s = "";
    if (G.ahead)
      s += st("git.ahead", `${txt("\u2191")}${G.ahead}`);
    if (G.behind)
      s += st("git.behind", `${txt("\u2193")}${G.behind}`);
    if (s)
      GIT_AB = `  ${s}`;
  }
  let GIT_AGE = "";
  if (G.ageSecs >= 0) {
    const secs = G.ageSecs;
    const a = secs < 60 ? `${secs}s` : secs < 3600 ? `${idiv(secs, 60)}m` : secs < 86400 ? `${idiv(secs, 3600)}h` : `${idiv(secs, 86400)}d`;
    GIT_AGE = `  ${st("git.age", `\xB7${a}`)}`;
  }
  const GIT_UNTRACKED = G.untracked > 0 ? `  ${st("git.untracked", `?${G.untracked}`)}` : "";
  const GIT_STASH = G.stash > 0 ? ` ${st("git.stash", `s:${G.stash}`)}` : "";
  const BRANCH_MOOD = G.mood ? `${st("git.mood", `[${G.mood}]`)} ` : "";
  const riskRole = G.riskLevel === "high" ? "bad" : G.riskLevel === "med" ? "warn" : "ok";
  const GIT_RISK = G.riskLevel ? `  ${st("git.risk", `risk:${G.riskLevel}`, { role: riskRole })}` : "";
  let GIT_SEG = "";
  if (G.branch) {
    GIT_SEG += `  ${BRANCH_MOOD}${st("git.branch", `${cfg.nerdfont ? "" : "\u2387"} ${G.branchLabel}`)}`;
    if (G.state)
      GIT_SEG += ` ${st("git.state", `${G.state}!`)}`;
    GIT_SEG += GIT_TODAY;
  }
  GIT_SEG += GIT_AB + GIT_AGE;
  if (G.gitId && !hideEmail)
    GIT_SEG += `  ${st("git.email", G.gitId)}`;
  if (ADDED > 0 || REMOVED > 0)
    GIT_SEG += `  ${st("git.added", `+${ADDED}`)}/${st("git.removed", `-${REMOVED}`)}`;
  if (G.dirty > 0)
    GIT_SEG += `  ${st("git.dirty", `~${G.dirty}`)}`;
  if (G.staged > 0)
    GIT_SEG += ` ${st("git.staged", `\u25CF${G.staged}`)}`;
  GIT_SEG += GIT_UNTRACKED + GIT_STASH + GIT_RISK;
  return GIT_SEG;
}

// src/segments/custom.ts
var import_child_process4 = require("child_process");
var TIMEOUT_MS = 250;
var MAX_LEN = 240;
function buildCustom(data) {
  if (!cfg.customSegment)
    return "";
  try {
    const out = (0, import_child_process4.execFileSync)(process.execPath, [cfg.customSegment], {
      input: JSON.stringify(data),
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true
    });
    const first = (out.split("\n")[0] || "").slice(0, MAX_LEN);
    if (first)
      return `  ${first}`;
  } catch {
  }
  return "";
}

// src/segments/lastfile.ts
var fs8 = __toESM(require("fs"));
var TAIL_BYTES = 262144;
var MAX_LINES = 80;
function buildLastFile(TRANSCRIPT) {
  let LAST_FILE = "";
  try {
    if (TRANSCRIPT && fs8.existsSync(TRANSCRIPT)) {
      const lines = readTail(TRANSCRIPT, TAIL_BYTES).split("\n").filter(Boolean).slice(-MAX_LINES);
      const re = /write|edit|read|str_replace|create/i;
      for (const line of lines) {
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
  return LAST_FILE ? ` ${st("file", `\u203A ${LAST_FILE}`)}` : "";
}

// src/render/recolor.ts
function recolor(line, colour) {
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
    out += `${colour(col)}${g}${R}`;
    col++;
  }
  return out;
}
function applyWashes(lines, rl, PCT) {
  let dangerActive = false;
  if (cfg.danger || cfg.themeName === "silver-halide") {
    const fh = rl && rl.five_hour && rl.five_hour.used_percentage || 0;
    const sd = rl && rl.seven_day && rl.seven_day.used_percentage || 0;
    dangerActive = PCT >= 90 || fh >= cfg.limitCrit || sd >= cfg.limitCrit;
  }
  if (cfg.shimmer === "disco") {
    return lines.map((l) => recolor(l, (col) => {
      const [r, g, b] = hueRgb(col * 14 + idiv(cfg.nowMs, 6), 0);
      return tc(r, g, b);
    }));
  } else if (dangerActive) {
    const pulse = Math.abs(idiv(cfg.nowMs, 200) % 60 - 30);
    return lines.map((l) => recolor(l, (col) => tc(150 + pulse + col % 3 * 12, 18, 18)));
  }
  return lines;
}

// src/render/layout.ts
function assembleLayout(p, sh) {
  const J = justified;
  let layout = cfg.layout;
  if (cfg.responsive) {
    const c = termCols();
    layout = c < 70 ? "tiny" : c < 100 ? "1line" : c < 140 ? "2line" : "3line";
  }
  switch (layout) {
    case "tiny":
      return [J(`${p.BAR} ${p.PCT_SEG}`, sh("cost", p.COST_SEG))];
    case "1line":
      return [J(`${p.LEAD} ${p.BAR}  ${p.PCT_FULL}  ${p.BRACKET}`, p.L3_RIGHT)];
    case "2line":
      return [J(p.L1_LEFT, p.L1_RIGHT), J(p.L2_LEFT, p.L3_RIGHT)];
    default:
      return [J(p.L1_LEFT, p.L1_RIGHT), J(p.L2_LEFT, p.L2_RIGHT), J(p.L3_LEFT, p.L3_RIGHT)];
  }
}

// src/build.ts
function build() {
  const data = readInput();
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
  const rl = data.rate_limits;
  const { gitMemo, kickRefresh, SPARK: SPARK2, COMPACTIONS, ETA_SAMPLES, BELL } = persistTick(data, CWD, PCT, COST, DURATION_MS);
  const gc = (args) => gitMemo[args.join(" ")] ?? "";
  const CUSTOM_SEG = buildCustom(data);
  const { display: MODEL_DISPLAY, oneM: ONEM, crest: CREST } = buildModel(MODEL_ID, MODEL_NAME, MAX_TOK);
  const { word: EFFORT_WORD, thinking: THINKING_WORD } = buildEffort(EFFORT, THINKING);
  const LEAD = buildLead(data);
  const { clock: CLOCK_SEG, moon: MOON } = buildClock();
  const DIR_SEG = st("dir", `${cfg.nerdfont ? "\uF07B " : ""}${displayPath(CWD)}`);
  const G = readGit(CWD, gc);
  const PET = buildPet(COST, G.dirty, PCT);
  const CLAUDE_USER = readAccountName();
  const FILE_SEG = buildLastFile(TRANSCRIPT);
  const { pct: COMPACT_PCT, off: COMPACT_OFF } = readAutocompact();
  const { bar: BAR, pctSeg: PCT_SEG, trend: TREND_SEG, weather: WEATHER_SEG, compactLabel: COMPACT_LABEL } = buildContext(PCT, COMPACT_PCT, COMPACT_OFF, SPARK2, ETA_SAMPLES, COMPACTIONS);
  const TURN_SEG = buildTokens(cw.current_usage);
  const { seg: COST_SEG, barPrefix: BAR_PREFIX } = buildCost(COST, DURATION_MS);
  const AGE_SEG = buildAge(DURATION_MS);
  const USAGE_SEG = rl != null ? buildUsage(rl) : "";
  const HIDE = new Set(cfg.hide.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean));
  if (cfg.privacy) {
    const alias = { email: "email", path: "dir", account: "name", cost: "cost" };
    const toks = cfg.privacyHide ? cfg.privacyHide.split(/[\s,]+/).filter(Boolean) : ["email", "path", "account", "cost"];
    for (const t of toks)
      HIDE.add(alias[t] || t);
  }
  const sh = (name, val) => HIDE.has(name) ? "" : val;
  const SEP = cfg.separator ? ` ${st("separator", cfg.separator)} ` : "  ";
  let SYS_SEG = "";
  if (cfg.sysinfo) {
    const la = os7.loadavg()[0];
    if (la > 0)
      SYS_SEG = `${st("sysinfo", `\u21AF${la.toFixed(2)}`)} `;
  }
  const GIT_SEG = buildGitSeg(G, ADDED, REMOVED, HIDE.has("email"));
  const CTX_SIZE_K = fmtK(MAX_TOK);
  const BR_OPEN = st("bracket.delim", "["), BR_CLOSE = st("bracket.delim", "]");
  let BRACKET = `${sh("crest", CREST)}${sh("model", MODEL_DISPLAY)}`;
  if (ONEM)
    BRACKET += ` ${ONEM}`;
  if (EFFORT_WORD)
    BRACKET += ` ${sh("effort", EFFORT_WORD)}`;
  if (THINKING_WORD)
    BRACKET += ` ${sh("thinking", THINKING_WORD)}`;
  const L1_LEFT = `${LEAD} ${sh("pet", PET)}${BR_OPEN}${BRACKET}${BR_CLOSE}`;
  const L1_RIGHT = `${sh("sysinfo", SYS_SEG)}${sh("moon", MOON)}${sh("clock", CLOCK_SEG)}`;
  const PCT_FULL = WEATHER_SEG ? `${PCT_SEG} ${sh("weather", WEATHER_SEG)}` : PCT_SEG;
  let CTX_STATS = st("ctx.size", CTX_SIZE_K);
  if (TURN_SEG)
    CTX_STATS += ` ${sh("tokens", TURN_SEG)}`;
  if (TREND_SEG)
    CTX_STATS += `${SEP}${sh("trend", TREND_SEG)}`;
  const L2_LEFT = `${BAR_PREFIX}${BAR}  ${PCT_FULL}${COMPACT_LABEL}${SEP}${CTX_STATS}`;
  const L2_RIGHT = sh("usage", USAGE_SEG);
  let L3_LEFT = `${sh("dir", DIR_SEG)}${sh("file", FILE_SEG)}`;
  L3_LEFT += sh("git", GIT_SEG) + sh("custom", CUSTOM_SEG);
  let L3_RIGHT = "";
  if (CLAUDE_USER)
    L3_RIGHT = `${sh("name", `${st("name", CLAUDE_USER)}  `)}`;
  L3_RIGHT += `${sh("cost", COST_SEG)}  ${sh("age", AGE_SEG)}`;
  let lines = assembleLayout(
    { LEAD, BAR, PCT_SEG, PCT_FULL, BRACKET, COST_SEG, L1_LEFT, L1_RIGHT, L2_LEFT, L2_RIGHT, L3_LEFT, L3_RIGHT },
    sh
  );
  lines = applyWashes(lines, rl, PCT);
  if (kickRefresh) {
    try {
      const child = (0, import_child_process5.spawn)(process.execPath, [__filename, "--git-refresh"], {
        detached: true,
        windowsHide: true,
        stdio: ["pipe", "ignore", "ignore"],
        env: process.env
      });
      if (child.stdin) {
        child.stdin.write(JSON.stringify(data));
        child.stdin.end();
      }
      child.on("error", () => {
      });
      child.unref();
    } catch {
    }
  }
  return BELL + lines.join("\n") + "\n";
}

// src/index.ts
var cliArg = process.argv[2];
if (cliArg === "--preview")
  runPreview();
else if (cliArg === "--doctor")
  runDoctor();
else if (cliArg === "--report")
  runReport();
else if (cliArg === "--migrate")
  runMigrate();
else if (cliArg === "--git-refresh") {
  refreshGitCache(readInput());
} else if (cliArg && cliArg.startsWith("-")) {
  process.stdout.write("claude-statusline \u2014 a statusline command for Claude Code.\n\nUsage: reads Claude Code JSON on stdin and prints the statusline.\n\nCommands:\n  --preview   render every theme / bar style / shimmer\n  --doctor    report terminal capabilities, active config, and conflicts\n  --report    summarise cross-session usage history\n  --migrate   translate a legacy SL_* env block to JSON config (on stdout)\n  --help      this message\n\nConfigure via ~/.claude/statusline.json (or $SL_CONFIG) \u2014 see the README.\n");
} else {
  try {
    const out = build();
    process.stdout.write(cfg.tmuxPassthrough ? `\x1BPtmux;${out.replace(/\x1b/g, "\x1B\x1B")}\x1B\\` : out);
  } catch (e) {
    process.stdout.write(`${DIM}claude-statusline: ${e && e.message || "error"}${R}
`);
  }
}
