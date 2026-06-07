// Type definitions for the Claude Code statusline input and internal config.

export type RGB = [number, number, number];

export type ColorMode = 'truecolor' | '256' | '16' | 'mono';

export interface Palette {
  RED: string; GREEN: string; AMBER: string; BLUE: string;
  CYAN: string; WHITE: string; GOLD: string;
}

/** Semantic colour roles — what the styling engine targets instead of literal
 *  colour names, so themes (and the accessibility profile) can remap every element
 *  consistently. `muted` replaces the old theme-independent `DIM`. */
export type Role = 'fg' | 'muted' | 'accent' | 'ok' | 'warn' | 'bad' | 'info' | 'gold';

/** Per-element animation. Discrete/event-driven so it reads at ≤1 repaint/sec. */
export interface AnimSpec { kind: 'none' | 'wave' | 'rainbow' | 'gradient-cycle' | 'pulse' | 'breathe'; speed?: number; }

/** How one element is styled. `fill` is a role name, a `#rrggbb`, `gradient`
 *  (value-driven along the theme), or `rainbow`. All fields optional; the resolver
 *  cascades built-in default ← theme ← accessibility profile ← user config. */
export interface Style {
  fill?: string;                 // Role | '#rrggbb' | 'gradient' | 'rainbow'
  weight?: 'normal' | 'bold' | 'dim';
  attrs?: Array<'italic' | 'underline'>;
  case?: 'none' | 'upper' | 'lower' | 'title';
  font?: 'none' | 'bold' | 'italic' | 'script' | 'smallcaps';   // opt-in pseudo-font
  anim?: AnimSpec;
  glyph?: string;
  label?: string;
}

export interface Theme {
  // hue-ramp themes
  hueHi?: number; hueLo?: number; sat?: number; valLo?: number; valHi?: number;
  // colormap themes
  cmap?: RGB[];
  // rainbow-name white-blend (null → SL_RAINBOW_MIX / 50)
  mix: number | null;
  // explicit accent palette (cmap themes may omit it → auto-derived)
  pal?: Palette;
  // resolved, colour-mode-aware escapes for the semantic roles (incl. derived muted)
  roles?: Record<Role, string>;
}

/** RGB accent palette — the data form (palettes-as-data, built into escapes at load). */
export interface PaletteRGB {
  RED: RGB; GREEN: RGB; AMBER: RGB; BLUE: RGB;
  CYAN: RGB; WHITE: RGB; GOLD: RGB;
}

/** A theme expressed as pure data (no escape strings) so it can be contributed
 *  or supplied at runtime. `palRaw` is a literal-SGR carve-out used only by
 *  `heat` to keep its original truecolor bytes byte-for-byte. */
export interface ThemeData {
  hueHi?: number; hueLo?: number; sat?: number; valLo?: number; valHi?: number;
  cmap?: RGB[];
  mix: number | null;
  palRgb?: PaletteRGB;
  palRaw?: Palette;
}

export interface Config {
  shimmer: string;
  speed: number;
  glow: number;
  waveHue: number;
  easing: string;
  themeName: string;
  barStyle: string;
  barScale: string;
  rainbowMixRaw: number | null;
  margin: number;
  colorMode: ColorMode;
  themeFile: string;
  base16: string;
  pet: boolean; crest: boolean; moon: boolean; daynight: boolean;
  costFlair: boolean; burn: boolean; gitExtra: boolean; rainbowStats: boolean;
  trend: boolean; weather: boolean; limits: boolean;
  limitWarn: number; limitCrit: number;
  layout: string; separator: string; hide: string;
  privacy: boolean; privacyHide: string; projectAliases: string;
  path: string; sysinfo: boolean; accessible: boolean; accessibleGauge: string; responsive: boolean;
  gitRisk: boolean; danger: boolean;
  petStyle: string; petReactsTo: string; bell: boolean;
  nerdfont: boolean; customSegment: string;
  event: boolean;   // set at runtime: the context % changed since the last tick
  tmuxPassthrough: boolean;
  nowMs: number;
  clockMs: number;
  baseFrame: number;
}

export interface CurrentUsage {
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface RateLimit { used_percentage?: number; resets_at?: number | string; }

export interface StatuslineInput {
  session_id?: string;
  workspace?: { current_dir?: string; project_dir?: string };
  model?: { id?: string; display_name?: string };
  context_window?: {
    used_percentage?: number;
    context_window_size?: number;
    current_usage?: CurrentUsage | null;
  };
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  transcript_path?: string;
  effort?: { level?: string };
  thinking?: { enabled?: boolean };
  fast_mode?: boolean;
  vim?: { mode?: string };
  output_style?: { name?: string };
  rate_limits?: { five_hour?: RateLimit; seven_day?: RateLimit } | null;
}
