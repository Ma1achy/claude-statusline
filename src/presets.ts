// Named bundles selected via SL_PRESET. A preset is just a map of SL_* var names
// to the string value a user would type — so resolution is uniform and a preset
// can set anything an env var can. Precedence is enforced in config.ts:
//   explicit env var  >  preset value  >  hardcoded default
// so a preset is a starting point the user can still override one field at a time.
export type Preset = Record<string, string>;

export const PRESETS: Record<string, Preset> = {
  // Quiet and static: no motion, greyscale, plain bar.
  minimal: { SL_THEME: 'mono', SL_SHIMMER: 'off', SL_BAR_STYLE: 'blocks' },
  // Colourful and lively without the joke modes.
  pretty: { SL_THEME: 'synthwave', SL_SHIMMER: 'wave', SL_CREST: 'on', SL_MOON: 'on', SL_RAINBOW_STATS: 'on' },
  // Calm but informative — for long working sessions.
  focus: { SL_THEME: 'nord', SL_SHIMMER: 'breathe', SL_BURN: 'on', SL_GIT_EXTRA: 'on' },
  // Everything loud, on purpose.
  chaos: { SL_SHIMMER: 'disco', SL_THEME: 'plasma', SL_PET: 'on', SL_CREST: 'on', SL_COST_FLAIR: 'on', SL_RAINBOW_STATS: 'on' },
  // The kitchen-sink showcase used for screenshots/GIFs.
  demo: { SL_THEME: 'viridis', SL_SHIMMER: 'comet', SL_CREST: 'on', SL_PET: 'on', SL_MOON: 'on', SL_DAYNIGHT: 'on', SL_BURN: 'on', SL_GIT_EXTRA: 'on', SL_RAINBOW_STATS: 'on' },
};
