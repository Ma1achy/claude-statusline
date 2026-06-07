<p align="center">
  <img src="assets/demo-default.gif" width="100%" />
</p>

<h1 align="center">claude-statusline</h1>

<p align="center">
  A three-line animated statusline for <a href="https://claude.ai/code">Claude Code</a> —
  truecolor gradient bars, git context, usage limits, and a pile of opt-in whimsy.<br/>
  Pure Node.js, cross-platform (Windows / macOS / Linux), no dependencies beyond <code>node</code>.
</p>

# **About**
---

A drop-in `statusLine` command that renders three lines on every repaint:

- **Line 1** — permission glyph · model · effort · thinking mode | clock (with seconds)
- **Line 2** — animated context bar · % · cache stats | 5h & 7d usage-limit bars
- **Line 3** — path › last file · git branch · email · deltas | account name · cost · session age

The context bar is drawn with **half-blocks (`▌`)** sampled twice per character for a smooth
truecolor gradient, and a moving hue crest animates it. Everything beyond the core is an opt-in
`SL_*` toggle, so the default stays clean and you bolt on exactly what you want.

<p align="center">
  <img src="assets/demo-loaded.gif" width="100%" /><br/>
  <em>Everything switched on: pet, crest, moon, day/night clock, cost flair, burn rate, git extras, rainbow stats.</em>
</p>

# **Features**
---

### Themes — `SL_THEME`

The chosen theme recolors the **whole** statusline — bars, usage limits, git, cost, name, everything.

<p align="center"><img src="assets/demo-themes.gif" width="100%" /></p>

| Value | Look |
|-------|------|
| `heat` | Green→red heat gradient (default) |
| `synthwave` | Magenta→cyan neon |
| `matrix` | All-green, dark→bright ramp |
| `mono` | Greyscale brightness ramp |
| `pastel` | Soft, desaturated |
| `dracula` | Green · cyan · purple · pink |
| `nord` | Cool arctic blues |
| `gruvbox` | Warm retro earth tones |
| `tokyonight` | Blue · cyan · purple · pink |
| `rosepine` | Muted pine · foam · iris · rose |

### Colormap themes

Perceptually-uniform [matplotlib](https://matplotlib.org/stable/users/explain/colors/colormaps.html) colormaps, sampled as multi-stop gradients.

<p align="center"><img src="assets/demo-colormaps.gif" width="100%" /></p>

| Value | Look |
|-------|------|
| `viridis` | Purple → teal → green → yellow |
| `inferno` | Black → purple → red → orange → yellow |
| `magma` | Black → purple → pink → cream |
| `plasma` | Blue → magenta → orange → yellow |
| `cividis` | Deep blue → muted gold |

### Custom themes — `SL_THEME=custom`

Bring your own palette without touching the code. Resolved at runtime, in order:

1. **A JSON file** at `~/.claude/statusline-theme.json` (or any path in `SL_THEME_FILE`):
   ```json
   { "cmap": [[13,8,135],[240,249,33]], "mix": 20,
     "palette": { "RED":[255,0,0], "GREEN":[0,255,0], "AMBER":[255,200,0],
                  "BLUE":[0,0,255], "CYAN":[0,255,255], "WHITE":[240,240,240], "GOLD":[255,215,0] } }
   ```
   Provide a `cmap` (multi-stop bar gradient) **or** a hue ramp (`hueHi`/`hueLo`/`sat`/`valLo`/`valHi`),
   plus an optional `palette`. Anything malformed falls back to `heat` — it never errors.
2. **base16** via `SL_BASE16` — 16 comma/space-separated hex values (`#rrggbb`). Every base16/base24
   scheme just works: `SL_BASE16="#282828,#cc241d,…,#ebdbb2"`.

> Adding a *built-in* theme is now a one-file data change in [`src/themes.data.ts`](src/themes.data.ts) — pure RGB, no TypeScript.

### Bar styles — `SL_BAR_STYLE`

<p align="center"><img src="assets/demo-bar-styles.gif" width="100%" /></p>

| Value | Look |
|-------|------|
| `blocks` | Smooth half-block gradient (default) |
| `pacman` | `==========C····` — a muncher eating dots |
| `snake` | `~~~~@~` — a crawling snake |
| `matrix` | Green blocks with faint code-rain in the empty track |

### Animation styles — `SL_SHIMMER`

All styles rotate **hue** at a moving crest; they differ only in how the crest travels.
(Claude Code repaints at most once/second, so the gradient is smooth but motion steps per second.)

<p align="center"><img src="assets/demo-shimmer.gif" width="100%" /></p>

| Value | Effect |
|-------|--------|
| `sweep` | A soft hue crest glides across the fill (default) |
| `wave` | A wide hue ripple rolls along |
| `comet` | Hue crest with a fading trail |
| `breathe` | The whole fill shifts hue up and back in unison |
| `scan` | A narrow crest bounces back and forth |
| `off` | Static |

### …and `disco`

<p align="center">
  <img src="assets/demo-disco.gif" width="100%" /><br/>
  <em><code>SL_SHIMMER=disco</code> — per-cell rainbow + vivid fast-flowing name. A joke mode. Use responsibly.</em>
</p>

# **Install**
---

1. Copy `statusline.js` somewhere, e.g. `~/.claude/statusline.js`
2. Add to your `~/.claude/settings.json` (Windows: `%USERPROFILE%\.claude\settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/statusline.js",
    "refreshInterval": 1
  }
}
```

`refreshInterval` is in **seconds** (minimum `1`); the clock and animation update once per second.

**Requirements:** `node` (ships with Claude Code), optionally `git` (segments are skipped if
absent), and a terminal with **truecolor** support (iTerm2, Terminal.app, Windows Terminal, …).

<details>
  <summary>Windows notes</summary>
  <ul style="margin-left: 20px;">
    <li>Claude Code runs the statusline through <b>Git Bash</b> if <a href="https://git-scm.com/downloads/win">Git for Windows</a> is installed, otherwise <b>PowerShell</b> — the script works under both.</li>
    <li>Use <b>forward slashes</b> in the path (Git Bash eats backslashes):<br/><code>"command": "node C:/Users/you/.claude/statusline.js"</code></li>
    <li>If <code>node</code> isn't on PATH, use its full path:<br/><code>"command": "C:/Program Files/nodejs/node.exe C:/Users/you/.claude/statusline.js"</code></li>
  </ul>
</details>

# **Configuration**
---

Set everything in the `env` block of `settings.json`, e.g.:

```json
"env": {
  "SL_THEME": "synthwave",
  "SL_PET": "on",
  "SL_GIT_EXTRA": "on"
}
```

### Presets — `SL_PRESET`

A preset bundles a theme + shimmer + bar + extras in one switch. **Any individual `SL_*` var you
also set overrides the preset** (precedence: explicit var → preset → default), so a preset is just
a starting point.

| Value | Vibe |
|-------|------|
| `minimal` | Greyscale, no motion, plain bar |
| `pretty` | Synthwave + wave + crest + moon + rainbow stats |
| `focus` | Calm nord + breathe + burn rate + git extras |
| `chaos` | Everything loud — disco, pet, plasma, cost flair |
| `demo` | The kitchen-sink showcase |

```jsonc
"env": { "SL_PRESET": "pretty", "SL_THEME": "nord" }  // pretty, but force the nord palette
```

### Opt-in extras

All default **off**; enable with `on` / `1` / `true`. Everything is text-safe (width-1 glyphs,
no emoji), so right-alignment stays exact on every terminal.

| Variable | Effect |
|----------|--------|
| `SL_PET` | ASCII pet whose mood tracks context %: `[^_^]`→`[._.]`→`[o_o]`→`[>_<]`; `[$_$]` when cost ≥ $0.50 |
| `SL_CREST` | Per-model accent: `★` Opus · `◆` Sonnet · `▲` Haiku |
| `SL_MOON` | Moon-phase glyph (`●◐○◑`) before the clock |
| `SL_DAYNIGHT` | Clock color shifts with the real hour (dawn → midday → dusk → night) |
| `SL_COST_FLAIR` | Spend-tier prefix on cost: `·` `$` `$$` `!$` |
| `SL_BURN` | Append `$/hr` burn rate after cost (once session ≥ 60s); adds a `1.4x`-vs-your-median deviation once you have history |
| `SL_GIT_EXTRA` | Ahead/behind `↑2↓1`, last-commit age `·3m`, untracked `?N`, stash `s:N`, branch-mood tag `[wip]/[fix]/[feat]/[test]` |
| `SL_RAINBOW_STATS` | Rainbow the cost and session-age segments, like the account name |
| `SL_TREND` | Context-% sparkline `▁▂▃▄`, ETA to autocompact `~11m`, and a compaction counter `↺2` |
| `SL_WEATHER` | One-word context-pressure reading: `clear → breezy → dense → stormy → compacting` |
| `SL_LIMITS` | Flag the 5h/7d usage bars: amber past `SL_LIMIT_WARN`, bold-red `LOW` past `SL_LIMIT_CRIT` |

### Tuning

| Variable | Default | Effect |
|----------|---------|--------|
| `SL_THEME` | `heat` | Palette (see Features) |
| `SL_BAR_STYLE` | `blocks` | Bar render style |
| `SL_SHIMMER` | `sweep` | Animation style (`…|disco|off`) |
| `SL_WAVE_HUE` | `32` | Hue rotation at crest peak (degrees) |
| `SL_SPEED` | `3` | Crest travel speed (cells/sec) |
| `SL_RAINBOW_MIX` | `50` | Rainbow pastel level (0 = vivid, 100 = white) |
| `SL_MARGIN` | `6` | Right-edge margin in columns (raise if content clips) |
| `SL_PRESET` | — | Bundle of settings (see Presets); individual vars override it |
| `SL_COLOR_MODE` | `auto` | Colour depth: `truecolor` / `256` / `16` / `mono` / `auto` |
| `SL_LIMIT_WARN` | `80` | Usage % at which `SL_LIMITS` colours a bar amber |
| `SL_LIMIT_CRIT` | `95` | Usage % at which `SL_LIMITS` shows bold-red `LOW` |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | — | Sets the white `┃` autocompact marker position on the context bar |

### Colour depth & accessibility

By default the statusline assumes truecolor, but it degrades cleanly for terminals that don't:

| Mode | Behaviour |
|------|-----------|
| `truecolor` | Full 24-bit gradients (default) |
| `256` | Nearest xterm-256 colours |
| `16` | Nearest of the 8/16 ANSI colours |
| `mono` | No colour at all — structure carried by bold/dim; bar fills with `█`/`░` |
| `auto` | Detect from `COLORTERM`/`TERM`, assume truecolor when unsure |

The [`NO_COLOR`](https://no-color.org/) convention is honoured: setting `NO_COLOR` to any value forces
`mono`, overriding everything else.

### Leading indicator (fast / vim)

The glyph at the very start of line 1 reflects what Claude Code actually exposes to
statuslines. Claude Code does **not** report the permission / auto-accept mode (the one
toggled by shift+tab) in the statusline payload, so this slot shows:

| Glyph | Meaning |
|-------|---------|
| `⚡` (gold) | `/fast` mode is **on** |
| `▫` (dim) | normal / slow mode |
| ` N` / ` I` / ` V` | vim input mode (Normal / Insert / Visual) — only shown when vim mode is enabled |

# **Development**
---

The shipped `statusline.js` is a **bundled build** — you never need to build it to *use* it
(just copy that one file). To work on it:

```bash
npm install        # esbuild + typescript (dev only; runtime stays zero-dependency)
npm run build      # src/*.ts → statusline.js  (esbuild bundle, ~30 ms)
npm test           # builds, then golden-snapshot + smoke + alignment tests
npm run render     # regenerate the demo GIFs in assets/ (needs Python + PIL)
```

Source lives in `src/` (TypeScript, one module per concern: `themes`, `bar`, `color`,
`rainbow`, `git`, `segments`/`index`, …). The build bundles to a single zero-dependency CommonJS
file, so the runtime is still just `node statusline.js`. Tests run against the **built** artifact
and compare to committed golden snapshots in `test/golden/`; after an intentional change, refresh
them with `node scripts/gen-goldens.js`.

<details>
  <summary>Why a build step?</summary>
  <ul style="margin-left: 20px;">
    <li>TypeScript gives types for the Claude Code input schema and the ~20 config options.</li>
    <li>Bundling to one file keeps the "copy a single file, no install" experience for users.</li>
    <li>The bundle imports only Node built-ins (<code>fs</code>, <code>os</code>, <code>child_process</code>) — no <code>node_modules</code> at runtime.</li>
  </ul>
</details>

# **How it works**
---

- One pass of stdin JSON; no per-field shelling out. Typical run ≈ 70 ms.
- The bar uses half-blocks with **two RGB samples per character** for 2× gradient resolution.
- Percentage text (context %, usage bars) is tinted with the theme colour **at that fill position**, so it lerps smoothly with the value instead of jumping at thresholds.
- The crests wrap toroidally, so every animation loops seamlessly (no reset/pop).
- The autocompact `┃` marker only appears when autocompact is enabled (`autoCompactEnabled`).
- Millisecond timing keeps the animation phase honest even with uneven repaint gaps.
- The account name is read from `~/.claude.json` (`.oauthAccount.displayName`).
- Git runs with `--no-optional-locks` so it never blocks.
- Every glyph is width-1 (no emoji), so alignment is exact across platforms and fonts.
