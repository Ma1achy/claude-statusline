// Named bundles selected via the config's `preset` field. A preset is a partial
// JSON config (same keys as ~/.claude/statusline.json); the user's explicit config
// merges on top, so a preset is a starting point you can still override field by
// field. Precedence (config.ts): explicit config > preset > hardcoded default.
export type Preset = Record<string, any>;

export const PRESETS: Record<string, Preset> = {
  // Quiet and static: no motion, greyscale, plain bar.
  minimal: { theme: 'mono', shimmer: 'off', barStyle: 'blocks' },
  // Colourful and lively without the joke modes.
  pretty: { theme: 'synthwave', shimmer: 'wave', crest: true, moon: true, rainbowStats: true },
  // Calm but informative — for long working sessions.
  focus: { theme: 'nord', shimmer: 'breathe', burn: true, gitExtra: true },
  // Everything loud, on purpose.
  chaos: { shimmer: 'disco', theme: 'plasma', pet: true, crest: true, costFlair: true, rainbowStats: true },
  // The kitchen-sink showcase used for screenshots/GIFs.
  demo: { theme: 'viridis', shimmer: 'comet', crest: true, pet: true, moon: true, daynight: true, burn: true, gitExtra: true, rainbowStats: true },
};
