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
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));

// src/ansi.ts
var import_child_process = require("child_process");

// src/util.ts
var env = (k, d) => process.env[k] !== void 0 && process.env[k] !== "" ? process.env[k] : d;
var bool = (k) => /^(on|1|true|yes)$/i.test(env(k, ""));
var idiv = (a, b) => Math.trunc(a / b);
var mod = (a, b) => (a % b + b) % b;
var intEnv = (k, d) => {
  const v = parseInt(env(k, ""), 10);
  return Number.isFinite(v) ? v : d;
};

// src/config.ts
var shimmer = env("SL_SHIMMER", "sweep");
if (shimmer === "pulse")
  shimmer = "breathe";
if (shimmer === "march")
  shimmer = "scan";
var nowMs = parseInt(env("SL_FRAME_MS", ""), 10) || Date.now();
var cfg = {
  shimmer,
  speed: intEnv("SL_SPEED", 3),
  glow: intEnv("SL_GLOW", 240),
  waveHue: intEnv("SL_WAVE_HUE", 32),
  themeName: env("SL_THEME", "heat"),
  barStyle: env("SL_BAR_STYLE", "blocks"),
  rainbowMixRaw: process.env.SL_RAINBOW_MIX ? parseInt(process.env.SL_RAINBOW_MIX, 10) : null,
  margin: intEnv("SL_MARGIN", 6),
  pet: bool("SL_PET"),
  crest: bool("SL_CREST"),
  moon: bool("SL_MOON"),
  daynight: bool("SL_DAYNIGHT"),
  costFlair: bool("SL_COST_FLAIR"),
  burn: bool("SL_BURN"),
  gitExtra: bool("SL_GIT_EXTRA"),
  rainbowStats: bool("SL_RAINBOW_STATS"),
  nowMs,
  baseFrame: idiv(nowMs, 1e3)
};

// src/ansi.ts
var ESC = "\x1B";
var R = "\x1B[0m";
var DIM = "\x1B[2m";
var BOLD = "\x1B[1m";
var tc = (r, g, b) => `${ESC}[38;2;${r};${g};${b}m`;
var stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
var printLen = (s) => Array.from(stripAnsi(s)).length;
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
var THEMES = {
  // hue-ramp themes
  heat: { hueHi: 120, hueLo: 0, sat: 88, valLo: 84, valHi: 84, mix: null, pal: { RED: "\x1B[31m", GREEN: "\x1B[32m", AMBER: "\x1B[33m", BLUE: "\x1B[34m", CYAN: "\x1B[36m", WHITE: "\x1B[37m", GOLD: "\x1B[38;5;220m" } },
  synthwave: { hueHi: 300, hueLo: 180, sat: 92, valLo: 75, valHi: 92, mix: 30, pal: { RED: tc(255, 55, 135), GREEN: tc(0, 255, 170), AMBER: tc(255, 170, 70), BLUE: tc(150, 90, 255), CYAN: tc(0, 229, 255), WHITE: tc(235, 225, 255), GOLD: tc(255, 95, 205) } },
  matrix: { hueHi: 128, hueLo: 100, sat: 95, valLo: 45, valHi: 92, mix: null, pal: { RED: tc(0, 150, 45), GREEN: tc(0, 255, 65), AMBER: tc(120, 235, 40), BLUE: tc(0, 200, 95), CYAN: tc(0, 225, 120), WHITE: tc(170, 255, 170), GOLD: tc(120, 255, 90) } },
  mono: { hueHi: 0, hueLo: 0, sat: 0, valLo: 38, valHi: 95, mix: null, pal: { RED: tc(120, 120, 120), GREEN: tc(190, 190, 190), AMBER: tc(155, 155, 155), BLUE: tc(165, 165, 165), CYAN: tc(205, 205, 205), WHITE: tc(228, 228, 228), GOLD: tc(238, 238, 238) } },
  pastel: { hueHi: 120, hueLo: 0, sat: 52, valLo: 88, valHi: 88, mix: 70, pal: { RED: tc(255, 150, 150), GREEN: tc(150, 230, 160), AMBER: tc(240, 210, 140), BLUE: tc(165, 185, 240), CYAN: tc(150, 215, 230), WHITE: tc(238, 238, 238), GOLD: tc(240, 220, 160) } },
  // matplotlib colormaps (palette auto-derived)
  viridis: { cmap: [[68, 1, 84], [70, 50, 126], [54, 92, 141], [39, 127, 142], [31, 161, 135], [74, 193, 109], [160, 218, 57], [253, 231, 37]], mix: 25 },
  inferno: { cmap: [[0, 0, 4], [40, 11, 83], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 194, 40], [252, 255, 164]], mix: 20 },
  magma: { cmap: [[0, 0, 4], [34, 17, 80], [95, 24, 127], [152, 45, 128], [211, 67, 110], [248, 118, 92], [254, 187, 129], [252, 253, 191]], mix: 22 },
  plasma: { cmap: [[13, 8, 135], [83, 2, 163], [139, 10, 165], [184, 50, 137], [219, 92, 104], [244, 136, 73], [254, 189, 42], [240, 249, 33]], mix: 22 },
  cividis: { cmap: [[0, 34, 78], [33, 59, 110], [76, 85, 108], [108, 110, 114], [142, 137, 120], [177, 165, 112], [217, 197, 92], [254, 232, 56]], mix: 25 },
  // designer palettes
  dracula: { cmap: [[80, 250, 123], [139, 233, 253], [189, 147, 249], [255, 121, 198]], mix: 35, pal: { RED: tc(255, 85, 85), AMBER: tc(255, 184, 108), GREEN: tc(80, 250, 123), BLUE: tc(189, 147, 249), CYAN: tc(139, 233, 253), GOLD: tc(241, 250, 140), WHITE: tc(248, 248, 242) } },
  nord: { cmap: [[94, 129, 172], [129, 161, 193], [136, 192, 208], [143, 188, 187]], mix: 40, pal: { RED: tc(191, 97, 106), AMBER: tc(235, 203, 139), GREEN: tc(163, 190, 140), BLUE: tc(129, 161, 193), CYAN: tc(136, 192, 208), GOLD: tc(235, 203, 139), WHITE: tc(236, 239, 244) } },
  gruvbox: { cmap: [[131, 165, 152], [184, 187, 38], [250, 189, 47], [254, 128, 25]], mix: 25, pal: { RED: tc(251, 73, 52), AMBER: tc(250, 189, 47), GREEN: tc(184, 187, 38), BLUE: tc(131, 165, 152), CYAN: tc(142, 192, 124), GOLD: tc(250, 189, 47), WHITE: tc(235, 219, 178) } },
  tokyonight: { cmap: [[122, 162, 247], [125, 207, 255], [187, 154, 247], [247, 118, 142]], mix: 30, pal: { RED: tc(247, 118, 142), AMBER: tc(224, 175, 104), GREEN: tc(158, 206, 106), BLUE: tc(122, 162, 247), CYAN: tc(125, 207, 255), GOLD: tc(224, 175, 104), WHITE: tc(192, 202, 245) } },
  rosepine: { cmap: [[49, 116, 143], [156, 207, 216], [196, 167, 231], [235, 188, 186]], mix: 45, pal: { RED: tc(235, 111, 146), AMBER: tc(246, 193, 119), GREEN: tc(156, 207, 216), BLUE: tc(49, 116, 143), CYAN: tc(156, 207, 216), GOLD: tc(246, 193, 119), WHITE: tc(224, 222, 244) } }
};
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
var TH = THEMES[cfg.themeName] || THEMES.heat;
var PAL = TH.pal || deriveCmapPal(TH.cmap);
var { RED, GREEN, AMBER, BLUE, CYAN, WHITE, GOLD } = PAL;
var RAINBOW_MIX = cfg.rainbowMixRaw != null ? cfg.rainbowMixRaw : TH.mix != null ? TH.mix : 50;

// src/bar.ts
var MATRIX_CHARS = "01<>{}[]/\\|=+*".split("");
var hashI = (n) => Math.imul(n >>> 0, 2654435761) >>> 0;
function drawBar(width, filled, marker, phaseMs = 0) {
  const { shimmer: shimmer2, speed, glow, waveHue, barStyle, nowMs: nowMs2, baseFrame } = cfg;
  const t = nowMs2 + phaseMs;
  let span = filled;
  if (span < 1)
    span = 1;
  let posc = 0, hglob = 0;
  if (shimmer2 === "sweep" || shimmer2 === "comet" || shimmer2 === "wave") {
    const cyclec = (span + 4) * 100;
    posc = mod(idiv(t * speed, 10), cyclec);
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
    let hoff = 0, dc, lead;
    switch (shimmer2) {
      case "sweep":
        dc = Math.abs(sx - posc);
        if (dc < glow)
          hoff = idiv(waveHue * (glow - dc) * (glow - dc), glow * glow);
        break;
      case "wave":
        dc = Math.abs(sx - posc);
        if (dc < 450)
          hoff = idiv(waveHue * (450 - dc), 450);
        break;
      case "comet":
        lead = posc - sx;
        if (lead >= 0 && lead < 420)
          hoff = idiv(waveHue * (420 - lead), 420);
        dc = Math.abs(sx - posc);
        if (dc < 70)
          hoff = waveHue;
        break;
      case "scan":
        dc = Math.abs(sx - posc);
        if (dc < 140)
          hoff = idiv(waveHue * (140 - dc), 140);
        break;
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
    return `${ESC}[38;2;${r};${g};${b}m`;
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
        out += `${ESC}[2;38;2;0;120;0m${MATRIX_CHARS[hashI(i * 131 + baseFrame) % MATRIX_CHARS.length]}${R}`;
      continue;
    }
    if (isFill) {
      const [lr, lg, lb] = px(i * 100 + 25);
      const [rr, rg, rb] = px(i * 100 + 75);
      out += `${ESC}[38;2;${lr};${lg};${lb};48;2;${rr};${rg};${rb}m\u258C${R}`;
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
    out += `${ESC}[38;2;${r};${g};${b}m${chars[i]}`;
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

// src/index.ts
function build() {
  let input = "";
  try {
    input = fs.readFileSync(0, "utf8");
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
  const FAST = data.fast_mode ? `${GOLD}\u26A1${R}` : `${DIM}\u25AB${R}`;
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
    const h = new Date(cfg.nowMs).getHours();
    if (h < 5 || h >= 22)
      return `${ESC}[38;2;90;110;170m`;
    if (h < 8)
      return `${ESC}[38;2;150;170;210m`;
    if (h < 17)
      return `${ESC}[38;2;230;225;180m`;
    if (h < 20)
      return `${ESC}[38;2;235;165;90m`;
    return `${ESC}[38;2;150;130;180m`;
  };
  const DIR_SEG = `${DIM}${CWD}${R}`;
  const BRANCH = gitOut(CWD, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const DIRTY = countLines(gitOut(CWD, ["status", "--porcelain"]));
  const STAGED = countLines(gitOut(CWD, ["diff", "--cached", "--name-only"]));
  const GIT_ID = gitOut(CWD, ["config", "user.email"]);
  let GIT_AB = "", GIT_AGE = "", GIT_UNTRACKED = "", GIT_STASH = "", BRANCH_MOOD = "";
  if (cfg.gitExtra && BRANCH) {
    const ab = gitOut(CWD, ["rev-list", "--count", "--left-right", "@{upstream}...HEAD"]);
    const m = ab.match(/^(\d+)\s+(\d+)$/);
    if (m) {
      const behind = +m[1], ahead = +m[2];
      let s = "";
      if (ahead)
        s += `${GREEN}\u2191${ahead}${R}`;
      if (behind)
        s += `${RED}\u2193${behind}${R}`;
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
  let CLAUDE_USER = "";
  try {
    const cj = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude.json`, "utf8"));
    CLAUDE_USER = cj.oauthAccount && (cj.oauthAccount.displayName || cj.oauthAccount.emailAddress) || "";
  } catch {
  }
  let LAST_FILE = "";
  try {
    if (TRANSCRIPT && fs.existsSync(TRANSCRIPT)) {
      const lines = fs.readFileSync(TRANSCRIPT, "utf8").split("\n").filter(Boolean).slice(-80);
      const re = /write|edit|read|str_replace|create/;
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
  const FILE_SEG = LAST_FILE ? ` ${DIM}\u203A ${LAST_FILE}${R}` : "";
  let COMPACT_PCT = "", COMPACT_OFF = false;
  try {
    const st = JSON.parse(fs.readFileSync(`${os.homedir()}/.claude/settings.json`, "utf8"));
    if (st.env && st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE)
      COMPACT_PCT = String(st.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
    if (st.autoCompact === false)
      COMPACT_OFF = true;
  } catch {
  }
  let COMPACT_LABEL, COMPACT_PCT_VAL;
  if (COMPACT_OFF) {
    COMPACT_LABEL = `${DIM} no-cmp${R}`;
    COMPACT_PCT_VAL = 100;
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
  const PCT_COLOUR = PCT >= 70 ? RED : PCT >= 40 ? AMBER : GREEN;
  const PCT_SEG = `${PCT_COLOUR}${PCT}%${R}`;
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
    const inSeg = CU_INPUT > 0 ? ` ${DIM}\u2193${fmtK(CU_INPUT)}${R}` : "";
    const outSeg = CU_OUT > 0 ? ` ${DIM}\u2191${fmtK(CU_OUT)}${R}` : "";
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
    const rate = (COST / (DURATION_MS / 36e5)).toFixed(2);
    COST_SEG += ` ${DIM}$${rate}/hr${R}`;
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
  const dt = new Date(cfg.nowMs);
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
      const pc = pct >= 80 ? RED : pct >= 50 ? AMBER : GREEN;
      let secsLeft = 0;
      const ra = typeof resetsAt === "number" ? resetsAt : parseInt(String(resetsAt), 10);
      if (Number.isFinite(ra) && ra > 0)
        secsLeft = ra - NOW;
      const cd = secsLeft <= 0 ? `${DIM}now${R}` : `${DIM}${fmtCountdown(secsLeft)}${R}`;
      return `${DIM}${label}${R} ${bar} ${pc}${pct}%${R} ${cd}`;
    };
    const fh = rl.five_hour || {}, sd = rl.seven_day || {};
    USAGE_SEG = `${rlSeg("5h", fh.used_percentage, fh.resets_at, 1500)}   ${rlSeg("7d", sd.used_percentage, sd.resets_at, 3e3)}`;
  }
  const CTX_SIZE_K = fmtK(MAX_TOK);
  let BRACKET = `${CREST}${MODEL_DISPLAY}`;
  if (ONEM)
    BRACKET += ` ${ONEM}`;
  if (EFFORT_WORD)
    BRACKET += ` ${EFFORT_WORD}`;
  if (THINKING_WORD)
    BRACKET += ` ${THINKING_WORD}`;
  const L1_LEFT = `${LEAD} ${PET}${DIM}[${R}${BRACKET}${DIM}]${R}`;
  const L1_RIGHT = `${MOON}${CLOCK_SEG}`;
  let CTX_STATS = `${DIM}${CTX_SIZE_K}${R}`;
  if (TURN_SEG)
    CTX_STATS += ` ${TURN_SEG}`;
  const L2_LEFT = `${BAR_PREFIX}${BAR}  ${PCT_SEG}${COMPACT_LABEL}  ${CTX_STATS}`;
  const L2_RIGHT = USAGE_SEG;
  let L3_LEFT = `${DIR_SEG}${FILE_SEG}`;
  if (BRANCH)
    L3_LEFT += `  ${BRANCH_MOOD}${CYAN}\u2387 ${BRANCH}${R}`;
  L3_LEFT += GIT_AB + GIT_AGE;
  if (GIT_ID)
    L3_LEFT += `  ${DIM}${GIT_ID}${R}`;
  if (ADDED > 0 || REMOVED > 0)
    L3_LEFT += `  ${GREEN}+${ADDED}${R}/${RED}-${REMOVED}${R}`;
  if (DIRTY > 0)
    L3_LEFT += `  ${AMBER}~${DIRTY}${R}`;
  if (STAGED > 0)
    L3_LEFT += ` ${GREEN}\u25CF${STAGED}${R}`;
  L3_LEFT += GIT_UNTRACKED + GIT_STASH;
  let L3_RIGHT = "";
  if (CLAUDE_USER)
    L3_RIGHT = `${rainbow(CLAUDE_USER)}  `;
  L3_RIGHT += `${COST_SEG}  ${AGE_SEG}`;
  return `${justified(L1_LEFT, L1_RIGHT)}
${justified(L2_LEFT, L2_RIGHT)}
${justified(L3_LEFT, L3_RIGHT)}
`;
}
try {
  process.stdout.write(build());
} catch (e) {
  process.stdout.write(`${DIM}claude-statusline: ${e && e.message || "error"}${R}
`);
}
