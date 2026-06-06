// Parse every SL_* env var (and the wall-clock frame) into one typed config.
import { env, bool, idiv, intEnv } from './util';
import type { Config } from './types';

let shimmer = env('SL_SHIMMER', 'sweep');
if (shimmer === 'pulse') shimmer = 'breathe';   // aliases
if (shimmer === 'march') shimmer = 'scan';

// Claude Code repaints at most once/second (refreshInterval is in seconds, min 1),
// so ms timing can't make motion sub-second-smooth — it just keeps the animation
// phase honest and drives the rainbow. SL_FRAME_MS overrides for tests/renders.
const nowMs = parseInt(env('SL_FRAME_MS', ''), 10) || Date.now();
// SL_CLOCK_MS freezes the clock/day-night display independently of the animation
// frame — used by the demo renderer to make GIFs loop without the clock ticking.
const clockMs = parseInt(env('SL_CLOCK_MS', ''), 10) || nowMs;

export const cfg: Config = {
  shimmer,
  speed: intEnv('SL_SPEED', 3),
  glow: intEnv('SL_GLOW', 240),
  waveHue: intEnv('SL_WAVE_HUE', 32),
  themeName: env('SL_THEME', 'heat'),
  barStyle: env('SL_BAR_STYLE', 'blocks'),
  rainbowMixRaw: process.env.SL_RAINBOW_MIX ? parseInt(process.env.SL_RAINBOW_MIX, 10) : null,
  margin: intEnv('SL_MARGIN', 6),
  pet: bool('SL_PET'),
  crest: bool('SL_CREST'),
  moon: bool('SL_MOON'),
  daynight: bool('SL_DAYNIGHT'),
  costFlair: bool('SL_COST_FLAIR'),
  burn: bool('SL_BURN'),
  gitExtra: bool('SL_GIT_EXTRA'),
  rainbowStats: bool('SL_RAINBOW_STATS'),
  nowMs,
  clockMs,
  baseFrame: idiv(nowMs, 1000),
};
