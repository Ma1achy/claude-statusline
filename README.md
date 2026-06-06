# claude-statusline

A three-line animated statusline for [Claude Code](https://claude.ai/code).

```
⚡ [Sonnet 4.6]                                        Sat 07 Jun  14:23:41
▌▌▌▌▌▌▌▌▌┃░░░░░░░░░░░░░░░░░  42% |40%  200k ✦96% ✦48k   5h ▌▌▌▌▌▌░░░░ 63%  2h 15m
/Users/you/proj › app.py  ⎇ main  you@example.com  +12/-3  ~2    Malachy  $0.23  4m
```

**Line 1** — permission glyph + model + effort + thinking mode | clock (seconds)
**Line 2** — animated context bar + % + cache stats | 5h and 7d usage bars
**Line 3** — full path › last file + git branch + email + deltas | account name + cost + session age

## Two implementations

| File | Runs on | Needs |
|------|---------|-------|
| **`statusline.js`** (recommended) | Windows, macOS, Linux | `node` (ships with Claude Code) |
| `statusline.sh` | macOS, Linux, Windows *(Git Bash only)* | `bash`, `jq`, `perl` |

Both produce byte-identical output. **Use `statusline.js` for cross-platform** — it has no external dependencies beyond Node (built-in JSON + timing, no `jq`/`perl`), and `node` is the same command on every OS. `git` is used if present and skipped gracefully if not.

## Setup (Node — all platforms)

1. Copy `statusline.js` somewhere, e.g. `~/.claude/statusline.js`
2. Add to your `~/.claude/settings.json` (on Windows: `%USERPROFILE%\.claude\settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/statusline.js",
    "refreshInterval": 1
  }
}
```

`refreshInterval: 1` is required — it's in **seconds** (minimum 1), and the clock + animation update once per second.

### Windows notes

- Claude Code runs the statusline through **Git Bash** if [Git for Windows](https://git-scm.com/downloads/win) is installed, otherwise **PowerShell**. The Node script works under both.
- Use **forward slashes** in the `command` path. Git Bash eats backslashes:
  ```json
  "command": "node C:/Users/you/.claude/statusline.js"
  ```
- If `node` isn't on PATH, use its full path (e.g. `"command": "C:/Program Files/nodejs/node.exe C:/Users/you/.claude/statusline.js"`).

### Setup (Bash alternative — macOS/Linux)

Requires `jq` (`brew install jq` / `apt install jq`). Point the command at `statusline.sh`:

```json
"command": "bash ~/.claude/statusline.sh"
```

## Animation styles

Set `SL_SHIMMER` in the `env` block of `settings.json`:

```json
"env": { "SL_SHIMMER": "wave" }
```

| Style | Effect |
|-------|--------|
| `sweep` | A soft hue crest glides across the fill (default) |
| `wave` | A wide hue ripple rolls along |
| `comet` | Hue crest with a fading trail chases along |
| `breathe` | The whole fill shifts hue up and back in unison |
| `scan` | Narrow hue crest bounces back and forth |
| `off` | Static |

All styles use the same truecolor green→red heat gradient and rotate **hue** (toward cooler tones) at the crest — they differ only in how the crest moves. Note: Claude Code repaints at most once per second, so the gradient is smooth but motion *steps* once per second; there is no sub-second animation.

## Tuning

Set any of these in the `env` block of `settings.json`:

| Variable | Default | Effect |
|----------|---------|--------|
| `SL_SHIMMER` | `sweep` | Animation style |
| `SL_WAVE_HUE` | `32` | Hue rotation at crest peak (degrees; higher = stronger shift) |
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
- A truecolor green→red heat gradient maps to context usage; a moving hue crest animates it
- The account name is read from `~/.claude.json` at `.oauthAccount.displayName`, with an animated pastel rainbow
- Git info runs with `--no-optional-locks` so it never blocks
- Requires a terminal with **truecolor** support (iTerm2, Terminal.app, Windows Terminal, most modern terminals)
