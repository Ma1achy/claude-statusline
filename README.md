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

## Requirements

- macOS or Linux (not native Windows; works under WSL)
- [`jq`](https://jqlang.github.io/jq/) — `brew install jq`
- `git`, `perl` (both ship with macOS)
- A terminal with truecolor support (iTerm2, Terminal.app, Windows Terminal)
- Claude Code with a Pro/Max subscription (for rate limit bars)

## Setup

1. Copy `statusline.sh` anywhere, e.g. `~/.claude/statusline.sh`
2. Make it executable: `chmod +x ~/.claude/statusline.sh`
3. Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/statusline.sh",
    "refreshInterval": 1
  }
}
```

`refreshInterval: 1` is required — the clock and animations update every second.

## Animation styles

Set `SL_SHIMMER` in the `env` block of `settings.json`:

```json
"env": {
  "SL_SHIMMER": "wave"
}
```

| Style | Effect |
|-------|--------|
| `wave` | A wide hue ripple rolls along the fill (default) |
| `sweep` | A soft hue crest glides across once, repeating |
| `comet` | Hue crest with a fading trail |
| `breathe` | The whole fill shifts hue up and back in unison |
| `scan` | Narrow hue crest bounces back and forth |
| `off` | Static |

All styles use the same truecolor green→red heat gradient and hue-shift effect — they differ only in how the crest moves.

## Tuning

| Variable | Default | Effect |
|----------|---------|--------|
| `SL_SHIMMER` | `wave` | Animation style |
| `SL_WAVE_HUE` | `32` | Hue rotation at crest peak (degrees; higher = stronger shift) |
| `SL_SPEED` | `3` | Crest travel speed (cells/sec) |
| `SL_RAINBOW_MIX` | `50` | Account name rainbow pastels (0 = vivid, 100 = white) |
| `SL_MARGIN` | `6` | Right-edge margin in columns (raise if content is clipped) |

Set any of these in the `env` block of `settings.json`.

## Permission glyphs

| Glyph | Color | Mode |
|-------|-------|------|
| `?` | Purple | Ask (default) |
| `⚡` | Yellow-orange | Auto (`acceptEdits`) |
| `!!` | Reddish pink | Skip (`bypassPermissions`) |

## Autocompact marker

A white `┃` on the context bar marks your autocompact threshold. Set it in `settings.json`:

```json
"env": {
  "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "40"
}
```

## How it works

- All JSON is extracted in a **single `jq` call** so the script runs in ~0.13s
- The context bar uses **half-blocks (`▌`)** with two RGB samples per character for 2× gradient resolution
- Millisecond timing via `perl -MTime::HiRes` keeps animation phase accurate even with uneven repaint gaps
- The account name is read from `~/.claude.json` at `.oauthAccount.displayName`
- Git info runs with `--no-optional-locks` so it never blocks
