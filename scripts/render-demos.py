#!/usr/bin/env python3
"""Render the demo GIFs in assets/ from the built statusline.js.

Self-contained: creates a throwaway fake home + git repo (with a DUMMY email),
renders frames with PIL (Menlo, + Monaco for the ⎇ glyph), and writes GIFs.
macOS-oriented (system font paths). Usage:  python3 scripts/render-demos.py
"""
import json, os, shutil, subprocess, tempfile, re, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SL = os.path.join(ROOT, "statusline.js")
OUT = os.path.join(ROOT, "assets")
FONT_PATH = "/System/Library/Fonts/Menlo.ttc"
FB_PATH = "/System/Library/Fonts/Apple Symbols.ttf"   # draws ⎇ properly (Menlo/Monaco show a box)
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
    # Fixed clean path so the displayed cwd is tidy (and survives disco's per-glyph
    # colouring, which would break any string replacement).
    base = "/tmp/demo"
    shutil.rmtree(base, ignore_errors=True)
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
    fg = bg = None; dim = bold = ul = False
    while i < len(line):
        if line[i] == "\x1b":
            m = re.match(r"\x1b\[([0-9;]*)m", line[i:])
            if m:
                ps = [int(x) for x in m.group(1).split(";") if x != ""] or [0]; j = 0
                while j < len(ps):
                    p = ps[j]
                    if p == 0: fg = bg = None; dim = bold = ul = False
                    elif p == 1: bold = True
                    elif p == 2: dim = True
                    elif p == 4: ul = True
                    elif p == 22: dim = bold = False
                    elif p == 24: ul = False
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
        if 0xFE00 <= ord(line[i]) <= 0xFE0F:   # variation selector — zero width, skip
            i += 1; continue
        f = fg if fg is not None else FG_DEFAULT
        if dim: f = tuple(int(v * 0.5) for v in f)
        elif bold: f = tuple(min(255, int(v * 1.12)) for v in f)
        cells.append((line[i], f, bg, ul)); i += 1
    return cells


def width_of(lines): return max(len(parse(l)) for l in lines)


def render(lines, caption, W, nrows=3):
    cap_h = 30 if caption else 0
    img = Image.new("RGB", (W * CELL_W + 2 * PAD, nrows * LINE_H + 2 * PAD + cap_h), BG)
    d = ImageDraw.Draw(img)
    for row, line in enumerate(lines):
        y = PAD + row * LINE_H
        for col, (ch, fg, bg, ul) in enumerate(parse(line)):
            x = PAD + col * CELL_W
            if bg is not None: d.rectangle([x, y, x + CELL_W, y + LINE_H], fill=bg)
            if ch != " ": d.text((x, y), ch, font=(fb_font if ch in FALLBACK else font), fill=fg)
            if ul: d.line([(x, y + ascent + 2), (x + CELL_W, y + ascent + 2)], fill=fg, width=1)
    if caption: d.text((PAD, PAD + nrows * LINE_H + 8), caption, font=cap_font, fill=CAP)
    return img


def clear_state():
    # wipe the per-session ring-buffer dir so an animated trend starts clean
    shutil.rmtree(os.path.join(tempfile.gettempdir(), "claude-statusline"), ignore_errors=True)


# SL_* shorthand → JSON config keys (config now lives in ~/.claude/statusline.json).
SL_MAP = {
    "SL_THEME": ("theme", "s"), "SL_SHIMMER": ("shimmer", "s"), "SL_SPEED": ("speed", "i"),
    "SL_GLOW": ("glow", "i"), "SL_WAVE_HUE": ("waveHue", "i"), "SL_EASING": ("easing", "s"),
    "SL_AUTO_THEME": ("autoTheme", "s"), "SL_DAY_THEME": ("dayTheme", "s"), "SL_NIGHT_THEME": ("nightTheme", "s"),
    "SL_BAR_STYLE": ("barStyle", "s"), "SL_BAR_SCALE": ("barScale", "s"), "SL_RAINBOW_MIX": ("rainbowMix", "i"),
    "SL_MARGIN": ("margin", "i"), "SL_LAYOUT": ("layout", "s"), "SL_SEPARATOR": ("separator", "s"),
    "SL_HIDE": ("hide", "s"), "SL_PRIVACY_HIDE": ("privacyHide", "s"), "SL_PATH": ("path", "s"),
    "SL_ACCESSIBLE_GAUGE": ("accessibleGauge", "s"), "SL_PET_STYLE": ("petStyle", "s"),
    "SL_PET_REACTS_TO": ("petReactsTo", "s"), "SL_PRESET": ("preset", "s"),
    "SL_LIMIT_WARN": ("limitWarn", "i"), "SL_LIMIT_CRIT": ("limitCrit", "i"),
    "SL_PET": ("pet", "b"), "SL_CREST": ("crest", "b"), "SL_MOON": ("moon", "b"), "SL_DAYNIGHT": ("daynight", "b"),
    "SL_COST_FLAIR": ("costFlair", "b"), "SL_BURN": ("burn", "b"), "SL_GIT_EXTRA": ("gitExtra", "b"),
    "SL_RAINBOW_STATS": ("rainbowStats", "b"), "SL_TREND": ("trend", "b"), "SL_WEATHER": ("weather", "b"),
    "SL_LIMITS": ("limits", "b"), "SL_PRIVACY": ("privacy", "b"), "SL_SYSINFO": ("sysinfo", "b"),
    "SL_ACCESSIBLE": ("accessible", "b"), "SL_RESPONSIVE": ("responsive", "b"), "SL_GIT_RISK": ("gitRisk", "b"),
    "SL_DANGER": ("danger", "b"), "SL_NERDFONT": ("nerdfont", "b"),
}


# Object-valued config keys that map straight through (no SL_* shorthand): the
# style-engine fields used by the typography / custom-theme demos.
RAW_KEYS = {"elements", "customTheme", "base16", "glyphs", "labels", "themeFile"}


def to_config(d):
    conf = {}
    for k, v in d.items():
        if k in RAW_KEYS:
            conf[k] = v
            continue
        m = SL_MAP.get(k)
        if not m:
            continue
        key, t = m
        conf[key] = (str(v).lower() in ("on", "1", "true", "yes")) if t == "b" else int(v) if t == "i" else str(v)
    return conf


def make_gif(home, repo, name, frames, duration):
    rendered = []
    for env_extra, fms, cap in frames:
        env_extra = dict(env_extra)
        pct, cost, dur = env_extra.pop("_pct", 42), env_extra.pop("_cost", 0.23), env_extra.pop("_dur", 1860000)
        sid = env_extra.pop("_sid", None)
        setup = env_extra.pop("_setup", None)   # callable(repo): mutate the git fixture
        warm = env_extra.pop("_warm", False)    # run --git-refresh synchronously first
        env_extra.pop("_cap", None)
        if setup:
            setup(repo)
        # Write the per-frame JSON config; SL_CLOCK_MS freezes the clock so GIFs loop.
        with open(os.path.join(home, ".claude", "statusline.json"), "w") as f:
            json.dump(to_config(env_extra), f)
        env = {"HOME": home, "PATH": os.environ["PATH"], "COLUMNS": COLS, "TZ": "Europe/London",
               "SL_FRAME_MS": str(fms), "SL_CLOCK_MS": str(BASE_MS)}
        sample = {"workspace": {"current_dir": repo},
                  "model": {"id": "claude-opus-4-8", "display_name": "Opus"},
                  "context_window": {"used_percentage": pct, "context_window_size": 200000,
                                     "current_usage": {"cache_read_input_tokens": 61000, "cache_creation_input_tokens": 1400,
                                                       "input_tokens": 380, "output_tokens": 210}},
                  "cost": {"total_cost_usd": cost, "total_duration_ms": dur, "total_lines_added": 124, "total_lines_removed": 18},
                  "fast_mode": True, "rate_limits": RL}
        if sid:
            sample["session_id"] = sid
        # Git is read from the cache the detached refresher writes. For demos whose git
        # state changes per frame, warm it synchronously so the foreground paints it now.
        if warm:
            subprocess.run(["node", SL, "--git-refresh"], input=json.dumps(sample), env=env, capture_output=True, text=True)
        out = subprocess.run(["node", SL], input=json.dumps(sample), env=env, capture_output=True, text=True).stdout
        lines = out.rstrip("\n").split("\n")
        rendered.append((lines[:3], cap))
    W = max(width_of(ls) for ls, _ in rendered)
    nrows = max(len(ls) for ls, _ in rendered)
    imgs = [render(ls, cap, W, nrows).convert("P", palette=Image.ADAPTIVE, colors=256) for ls, cap in rendered]
    path = os.path.join(OUT, name)
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=duration, loop=0, disposal=2)
    print("wrote", os.path.relpath(path, ROOT), f"({len(imgs)} frames)")


def main():
    # Optional target: all (default) | default | loaded | themes | colormaps | bars |
    #   shimmer | fx | disco | presets | layouts | colors | trend | pets | reactive |
    #   scale | accessible | typography | git | spotlight | customtheme
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    want = lambda *names: target == "all" or target in names
    base, home, repo = setup_fixture()
    try:
        # Seamless loops: clock frozen, span = one rainbow period (6480 ms) so the
        # name + crest return to their start; pct/cost held constant.
        if want("default"):
            make_gif(home, repo, "demo-default.gif",
                     [({"_pct": 48, "SL_SPEED": 2}, BASE_MS + k * 540, None) for k in range(12)], 280)

        loaded = {"SL_PET": "on", "SL_CREST": "on", "SL_MOON": "on", "SL_DAYNIGHT": "on",
                  "SL_COST_FLAIR": "on", "SL_BURN": "on", "SL_GIT_EXTRA": "on", "SL_RAINBOW_STATS": "on",
                  "SL_TREND": "on", "SL_WEATHER": "on", "SL_SHIMMER": "wave", "SL_SPEED": 2}
        if want("loaded"):
            make_gif(home, repo, "demo-loaded.gif",
                     [({**loaded, "_pct": 48, "_cost": 0.55, "_sid": "loaded"}, BASE_MS + k * 540, None) for k in range(12)], 280)

        tb = {"SL_CREST": "on", "SL_GIT_EXTRA": "on", "SL_RAINBOW_STATS": "on", "SL_SHIMMER": "wave", "_pct": 58}
        if want("themes"):
            make_gif(home, repo, "demo-themes.gif",
                     [({**tb, "SL_THEME": t}, BASE_MS + k * 1000, f"SL_THEME={t}")
                      for t in ["heat", "synthwave", "matrix", "pastel", "dracula", "nord", "gruvbox", "tokyonight", "rosepine",
                                "catppuccin-mocha", "catppuccin-latte", "kanagawa", "everforest", "onedark", "monokai", "ayu-dark",
                                "github-dark", "cyberpunk", "phosphor", "gothic", "verdigris", "oceanic", "sumi-e", "pride"]
                      for k in range(3)], 480)
        if want("colormaps"):
            make_gif(home, repo, "demo-colormaps.gif",
                     [({**tb, "SL_THEME": t}, BASE_MS + k * 1000, f"SL_THEME={t}")
                      for t in ["viridis", "inferno", "magma", "plasma", "cividis", "twilight", "cubehelix", "batlow", "turbo", "coolwarm", "ice"] for k in range(3)], 480)
        if want("bars"):
            make_gif(home, repo, "demo-bar-styles.gif",
                     [({"SL_BAR_STYLE": b, "SL_SHIMMER": "sweep", "_pct": 62}, BASE_MS + k * 1000, f"SL_BAR_STYLE={b}")
                      for b in ["blocks", "pacman", "snake", "matrix", "braille", "battery", "thermo", "shade", "lines", "rule", "equalizer", "dna", "train"] for k in range(4)], 340)
        if want("shimmer"):
            make_gif(home, repo, "demo-shimmer.gif",
                     [({"SL_SHIMMER": s, "_pct": 66}, BASE_MS + k * 1000, f"SL_SHIMMER={s}")
                      for s in ["sweep", "wave", "comet", "breathe", "scan"] for k in range(5)], 320)
        if want("fx"):
            make_gif(home, repo, "demo-shimmer-fx.gif",
                     [({"SL_SHIMMER": s, "SL_RAINBOW_STATS": "on", "_pct": 66}, BASE_MS + k * 900, f"SL_SHIMMER={s}")
                      for s in ["drift", "plasma", "lumin", "heartbeat", "twinkle", "storm", "glitch", "morse"] for k in range(5)], 300)
        if want("presets"):
            make_gif(home, repo, "demo-presets.gif",
                     [({"SL_PRESET": p, "_pct": 58}, BASE_MS + k * 700, f"SL_PRESET={p}")
                      for p in ["minimal", "pretty", "focus", "chaos", "demo"] for k in range(4)], 360)
        if want("layouts"):
            make_gif(home, repo, "demo-layouts.gif",
                     [({"SL_LAYOUT": ly, "SL_CREST": "on", "SL_GIT_EXTRA": "on", "SL_RAINBOW_STATS": "on", "SL_SHIMMER": "wave", "_pct": 58}, BASE_MS + k * 700, f"SL_LAYOUT={ly}")
                      for ly in ["3line", "2line", "1line", "tiny"] for k in range(4)], 360)
        if want("colors"):
            make_gif(home, repo, "demo-color-modes.gif",
                     [({"SL_COLOR_MODE": m, "SL_THEME": "viridis", "SL_CREST": "on", "_pct": 62}, BASE_MS + k * 800, f"SL_COLOR_MODE={m}")
                      for m in ["truecolor", "256", "16", "mono"] for k in range(3)], 460)
        if want("trend"):
            clear_state()  # start the sparkline empty so it visibly grows
            make_gif(home, repo, "demo-trend.gif",
                     [({"SL_TREND": "on", "SL_WEATHER": "on", "SL_SHIMMER": "wave",
                        "_sid": "trenddemo", "_pct": 8 + k * 7, "_dur": 60000 * (k + 1)}, BASE_MS + k * 450, None)
                      for k in range(11)], 420)
        if want("pets"):
            make_gif(home, repo, "demo-pets.gif",
                     [({"SL_PET": "on", "SL_PET_STYLE": p, "_pct": 78}, BASE_MS + k * 800, f"SL_PET_STYLE={p}")
                      for p in ["default", "cat", "frog", "robot", "ghost", "slime", "dog"] for k in range(2)], 520)
        if want("reactive"):
            # silver-halide stays crisp, then the danger wash kicks in at high context
            frames = [({"SL_THEME": "silver-halide", "SL_GIT_EXTRA": "on", "_pct": 55}, BASE_MS + k * 600, "calm") for k in range(4)]
            frames += [({"SL_THEME": "silver-halide", "SL_GIT_EXTRA": "on", "_pct": 96}, BASE_MS + k * 250, "context critical → danger wash") for k in range(8)]
            make_gif(home, repo, "demo-reactive.gif", frames, 320)
        if want("scale"):
            make_gif(home, repo, "demo-bar-scale.gif",
                     [({"SL_BAR_SCALE": s, "SL_THEME": "heat", "_pct": 88}, BASE_MS + k * 800, f"SL_BAR_SCALE={s}  (88%)")
                      for s in ["linear", "log"] for k in range(3)], 520)
        if want("accessible"):
            # SL_ACCESSIBLE: high-contrast (AAA-contrast primaries, bright white text)
            # and motion off. Nothing animates, so sweep the context level to show each
            # SL_ACCESSIBLE_GAUGE ramp filling the bar. CVD-safe blue→yellow is default.
            sweep = [20, 45, 70, 90, 70, 45]
            make_gif(home, repo, "demo-accessible.gif",
                     [({"SL_ACCESSIBLE": "on", "SL_ACCESSIBLE_GAUGE": gauge, "SL_GIT_EXTRA": "on",
                        "SL_CREST": "on", "_pct": p, "_sid": "a11y"}, BASE_MS,
                       f"SL_ACCESSIBLE=on  SL_ACCESSIBLE_GAUGE={gauge}")
                      for gauge in ["cvd", "traffic", "grayscale"] for p in sweep], 360)
        # disco loops perfectly over 10800 ms (bar hue 1 cycle, name 5 cycles).
        disco = {"SL_SHIMMER": "disco", "SL_RAINBOW_STATS": "on", "SL_PET": "on", "SL_CREST": "on", "_pct": 64}
        if want("disco"):
            make_gif(home, repo, "demo-disco.gif",
                     [({**disco}, BASE_MS + k * 900, None) for k in range(12)], 240)

        # ── typography / style engine: per-element fill, case, weight, underline ──
        # (Unicode pseudo-fonts — bold/italic/script/smallcaps — are terminal-font
        # dependent and don't render in this Menlo-based rasteriser, so they're
        # described in the README rather than shown here.)
        if want("typography", "typo"):
            tb = {"SL_THEME": "nord", "SL_CREST": "on", "SL_GIT_EXTRA": "on", "_pct": 58, "_warm": True, "_sid": "typo"}
            frames = [({**tb}, BASE_MS, "default — every element has a built-in style") for _ in range(3)]
            frames += [({**tb, "elements": {"model.tier": {"fill": "gold"}, "git.branch": {"fill": "ok"},
                                            "name": {"fill": "warn"}, "cost.amount": {"fill": "accent"}}},
                        BASE_MS, "elements.<id>.fill — recolour any element") for _ in range(4)]
            frames += [({**tb, "elements": {"model.tier": {"case": "upper", "weight": "bold"},
                                            "git.branch": {"case": "upper"}}},
                        BASE_MS, "elements.<id>.case — UPPER · weight: bold") for _ in range(4)]
            frames += [({**tb, "elements": {"name": {"weight": "bold", "attrs": ["underline"]},
                                            "cost.amount": {"fill": "gold", "attrs": ["underline"]},
                                            "ctx.pct": {"weight": "bold"}}},
                        BASE_MS, "attrs: underline + weight") for _ in range(4)]
            # a theme can carry its own per-element styling (showcase animates name+clock);
            # override its small-caps branch off so it doesn't tofu in this rasteriser.
            show = {"SL_THEME": "showcase", "SL_CREST": "on", "SL_GIT_EXTRA": "on",
                    "elements": {"git.branch": {"font": "none"}}, "_pct": 58, "_warm": True, "_sid": "typo2"}
            frames += [({**show}, BASE_MS + k * 540, "theme: showcase — themes restyle & animate elements") for k in range(8)]
            make_gif(home, repo, "demo-typography.gif", frames, 360)

        # ── git states: clean → dirty → staged → untracked → stash → ahead/behind →
        #    detached → risk. A dedicated fixture with an upstream so ↑/↓ work. ──────
        if want("git"):
            gbase = "/tmp/demo-gitstates"
            shutil.rmtree(gbase, ignore_errors=True)
            ghome = os.path.join(gbase, "home"); os.makedirs(os.path.join(ghome, ".claude"))
            json.dump({"oauthAccount": {"displayName": "Malachy", "emailAddress": "malachy@email.com"}},
                      open(os.path.join(ghome, ".claude.json"), "w"))
            json.dump({"env": {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "40"}},
                      open(os.path.join(ghome, ".claude", "settings.json"), "w"))
            remote = os.path.join(gbase, "origin.git")
            grepo = os.path.join(gbase, "work")
            subprocess.run(["git", "init", "-q", "--bare", remote], check=True)
            subprocess.run(["git", "init", "-q", "-b", "main", grepo], check=True)
            G = lambda *a: subprocess.run(["git", "-C", grepo, *a], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            G("config", "user.email", "malachy@email.com"); G("config", "user.name", "Malachy"); G("config", "commit.gpgsign", "false")
            open(os.path.join(grepo, "engine.py"), "w").write("print('hi')\n")
            G("add", "engine.py"); G("commit", "-q", "-m", "init"); G("remote", "add", "origin", remote)
            G("push", "-q", "-u", "origin", "main")
            G("commit", "-q", "--allow-empty", "-m", "upstream work"); G("push", "-q", "origin", "main")
            G("reset", "-q", "--hard", "origin/main")
            G("checkout", "-q", "-b", "feat/statusline"); G("branch", "-q", "--set-upstream-to=origin/main", "feat/statusline")

            def reset(_r):
                G("checkout", "-q", "-B", "feat/statusline", "origin/main")
                G("branch", "-q", "--set-upstream-to=origin/main", "feat/statusline")
                G("stash", "clear")
                subprocess.run(["git", "-C", grepo, "clean", "-fdq"], check=True)

            def edit(): open(os.path.join(grepo, "engine.py"), "a").write("# wip\n")
            def s_clean(r): reset(r)
            def s_dirty(r): reset(r); edit()
            def s_staged(r): reset(r); edit(); G("add", "engine.py")
            def s_untracked(r): reset(r); open(os.path.join(grepo, "scratch.tmp"), "w").write("x\n")
            def s_stash(r): reset(r); edit(); G("stash", "-q")
            def s_ahead(r): reset(r); open(os.path.join(grepo, "feature.py"), "w").write("new\n"); G("add", "feature.py"); G("commit", "-q", "-m", "feature")
            def s_behind(r): reset(r); G("reset", "-q", "--hard", "origin/main~1")
            def s_detached(r): reset(r); G("checkout", "-q", "--detach", "HEAD")
            def s_risk(r):
                # behind upstream (+1) + a stash (+1) + 12 changes (≥10 → +2) = 4 → high
                reset(r); G("reset", "-q", "--hard", "origin/main~1"); edit(); G("stash", "-q")
                for i in range(12):
                    open(os.path.join(grepo, f"d{i}.py"), "w").write("x\n")

            states = [
                (s_clean, "clean — on feat/statusline"),
                (s_dirty, "uncommitted edits   ~1"),
                (s_staged, "staged   ●1"),
                (s_untracked, "untracked   ?1"),
                (s_stash, "stashed   s:1"),
                (s_ahead, "ahead of upstream   ↑1"),
                (s_behind, "behind upstream   ↓1"),
                (s_detached, "detached HEAD   :sha"),
                (s_risk, "risk:high   (gitRisk: behind + stash + many edits)"),
            ]
            gframes = []
            for fn, cap in states:
                extra = {"SL_GIT_EXTRA": "on", "_pct": 52, "_setup": fn, "_warm": True, "_sid": "gitdemo"}
                if "risk" in cap:
                    extra["SL_GIT_RISK"] = "on"
                gframes.append((extra, BASE_MS, cap))
            make_gif(ghome, grepo, "demo-git.gif", gframes, 1400)
            shutil.rmtree(gbase, ignore_errors=True)

        # ── feature spotlight: each opt-in extra shown on its own ─────────────────
        if want("spotlight", "spot"):
            sb = {"_pct": 52, "_warm": True, "_sid": "spot"}
            spot = [
                ({}, "default"),
                ({"SL_CREST": "on"}, "crest ★ — model-tier badge"),
                ({"SL_MOON": "on"}, "moon ◐ — lunar phase"),
                ({"SL_DAYNIGHT": "on"}, "daynight — clock tinted by the hour"),
                ({"SL_WEATHER": "on"}, "weather — a word for context pressure"),
                ({"SL_COST_FLAIR": "on", "_cost": 0.55}, "cost flair  $$"),
                ({"SL_BURN": "on", "_cost": 0.55}, "burn rate  $/hr"),
                ({"SL_SYSINFO": "on"}, "sysinfo ↯ — load average"),
                ({"SL_PET": "on"}, "pet [^_^]"),
            ]
            make_gif(home, repo, "demo-spotlight.gif",
                     [({**sb, **e}, BASE_MS, cap) for e, cap in spot], 1300)

        # ── custom themes: base16 paste-in, inline JSON theme, per-element restyle ─
        if want("customtheme", "custom"):
            base16 = ("282828 cc241d 98971a d79921 458588 b16286 689d6a a89984 "
                      "928374 fb4934 b8bb26 fabd2f 83a598 d3869b 8ec07c ebdbb2")  # gruvbox base16
            inline = {"cmap": [[40, 40, 64], [90, 120, 200], [120, 220, 190], [240, 200, 90]], "mix": 20,
                      "palette": {"RED": [230, 96, 96], "GREEN": [120, 220, 150], "AMBER": [240, 200, 90],
                                  "BLUE": [96, 150, 240], "CYAN": [100, 220, 220], "WHITE": [236, 236, 240], "GOLD": [240, 200, 120]}}
            cb = {"SL_CREST": "on", "SL_GIT_EXTRA": "on", "SL_SHIMMER": "wave", "_pct": 60, "_warm": True, "_sid": "cust"}
            frames = [({**cb, "SL_THEME": "custom", "base16": base16}, BASE_MS + k * 600,
                       "base16 — paste any 16-colour palette") for k in range(5)]
            frames += [({**cb, "SL_THEME": "custom", "customTheme": inline}, BASE_MS + k * 600,
                        "customTheme — an inline JSON theme") for k in range(5)]
            frames += [({**cb, "SL_THEME": "cyberpunk", "_cost": 0.55}, BASE_MS + k * 600,
                        "themes restyle elements (cyberpunk: accent clock, bold cost)") for k in range(5)]
            make_gif(home, repo, "demo-custom-theme.gif", frames, 360)
    finally:
        shutil.rmtree(base, ignore_errors=True)
    print("done")


if __name__ == "__main__":
    main()
