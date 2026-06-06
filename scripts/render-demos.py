#!/usr/bin/env python3
"""Render the demo GIFs in assets/ from the built statusline.js.

Self-contained: creates a throwaway fake home + git repo (with a DUMMY email),
renders frames with PIL (Menlo, + Monaco for the ⎇ glyph), and writes GIFs.
macOS-oriented (system font paths). Usage:  python3 scripts/render-demos.py
"""
import json, os, shutil, subprocess, tempfile, re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SL = os.path.join(ROOT, "statusline.js")
OUT = os.path.join(ROOT, "assets")
DISPLAY_PATH = "~/dev/principia"          # what the path segment shows (real repo is a tempdir)
FONT_PATH = "/System/Library/Fonts/Menlo.ttc"
FB_PATH = "/System/Library/Fonts/Monaco.ttf"   # has ⎇, which Menlo lacks
SIZE, COLS, PAD = 26, "124", 22
BASE_MS = 1749135780000
BASE_SEC = BASE_MS // 1000
RL = {"five_hour": {"used_percentage": 63, "resets_at": BASE_SEC + 8100},
      "seven_day": {"used_percentage": 38, "resets_at": BASE_SEC + 280800}}

os.makedirs(OUT, exist_ok=True)
font = ImageFont.truetype(FONT_PATH, SIZE, index=0)
fb_font = ImageFont.truetype(FB_PATH, SIZE)
cap_font = ImageFont.truetype(FONT_PATH, 18, index=0)
FALLBACK = {"⎇"}
ascent, descent = font.getmetrics()
CELL_W, LINE_H = round(font.getlength("0")), ascent + descent + 6
BG, FG_DEFAULT, CAP = (16, 17, 24), (208, 212, 222), (120, 124, 138)
BASIC = {30: (60, 60, 70), 31: (224, 108, 117), 32: (60, 200, 120), 33: (229, 192, 60),
         34: (70, 130, 220), 35: (198, 120, 221), 36: (40, 200, 220), 37: (220, 222, 230)}


def setup_fixture():
    base = tempfile.mkdtemp(prefix="cs-demo-")
    home = os.path.join(base, "home")
    os.makedirs(os.path.join(home, ".claude"))
    json.dump({"oauthAccount": {"displayName": "Malachy", "emailAddress": "malachy@email.com"}},
              open(os.path.join(home, ".claude.json"), "w"))
    json.dump({"env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "40"}},
              open(os.path.join(home, ".claude", "settings.json"), "w"))
    repo = os.path.join(base, "principia")
    os.makedirs(repo)
    g = lambda *a: subprocess.run(["git", "-C", repo, *a], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    g("init", "-q")
    g("config", "user.email", "malachy@email.com")
    g("config", "user.name", "Malachy")
    g("config", "commit.gpgsign", "false")
    open(os.path.join(repo, "main.py"), "w").write("engine\n")
    g("add", "main.py"); g("commit", "-q", "-m", "init")
    g("checkout", "-q", "-b", "feat/statusline")
    open(os.path.join(repo, "main.py"), "a").write("wip\n"); g("stash", "-q")
    open(os.path.join(repo, "notes.tmp"), "w").write("scratch\n")
    return base, home, repo


def xterm256(n):
    if n < 16: return BASIC.get(30 + (n % 8), (220, 222, 230))
    if n <= 231:
        n -= 16; r, g, b = n // 36, (n % 36) // 6, n % 6
        f = lambda v: 0 if v == 0 else 55 + 40 * v
        return (f(r), f(g), f(b))
    v = 8 + 10 * (n - 232); return (v, v, v)


def parse(line):
    cells, i = [], 0
    fg = bg = None; dim = bold = False
    while i < len(line):
        if line[i] == "\x1b":
            m = re.match(r"\x1b\[([0-9;]*)m", line[i:])
            if m:
                ps = [int(x) for x in m.group(1).split(";") if x != ""] or [0]; j = 0
                while j < len(ps):
                    p = ps[j]
                    if p == 0: fg = bg = None; dim = bold = False
                    elif p == 1: bold = True
                    elif p == 2: dim = True
                    elif p == 22: dim = bold = False
                    elif 30 <= p <= 37: fg = BASIC[p]
                    elif p == 39: fg = None
                    elif 40 <= p <= 47: bg = BASIC[p - 10]
                    elif p == 49: bg = None
                    elif p in (38, 48):
                        col = None
                        if j + 1 < len(ps) and ps[j + 1] == 2: col = (ps[j + 2], ps[j + 3], ps[j + 4]); j += 4
                        elif j + 1 < len(ps) and ps[j + 1] == 5: col = xterm256(ps[j + 2]); j += 2
                        if p == 38: fg = col
                        else: bg = col
                    j += 1
                i += m.end(); continue
        f = fg if fg is not None else FG_DEFAULT
        if dim: f = tuple(int(v * 0.5) for v in f)
        elif bold: f = tuple(min(255, int(v * 1.12)) for v in f)
        cells.append((line[i], f, bg)); i += 1
    return cells


def width_of(lines): return max(len(parse(l)) for l in lines)


def render(lines, caption, W):
    cap_h = 30 if caption else 0
    img = Image.new("RGB", (W * CELL_W + 2 * PAD, 3 * LINE_H + 2 * PAD + cap_h), BG)
    d = ImageDraw.Draw(img)
    for row, line in enumerate(lines):
        y = PAD + row * LINE_H
        for col, (ch, fg, bg) in enumerate(parse(line)):
            x = PAD + col * CELL_W
            if bg is not None: d.rectangle([x, y, x + CELL_W, y + LINE_H], fill=bg)
            if ch != " ": d.text((x, y), ch, font=(fb_font if ch in FALLBACK else font), fill=fg)
    if caption: d.text((PAD, PAD + 3 * LINE_H + 8), caption, font=cap_font, fill=CAP)
    return img


def make_gif(home, repo, name, frames, duration):
    rendered = []
    for env_extra, fms, cap in frames:
        env_extra = dict(env_extra)
        pct, cost, dur = env_extra.pop("_pct", 42), env_extra.pop("_cost", 0.23), env_extra.pop("_dur", 1860000)
        env_extra.pop("_cap", None)
        env = {"HOME": home, "PATH": os.environ["PATH"], "COLUMNS": COLS, "TZ": "Europe/London", "SL_FRAME_MS": str(fms)}
        env.update({k: str(v) for k, v in env_extra.items()})
        sample = {"workspace": {"current_dir": repo},
                  "model": {"id": "claude-opus-4-8", "display_name": "Opus"},
                  "context_window": {"used_percentage": pct, "context_window_size": 200000,
                                     "current_usage": {"cache_read_input_tokens": 61000, "cache_creation_input_tokens": 1400,
                                                       "input_tokens": 380, "output_tokens": 210}},
                  "cost": {"total_cost_usd": cost, "total_duration_ms": dur, "total_lines_added": 124, "total_lines_removed": 18},
                  "permission_mode": "acceptEdits", "rate_limits": RL}
        out = subprocess.run(["node", SL], input=json.dumps(sample), env=env, capture_output=True, text=True).stdout
        out = out.replace(repo, DISPLAY_PATH)
        rendered.append((out.rstrip("\n").split("\n")[:3], cap))
    W = max(width_of(ls) for ls, _ in rendered)
    imgs = [render(ls, cap, W).convert("P", palette=Image.ADAPTIVE, colors=256) for ls, cap in rendered]
    path = os.path.join(OUT, name)
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=duration, loop=0, disposal=2)
    print("wrote", os.path.relpath(path, ROOT), f"({len(imgs)} frames)")


def main():
    base, home, repo = setup_fixture()
    try:
        make_gif(home, repo, "demo-default.gif",
                 [({"_pct": 20 + k * 4}, BASE_MS + k * 1000, None) for k in range(10)], 420)

        loaded = {"SL_PET": "on", "SL_CREST": "on", "SL_MOON": "on", "SL_DAYNIGHT": "on",
                  "SL_COST_FLAIR": "on", "SL_BURN": "on", "SL_GIT_EXTRA": "on", "SL_RAINBOW_STATS": "on", "SL_SHIMMER": "wave"}
        pcts = [22, 30, 45, 58, 68, 74, 82, 90, 90, 90]
        costs = [0.08, 0.12, 0.18, 0.27, 0.36, 0.48, 0.55, 0.72, 0.95, 1.20]
        make_gif(home, repo, "demo-loaded.gif",
                 [({**loaded, "_pct": pcts[k], "_cost": costs[k]}, BASE_MS + k * 1000, None) for k in range(10)], 480)

        tb = {"SL_CREST": "on", "SL_GIT_EXTRA": "on", "SL_RAINBOW_STATS": "on", "SL_SHIMMER": "wave", "_pct": 58}
        make_gif(home, repo, "demo-themes.gif",
                 [({**tb, "SL_THEME": t}, BASE_MS + k * 1000, f"SL_THEME={t}")
                  for t in ["heat", "synthwave", "matrix", "mono", "pastel", "dracula", "nord", "gruvbox", "tokyonight", "rosepine"]
                  for k in range(3)], 520)
        make_gif(home, repo, "demo-colormaps.gif",
                 [({**tb, "SL_THEME": t}, BASE_MS + k * 1000, f"SL_THEME={t}")
                  for t in ["viridis", "inferno", "magma", "plasma", "cividis"] for k in range(3)], 520)
        make_gif(home, repo, "demo-bar-styles.gif",
                 [({"SL_BAR_STYLE": b, "SL_SHIMMER": "sweep", "_pct": 62}, BASE_MS + k * 1000, f"SL_BAR_STYLE={b}")
                  for b in ["blocks", "pacman", "snake", "matrix"] for k in range(4)], 360)
        make_gif(home, repo, "demo-shimmer.gif",
                 [({"SL_SHIMMER": s, "_pct": 66}, BASE_MS + k * 1000, f"SL_SHIMMER={s}")
                  for s in ["sweep", "wave", "comet", "breathe", "scan"] for k in range(4)], 360)
        disco = {"SL_SHIMMER": "disco", "SL_RAINBOW_STATS": "on", "SL_PET": "on", "SL_CREST": "on", "_pct": 64}
        make_gif(home, repo, "demo-disco.gif",
                 [({**disco}, BASE_MS + k * 250, None) for k in range(12)], 220)
    finally:
        shutil.rmtree(base, ignore_errors=True)
    print("done")


if __name__ == "__main__":
    main()
