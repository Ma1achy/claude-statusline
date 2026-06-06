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

The chosen theme recolors the **whole** statusline, not just the bar.

<p align="center"><img src="assets/demo-themes.gif" width="100%" /></p>

| Value | Look |
|-------|------|
| `heat` | Green→red heat gradient (default) |
| `synthwave` | Magenta→cyan neon |
| `matrix` | All-green, dark→bright ramp |
| `mono` | Greyscale brightness ramp |
| `pastel` | Soft, desaturated |

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
| `SL_BURN` | Append `$/hr` burn rate after cost (once session ≥ 60s) |
| `SL_GIT_EXTRA` | Ahead/behind `↑2↓1`, last-commit age `·3m`, untracked `?N`, stash `s:N`, branch-mood tag `[wip]/[fix]/[feat]/[test]` |
| `SL_RAINBOW_STATS` | Rainbow the cost and session-age segments, like the account name |

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
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | — | Draws a white `┃` autocompact marker on the context bar |

### Permission glyphs

| Glyph | Color | Mode |
|-------|-------|------|
| `?` | Purple | Ask (default) |
| `⚡` | Yellow-orange | Auto (`acceptEdits`) |
| `!!` | Reddish pink | Skip (`bypassPermissions`) |

# **How it works**
---

- One pass of stdin JSON; no per-field shelling out. Typical run ≈ 70 ms.
- The bar uses half-blocks with **two RGB samples per character** for 2× gradient resolution.
- Millisecond timing keeps the animation phase honest even with uneven repaint gaps.
- The account name is read from `~/.claude.json` (`.oauthAccount.displayName`).
- Git runs with `--no-optional-locks` so it never blocks.
- Every glyph is width-1 (no emoji), so alignment is exact across platforms and fonts.
