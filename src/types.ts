// Type definitions for the Claude Code statusline input and internal config.

export type RGB = [number, number, number];

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

export interface Config {
  shimmer: string;
  speed: number;
  glow: number;
  waveHue: number;
  themeName: string;
  barStyle: string;
  rainbowMixRaw: number | null;
  margin: number;
  pet: boolean; crest: boolean; moon: boolean; daynight: boolean;
  costFlair: boolean; burn: boolean; gitExtra: boolean; rainbowStats: boolean;
  nowMs: number;
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
