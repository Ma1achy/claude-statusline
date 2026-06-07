// Type definitions for the Claude Code statusline input and internal config.

export type RGB = [number, number, number];

export type ColorMode = 'truecolor' | '256' | '16' | 'mono';

export interface Palette {
  RED: string; GREEN: string; AMBER: string; BLUE: string;
  CYAN: string; WHITE: string; GOLD: string;
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
  path: string; sysinfo: boolean; accessible: boolean; responsive: boolean;
  gitRisk: boolean; danger: boolean;
  petStyle: string; petReactsTo: string; bell: boolean;
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
