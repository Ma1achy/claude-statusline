# claude-statusline

A three-line animated statusline for [Claude Code](https://claude.ai/code). Pure Node.js,
cross-platform (Windows / macOS / Linux), no dependencies beyond `node` (and optionally `git`).

```
⚡ [Sonnet 4.6]                                        Sat 07 Jun  14:23:41
▌▌▌▌▌▌▌▌▌┃░░░░░░░░░░░░░░░░░  42% |40%  200k ✦96% ✦48k   5h ▌▌▌▌▌▌░░░░ 63%  2h 15m
/Users/you/proj › app.py  ⎇ main  you@example.com  +12/-3  ~2    Malachy  $0.23  4m
```

**Line 1** — permission glyph + model + effort + thinking mode | clock (seconds)
**Line 2** — animated context bar + % + cache stats | 5h and 7d usage bars
**Line 3** — full path › last file + git branch + email + deltas | account name + cost + session age

## Setup

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

`refreshInterval: 1` is required — it's in **seconds** (minimum 1); the clock and animation
update once per second.

### Windows notes

- Claude Code runs the statusline through **Git Bash** if [Git for Windows](https://git-scm.com/downloads/win)
  is installed, otherwise **PowerShell**. The script works under both.
- Use **forward slashes** in the path (Git Bash eats backslashes):
  `"command": "node C:/Users/you/.claude/statusline.js"`
- If `node` isn't on PATH, use its full path
  (e.g. `"command": "C:/Program Files/nodejs/node.exe C:/Users/you/.claude/statusline.js"`).

## Requirements

- `node` (ships with Claude Code's environment)
- `git` — optional; the git segments are skipped gracefully if absent or not in a repo
- A terminal with **truecolor** support (iTerm2, Terminal.app, Windows Terminal, most modern terminals)

## Animation styles (`SL_SHIMMER`)

```json
"env": { "SL_SHIMMER": "wave" }
```

| Style | Effect |
|-------|--------|
| `sweep` | A soft hue crest glides across the fill (default) |
| `wave` | A wide hue ripple rolls along |
| `comet` | Hue crest with a fading trail |
| `breathe` | The whole fill shifts hue up and back in unison |
| `scan` | Narrow hue crest bounces back and forth |
| `disco` | 🪩 Loud joke mode: per-cell rainbow + vivid fast-flowing name |
| `off` | Static |

All styles use a truecolor gradient and rotate **hue** at the crest — they differ only in how
the crest moves. Claude Code repaints at most once/second, so the gradient is smooth but motion
*steps* once per second (no sub-second animation).

## Themes (`SL_THEME`) and bar styles (`SL_BAR_STYLE`)

| `SL_THEME` | Look |
|------------|------|
| `heat` | Green→red heat gradient (default) |
| `matrix` | All-green, dark→bright ramp |
| `synthwave` | Magenta→cyan |
| `mono` | Greyscale brightness ramp |
| `pastel` | Soft, desaturated + pastel name |

| `SL_BAR_STYLE` | Look |
|----------------|------|
| `blocks` | Smooth half-block gradient (default) |
| `pacman` | `===C····` — a muncher eating dots |
| `snake` | `~~~@~` — a crawling snake |
| `matrix` | Green blocks with faint code-rain in the empty track |

## Opt-in extras

All default **off**. Enable in the `env` block with `on` / `1` / `true`. Everything is text-safe
(no emoji) so alignment stays correct in every terminal.

| Variable | Effect |
|----------|--------|
| `SL_SPINNER` | Braille spinner `⠋⠙⠹…` proving the line is live |
| `SL_PET` | ASCII pet whose mood tracks context %: `[^_^]`→`[._.]`→`[o_o]`→`[>_<]`; `[$_$]` when cost ≥ $0.50 |
| `SL_CREST` | Per-model accent: `★` Opus · `◆` Sonnet · `▲` Haiku |
| `SL_MOON` | Moon-phase glyph (`●◐○◑`) before the clock |
| `SL_DAYNIGHT` | Clock color shifts with the real hour (dawn → midday → dusk → night) |
| `SL_COST_FLAIR` | Spend-tier prefix on cost: `·` `$` `$$` `!$` |
| `SL_BURN` | Append `$/hr` burn rate after cost (once session ≥ 60s) |
| `SL_GIT_EXTRA` | Ahead/behind `↑2↓1`, last-commit age `·3m`, untracked `?N`, stash `s:N`, branch-mood tag `[wip]/[fix]/[feat]/[test]` |

## Tuning

| Variable | Default | Effect |
|----------|---------|--------|
| `SL_WAVE_HUE` | `32` | Hue rotation at crest peak (degrees) |
| `SL_SPEED` | `3` | Crest travel speed (cells/sec) |
| `SL_RAINBOW_MIX` | `50` | Account-name rainbow pastels (0 = vivid, 100 = white) |
| `SL_MARGIN` | `6` | Right-edge margin in columns (raise if content is clipped) |

## Permission glyphs

| Glyph | Color | Mode |
|-------|-------|------|
| `?` | Purple | Ask (default) |
| `⚡` | Yellow-orange | Auto (`acceptEdits`) |
| `!!` | Reddish pink | Skip (`bypassPermissions`) |

## Autocompact marker

A white `┃` on the context bar marks your autocompact threshold:

```json
"env": { "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "40" }
```

## How it works

- The context bar uses **half-blocks (`▌`)** with two RGB samples per character for 2× gradient resolution
- The account name is read from `~/.claude.json` at `.oauthAccount.displayName`, with an animated pastel rainbow
- Git info runs with `--no-optional-locks` so it never blocks
- All glyphs are width-1 (no emoji) so right-alignment is exact on every platform
