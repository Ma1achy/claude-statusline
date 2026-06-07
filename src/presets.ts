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

  // ── personas: opinionated, complete looks ──────────────────────────────────
  // Named after a vibe rather than a feature set. (Names kept unique from theme/
  // pet/shimmer names: stillness≠zen theme, outrun≠vaporwave theme, wraith≠ghost pet.)
  stillness: { theme: 'mono', shimmer: 'breathe' },                                                    // calm, nothing extra
  operator: { theme: 'mono', barStyle: 'blocks', shimmer: 'scan', burn: true, costFlair: true, gitExtra: true },
  observatory: { theme: 'tokyonight', shimmer: 'comet', moon: true, daynight: true, crest: true },
  cabin: { theme: 'gruvbox', shimmer: 'breathe', pet: true, moon: true, daynight: true },
  hacker: { theme: 'matrix', barStyle: 'matrix', shimmer: 'scan', crest: true, gitExtra: true, burn: true },
  warroom: { theme: 'heat', shimmer: 'sweep', burn: true, gitExtra: true, costFlair: true, crest: true },
  lofi: { theme: 'rosepine', shimmer: 'wave', pet: true, moon: true, daynight: true },
  outrun: { theme: 'synthwave', shimmer: 'wave', rainbowStats: true, rainbowMix: 20 },
  wraith: { theme: 'mono', barStyle: 'snake', shimmer: 'comet', moon: true, costFlair: true },
  arcade: { theme: 'dracula', barStyle: 'pacman', shimmer: 'wave', pet: true, costFlair: true, rainbowStats: true },
};
