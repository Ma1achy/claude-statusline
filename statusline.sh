#!/bin/bash
# ~/.claude/statusline.sh
# Three-line statusline for Claude Code
# Requires: jq, git
#
# Layout:
#   1  {glyph} [Model 1M effort thinking]                           Day DD Mon  HH:MM:SS
#   2  ∅ [context-bar] pct |cmp  ctx cache…               5h [bar] %  7d [bar] %
#   3  dir › file  ⎇ branch  +adds/-dels ~dirty ●staged                $cost  1h 32m
#
# The context-bar head shimmers AND the clock ticks seconds, so the line
# must repaint every second. REQUIRED in settings.json:
#     "statusLine": { ..., "refreshInterval": 1 }

export LC_ALL=${LC_ALL:-en_US.UTF-8}   # so wc -m counts glyphs, not bytes

input=$(cat)

# ─────────────────────────────────────────────
# COLOURS — real ESC bytes (so width-math AND output both work on BSD)
# ─────────────────────────────────────────────
ESC=$'\033'
R=$'\033[0m'
DIM=$'\033[2m'
BOLD=$'\033[1m'
RED=$'\033[31m'
GREEN=$'\033[32m'
AMBER=$'\033[33m'
BLUE=$'\033[34m'
MAGENTA=$'\033[35m'
CYAN=$'\033[36m'
WHITE=$'\033[37m'
GOLD=$'\033[38;5;220m'

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
# Strip ANSI using a REAL ESC in the pattern (BSD sed ignores "\033").
strip_ansi() { printf '%s' "$1" | sed "s/${ESC}\[[0-9;]*m//g"; }

# Visible width — count characters of the stripped string.
printlen() { strip_ansi "$1" | wc -m | tr -d ' '; }

term_cols() {
  local c
  c=$(tput cols 2>/dev/null) || c=""
  [ -z "$c" ] && c="${COLUMNS:-120}"
  { [ "$c" -lt 20 ] 2>/dev/null; } && c=120
  printf '%s' "$c"
}

# Print "left ........ right", right-flushed to the terminal width.
# MARGIN keeps the right content clear of Claude Code's statusline gutter
# (left indent + the column it reserves for its "…" truncation). Tune
# with SL_MARGIN: raise it if the right edge is still clipped, lower it
# if there's too much empty space on the right.
SL_MARGIN=${SL_MARGIN:-6}
justified() {
  local left="$1" right="$2"
  if [ -z "$(strip_ansi "$right")" ]; then printf '%s\n' "$left"; return; fi
  local cols pad ll rl
  cols=$(term_cols)
  ll=$(printlen "$left"); rl=$(printlen "$right")
  pad=$(( cols - ll - rl - SL_MARGIN ))
  [ "$pad" -lt 1 ] && pad=1
  printf '%s%*s%s\n' "$left" "$pad" "" "$right"
}

fmt_k() {
  local n=$1
  if   [ "$n" -ge 1000000 ]; then printf "%dM" $(( n / 1000000 ))
  elif [ "$n" -ge 1000 ];    then printf "%dk" $(( n / 1000 ))
  else                            printf "%d" "$n"
  fi
}

# Seconds-until → Xd Yh / Xh Ym / Xm
fmt_countdown() {
  local secs=$1
  if   [ "$secs" -ge 86400 ]; then printf "%dd %dh" $(( secs/86400 )) $(( (secs%86400)/3600 ))
  elif [ "$secs" -ge 3600 ];  then printf "%dh %dm" $(( secs/3600 ))  $(( (secs%3600)/60 ))
  else                             printf "%dm"     $(( secs/60 ))
  fi
}

# ─────────────────────────────────────────────
# HIGH-RES CLOCK — millisecond frame counter. Claude Code only repaints once
# per second, so this can't make motion sub-second-smooth; it just keeps the
# animation phase honest (uneven repaint gaps stay correctly positioned) and
# drives the rainbow. perl Time::HiRes ships with every macOS; fall back to secs.
# ─────────────────────────────────────────────
NOW_MS=${SL_FRAME_MS:-$(perl -MTime::HiRes=time -e 'printf "%d", time()*1000' 2>/dev/null)}
[ -z "$NOW_MS" ] && NOW_MS=$(( $(date +%s) * 1000 ))
BASE_FRAME=$(( NOW_MS / 1000 ))        # whole seconds, for the clock

# ─────────────────────────────────────────────
# ANIMATED BAR ENGINE — drives every % bar
# Style via SL_SHIMMER:  sweep | comet | breathe | wave | scan | off
#   sweep   — a soft hue crest glides across the fill (default)
#   comet   — a hue crest with a fading trail chases along the fill
#   breathe — the whole fill shifts hue up and back, in unison
#   wave    — a wide hue ripple rolls along
#   scan    — a narrow hue crest bounces back and forth (Cylon)
#   off     — static
#   (aliases: pulse → breathe, march → scan)
# All styles share the truecolor green→red heat gradient and the SAME effect:
# they rotate HUE (toward cooler tones) by up to WAVE_HUE at the crest, at
# constant brightness/saturation. They differ ONLY in how the crest moves.
# NOTE: Claude Code repaints the statusline at most once per second
# (refreshInterval is in SECONDS, minimum 1), so the *gradient* is smooth but
# the *motion* steps once per second — there is no sub-second animation.
# ─────────────────────────────────────────────
SHIMMER=${SL_SHIMMER:-sweep}
case "$SHIMMER" in pulse) SHIMMER=breathe ;; march) SHIMMER=scan ;; esac
SPEED=${SL_SPEED:-3}           # sweep/comet/wave/scan: cells crossed per second.
                               # Claude Code repaints the statusline at most
                               # ONCE PER SECOND (refreshInterval is in seconds,
                               # min 1), so the highlight steps ~SPEED cells each
                               # repaint. Keep it low (2–4) or motion teleports.
GLOW=${SL_GLOW:-240}           # sweep: half-width of the sheen (centicells; ~2.4 cells)
WAVE_HUE=${SL_WAVE_HUE:-32}    # wave: peak hue rotation (°) at the ripple crest

# _px SX — colour of the sub-pixel at centicell position SX along the bar.
#   Reads draw_bar's locals (width/posc/bs/bvv/vboost) via bash dynamic scope
#   and returns the RGB in PR/PG/PB. Sampled TWICE per character so each cell
#   shows two colours through the ▌ half-block = 2× gradient resolution.
_px() {
  local sx=$1 posp bh hoff=0 hh vv vmax vmin reg fr ris fal r g b dc lead
  posp=$(( sx / width )); [ $posp -gt 100 ] && posp=100; [ $posp -lt 0 ] && posp=0
  bh=$(( 120 - posp * 120 / 100 ))         # green(120°)→red(0°) by position
  # All styles rotate hue by up to WAVE_HUE at the crest — they only differ in
  # the crest's shape/motion. breathe shifts every cell uniformly (hglob).
  case "$SHIMMER" in
    sweep) dc=$(( sx - posc )); [ $dc -lt 0 ] && dc=$(( -dc ))
           [ $dc -lt $GLOW ] && hoff=$(( WAVE_HUE*(GLOW-dc)*(GLOW-dc)/(GLOW*GLOW) )) ;;
    wave)  dc=$(( sx - posc )); [ $dc -lt 0 ] && dc=$(( -dc ))
           [ $dc -lt 450 ] && hoff=$(( WAVE_HUE*(450-dc)/450 )) ;;
    comet) lead=$(( posc - sx ))
           [ $lead -ge 0 ] && [ $lead -lt 420 ] && hoff=$(( WAVE_HUE*(420-lead)/420 ))
           dc=$(( sx - posc )); [ $dc -lt 0 ] && dc=$(( -dc ))
           [ $dc -lt 70 ] && hoff=$WAVE_HUE ;;
    scan)  dc=$(( sx - posc )); [ $dc -lt 0 ] && dc=$(( -dc ))
           [ $dc -lt 140 ] && hoff=$(( WAVE_HUE*(140-dc)/140 )) ;;
    breathe) hoff=$hglob ;;
  esac
  hh=$(( ((bh+hoff)%360+360)%360 ))
  vv=$bvv; [ $vv -gt 100 ] && vv=100
  vmax=$(( 255*vv/100 )); vmin=$(( vmax*(100-bs)/100 ))
  reg=$(( hh/60 )); fr=$(( hh%60 ))
  ris=$(( vmin+(vmax-vmin)*fr/60 )); fal=$(( vmax-(vmax-vmin)*fr/60 ))
  case $reg in
    0) r=$vmax;g=$ris; b=$vmin;; 1) r=$fal; g=$vmax;b=$vmin;; 2) r=$vmin;g=$vmax;b=$ris;;
    3) r=$vmin;g=$fal; b=$vmax;; 4) r=$ris; g=$vmin;b=$vmax;; *) r=$vmax;g=$vmin;b=$fal;;
  esac
  PR=$r; PG=$g; PB=$b
}

# draw_bar WIDTH FILLED MARKER PHASE_MS
#   Each filled char is a ▌ half-block: fg = colour of its left half, bg = colour
#   of its right half (two _px samples), so the gradient + sheen are 2× as smooth.
#   MARKER: white ┃ (-1=none), never animates. PHASE_MS: per-bar ms offset.
draw_bar() {
  local width=$1 filled=$2 marker=$3 phase=${4:-0}
  local t=$(( NOW_MS + phase ))
  local i out="" lx rx span cyclec posc tri lr lg lb
  local bs=88 bvv=84 hglob=0
  span=$filled; [ "$span" -lt 1 ] && span=1

  # pre-loop: crest position / global hue offset shared by every cell
  case "$SHIMMER" in
    sweep|comet|wave)
      cyclec=$(( (span+4)*100 )); posc=$(( (t*SPEED/10) % cyclec )) ;;
    scan)
      cyclec=$(( span*200 )); [ "$cyclec" -lt 1 ] && cyclec=1
      posc=$(( (t*SPEED/10) % cyclec )); [ $posc -ge $(( span*100 )) ] && posc=$(( span*200 - posc )) ;;
    breathe)
      tri=$(( t % 2600 )); [ $tri -ge 1300 ] && tri=$(( 2600 - tri )); hglob=$(( WAVE_HUE*tri/1300 )) ;;
  esac

  for (( i=0; i<width; i++ )); do
    if [ "$marker" -ge 0 ] && [ $i -eq "$marker" ]; then out="${out}${WHITE}┃${R}"; continue; fi
    if [ $i -ge $filled ]; then out="${out}${DIM}░${R}"; continue; fi
    lx=$(( i*100+25 )); rx=$(( i*100+75 ))
    _px $lx; lr=$PR; lg=$PG; lb=$PB     # left half
    _px $rx                              # right half → PR/PG/PB
    out="${out}${ESC}[38;2;${lr};${lg};${lb};48;2;${PR};${PG};${PB}m▌${R}"
  done
  printf '%s' "$out"
}

# ─────────────────────────────────────────────
# RAINBOW — animated per-letter hue gradient (24-bit truecolour).
# Each letter's hue = its position + the wall-clock frame, so the
# rainbow flows along the text once per second. Honours SL_SHIMMER=off.
# ─────────────────────────────────────────────
RAINBOW_MIX=${SL_RAINBOW_MIX:-50}   # % blended toward white (higher = more pastel)

hue_rgb() {   # $1 = hue (any int), $2 = white-mix% -> pastel "r;g;b"
  local h=$1 mix=${2:-0} region f rise fall r g b
  h=$(( (h % 360 + 360) % 360 ))
  region=$(( h / 60 )); f=$(( h % 60 ))
  rise=$(( f * 255 / 60 )); fall=$(( 255 - rise ))
  case $region in
    0) r=255;   g=$rise; b=0 ;;
    1) r=$fall; g=255;   b=0 ;;
    2) r=0;     g=255;   b=$rise ;;
    3) r=0;     g=$fall; b=255 ;;
    4) r=$rise; g=0;     b=255 ;;
    *) r=255;   g=0;     b=$fall ;;
  esac
  # blend toward white for a softer, pastel tone
  printf '%d;%d;%d' $(( r + (255-r)*mix/100 )) $(( g + (255-g)*mix/100 )) $(( b + (255-b)*mix/100 ))
}

rainbow() {   # $1 = text -> per-letter animated pastel rainbow string
  local text="$1" out="" i len ch hue
  local step=38                     # degrees of hue per letter
  local frame=$NOW_MS
  [ "$SHIMMER" = "off" ] && frame=0
  len=${#text}
  for (( i=0; i<len; i++ )); do
    ch="${text:i:1}"
    hue=$(( i * step + frame / 18 ))   # ms-driven flow (~56°/sec), smooth
    out="${out}${ESC}[38;2;$(hue_rgb $hue $RAINBOW_MIX)m${ch}"
  done
  printf '%s%s' "$out" "$R"
}

# ─────────────────────────────────────────────
# EXTRACT JSON FIELDS — ONE jq call (≈20 process spawns → 1, so the script
# is light enough to repaint many times a second). Fields are emitted one
# per line in a fixed order and read into F[]. Paths never contain newlines.
# ─────────────────────────────────────────────
# Fields joined by US (\x1f) — a non-whitespace delimiter so empty values are
# preserved on split (mapfile/readarray are unavailable in macOS bash 3.2; and
# a newline/tab IFS would collapse blank fields). A trailing sentinel guards the
# real last field from read's trailing-empty edge case.
SL_RAW=$(echo "$input" | jq -r '
  [ (.workspace.current_dir // ""),
    (.workspace.project_dir // ""),
    (.model.id // ""),
    (.model.display_name // "Claude"),
    ((.context_window.used_percentage // 0) | floor),
    (.context_window.context_window_size // 200000),
    (.cost.total_lines_added // 0),
    (.cost.total_lines_removed // 0),
    (.cost.total_cost_usd // 0),
    ((.cost.total_duration_ms // 0) | floor),
    (.permission_mode // ""),
    (.transcript_path // ""),
    (.effort.level // ""),
    (.thinking.enabled // false),
    (.context_window.current_usage == null),
    (.context_window.current_usage.cache_read_input_tokens // 0),
    (.context_window.current_usage.cache_creation_input_tokens // 0),
    (.context_window.current_usage.input_tokens // 0),
    (.context_window.current_usage.output_tokens // 0),
    (.rate_limits != null),
    ((.rate_limits.five_hour.used_percentage // 0) | floor),
    (.rate_limits.five_hour.resets_at // ""),
    ((.rate_limits.seven_day.used_percentage // 0) | floor),
    (.rate_limits.seven_day.resets_at // ""),
    "_end"
  ] | map(tostring) | join("")')
IFS=$'\x1f' read -r -a F <<< "$SL_RAW"

CWD="${F[0]}"; PROJECT="${F[1]}"; MODEL_ID="${F[2]}"; MODEL_NAME="${F[3]}"
PCT="${F[4]}"; MAX_TOK="${F[5]}"; ADDED="${F[6]}"; REMOVED="${F[7]}"
COST="${F[8]}"; DURATION_MS="${F[9]}"; PERM="${F[10]}"; TRANSCRIPT="${F[11]}"
EFFORT="${F[12]}"; THINKING="${F[13]}"
CU_NULL="${F[14]}"; CU_READ="${F[15]}"; CU_WRITE="${F[16]}"; CU_INPUT="${F[17]}"; CU_OUT="${F[18]}"
RL_PRESENT="${F[19]}"
FH_PCT="${F[20]}"; FH_RESET="${F[21]}"; SD_PCT="${F[22]}"; SD_RESET="${F[23]}"
[ -z "$PCT" ] && PCT=0

# ─────────────────────────────────────────────
# MODEL — tier + version from model.id
# ─────────────────────────────────────────────
MODEL_ID_LOWER=$(echo "$MODEL_ID" | tr '[:upper:]' '[:lower:]')
if   echo "$MODEL_ID_LOWER" | grep -q "haiku"; then TIER="Haiku";  MODEL_COLOUR="$BLUE"
elif echo "$MODEL_ID_LOWER" | grep -q "opus";  then TIER="Opus";   MODEL_COLOUR="$GOLD"
else                                                 TIER="Sonnet"; MODEL_COLOUR="$CYAN"
fi
MODEL_VER=$(echo "$MODEL_ID_LOWER" \
  | grep -oE '(opus|sonnet|haiku)-[0-9]+-[0-9]+' | head -1 \
  | sed -E 's/^(opus|sonnet|haiku)-//' | tr '-' '.')
[ -n "$MODEL_VER" ] \
  && MODEL_DISPLAY="${MODEL_COLOUR}${TIER} ${MODEL_VER}${R}" \
  || MODEL_DISPLAY="${MODEL_COLOUR}${MODEL_NAME}${R}"

# 1M context badge
[ "$MAX_TOK" -ge 900000 ] && ONEM="${DIM}1M${R}" || ONEM=""

# ─────────────────────────────────────────────
# EFFORT + THINKING ("thinking" = dim shade of effort colour)
# ─────────────────────────────────────────────
case "$EFFORT" in
  low)    EFFORT_C="$WHITE"; EFFORT_WORD="${DIM}low${R}" ;;
  medium) EFFORT_C="$WHITE"; EFFORT_WORD="${DIM}${WHITE}med${R}" ;;
  high)   EFFORT_C="$WHITE"; EFFORT_WORD="${WHITE}high${R}" ;;
  xhigh)  EFFORT_C="$AMBER"; EFFORT_WORD="${AMBER}xhigh${R}" ;;
  max)    EFFORT_C="$RED";   EFFORT_WORD="${BOLD}${RED}MAX${R}" ;;
  *)      EFFORT_C="";       EFFORT_WORD="" ;;
esac
[ "$THINKING" = "true" ] && THINKING_WORD="${DIM}${EFFORT_C}thinking${R}" || THINKING_WORD=""

# ─────────────────────────────────────────────
# PERMISSION GLYPH
# ─────────────────────────────────────────────
case "$PERM" in
  accept*)  PERM_GLYPH="${ESC}[38;2;255;176;48m⚡${R}"  ;;  # auto (acceptEdits)     → yellow/orange
  bypass*)  PERM_GLYPH="${ESC}[38;2;255;82;129m!!${R}"  ;;  # skip (bypassPermissions) → reddish pink
  *)        PERM_GLYPH="${ESC}[38;2;160;150;255m?${R}"  ;;  # ask (default/plan)     → light purple/blue
esac

# ─────────────────────────────────────────────
# DIRECTORY  (full path, dim — matches the › file segment)
# ─────────────────────────────────────────────
DIR_SEG="${DIM}${CWD}${R}"

# ─────────────────────────────────────────────
# GIT
# ─────────────────────────────────────────────
BRANCH=$(git -C "$CWD" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
DIRTY=$(git -C "$CWD" --no-optional-locks status --porcelain 2>/dev/null | wc -l | tr -d ' ')
STAGED=$(git -C "$CWD" --no-optional-locks diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
GIT_ID=$(git -C "$CWD" config user.email 2>/dev/null)   # commit identity (falls back to global)

# Claude account name (from ~/.claude.json; displayName, else login email)
CLAUDE_USER=$(jq -r '.oauthAccount.displayName // .oauthAccount.emailAddress // empty' "$HOME/.claude.json" 2>/dev/null)

# ─────────────────────────────────────────────
# LAST FILE TOUCHED (from transcript)
# ─────────────────────────────────────────────
LAST_FILE=""
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  LAST_FILE=$(tail -80 "$TRANSCRIPT" 2>/dev/null \
    | jq -r 'select(.type=="assistant")
              | .message.content[]?
              | select(.type=="tool_use")
              | select(.name | test("write|edit|read|str_replace|create"))
              | .input.path // .input.file_path // empty' 2>/dev/null \
    | tail -1 | sed 's|.*/||')
fi
[ -n "$LAST_FILE" ] && FILE_SEG=" ${DIM}› ${LAST_FILE}${R}" || FILE_SEG=""

# ─────────────────────────────────────────────
# AUTOCOMPACT THRESHOLD (from settings)
# ─────────────────────────────────────────────
SETTINGS="$HOME/.claude/settings.json"
COMPACT_PCT=$(jq -r '.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE // empty' "$SETTINGS" 2>/dev/null)
COMPACT_OFF=$(jq -r 'if .autoCompact == false then "true" else "false" end' "$SETTINGS" 2>/dev/null)
if [ "$COMPACT_OFF" = "true" ]; then
  COMPACT_LABEL="${DIM} no-cmp${R}"; COMPACT_PCT_VAL=100
elif [ -n "$COMPACT_PCT" ]; then
  COMPACT_LABEL="${DIM} |${COMPACT_PCT}%${R}"; COMPACT_PCT_VAL="$COMPACT_PCT"
else
  COMPACT_LABEL="${DIM} |95%${R}"; COMPACT_PCT_VAL=95
fi

# ─────────────────────────────────────────────
# CONTEXT BAR — gradient fill + on-bar autocompact marker + shimmer.
# Bar LENGTH is real usage; only the fill's texture animates (phase 0).
# ─────────────────────────────────────────────
BAR_WIDTH=28
FILLED=$(( PCT * BAR_WIDTH / 100 ))
if [ "$COMPACT_OFF" = "true" ]; then MARKER_POS=-1; else MARKER_POS=$(( COMPACT_PCT_VAL * BAR_WIDTH / 100 )); fi
BAR=$(draw_bar "$BAR_WIDTH" "$FILLED" "$MARKER_POS" 0)

# Percentage colour mirrors bar position
if   [ "$PCT" -ge 70 ]; then PCT_COLOUR="$RED"
elif [ "$PCT" -ge 40 ]; then PCT_COLOUR="$AMBER"
else                         PCT_COLOUR="$GREEN"
fi
PCT_SEG="${PCT_COLOUR}${PCT}%${R}"

# ─────────────────────────────────────────────
# PER-TURN TOKEN BREAKDOWN (context_window.current_usage) — values from F[] above
# ─────────────────────────────────────────────
TURN_SEG=""
if [ "$CU_NULL" != "true" ]; then
  CU_TOTAL=$(( CU_INPUT + CU_WRITE + CU_READ ))
  if [ "$CU_TOTAL" -gt 0 ] && [ "$CU_READ" -gt 0 ]; then
    HIT_PCT=$(( CU_READ * 100 / CU_TOTAL ))
    if   [ "$HIT_PCT" -ge 70 ]; then HIT_C="${BOLD}${GREEN}"
    elif [ "$HIT_PCT" -ge 40 ]; then HIT_C="${GREEN}"
    else                              HIT_C="${DIM}${GREEN}"
    fi
    HIT_SEG="${HIT_C}✦${HIT_PCT}%${R}"
  else
    HIT_SEG=""
  fi
  [ "$CU_READ" -gt 0 ]  && READ_SEG=" ${GREEN}✦$(fmt_k $CU_READ)${R}"    || READ_SEG=""
  [ "$CU_WRITE" -gt 0 ] && WRITE_SEG=" ${AMBER}+$(fmt_k $CU_WRITE)w${R}" || WRITE_SEG=""
  [ "$CU_INPUT" -gt 0 ] && INPUT_SEG=" ${DIM}↓$(fmt_k $CU_INPUT)${R}"    || INPUT_SEG=""
  [ "$CU_OUT" -gt 0 ]   && OUT_SEG=" ${DIM}↑$(fmt_k $CU_OUT)${R}"        || OUT_SEG=""
  TURN_SEG="${HIT_SEG}${READ_SEG}${WRITE_SEG}${INPUT_SEG}${OUT_SEG}"
fi

# ─────────────────────────────────────────────
# COST — colour by threshold
# ─────────────────────────────────────────────
COST_FMT=$(printf "%.3f" "$COST")
COST_TIER=$(awk -v c="$COST_FMT" 'BEGIN { if (c >= 0.50) print "red"; else if (c >= 0.10) print "amber"; else print "green" }')
case "$COST_TIER" in
  red)   COST_COLOUR="$RED"   ;;
  amber) COST_COLOUR="$AMBER" ;;
  *)     COST_COLOUR="$GREEN" ;;
esac
if [ "$COST_FMT" = "0.000" ]; then
  COST_SEG="${DIM}\$0${R}"
  BAR_PREFIX="${DIM}∅ ${R}"
else
  COST_SEG="${COST_COLOUR}\$${COST_FMT}${R}"
  BAR_PREFIX=""
fi

# ─────────────────────────────────────────────
# SESSION AGE — "1h 32m" / "45m" / "12s", colour by threshold
# ─────────────────────────────────────────────
DURATION_S=$(( DURATION_MS / 1000 ))
if   [ "$DURATION_S" -ge 7200 ]; then AGE_C="$RED";   AGE_LABEL=$(printf "%dh %dm" $(( DURATION_S/3600 )) $(( (DURATION_S%3600)/60 )))
elif [ "$DURATION_S" -ge 3600 ]; then AGE_C="$AMBER"; AGE_LABEL=$(printf "%dh %dm" $(( DURATION_S/3600 )) $(( (DURATION_S%3600)/60 )))
elif [ "$DURATION_S" -ge 60 ];   then AGE_C="$GREEN"; AGE_LABEL=$(printf "%dm"     $(( DURATION_S/60 )))
else                                   AGE_C="$DIM";   AGE_LABEL="${DURATION_S}s"
fi
AGE_SEG="${AGE_C}${AGE_LABEL}${R}"

# ─────────────────────────────────────────────
# CLOCK (with seconds — repaints every second via refreshInterval:1)
# ─────────────────────────────────────────────
CLOCK_SEG="${DIM}$(date "+%a %d %b  %H:%M:%S")${R}"

# ─────────────────────────────────────────────
# USAGE LIMITS — two mini bars for line 2 right (values from F[]; empty if no rate_limits)
# ─────────────────────────────────────────────
USAGE_SEG=""
if [ "$RL_PRESENT" = "true" ]; then
  NOW=$BASE_FRAME
  rl_seg() {
    local label="$1" pct="$2" resets_at="$3" phase="$4" bar pc secs_left cd filled
    [ -z "$pct" ] && pct=0
    [ "$pct" -gt 100 ] && pct=100
    filled=$(( pct * 10 / 100 ))
    bar=$(draw_bar 10 "$filled" -1 "$phase")
    if   [ "$pct" -ge 80 ]; then pc="$RED"
    elif [ "$pct" -ge 50 ]; then pc="$AMBER"
    else                         pc="$GREEN"
    fi
    secs_left=0
    if [ -n "$resets_at" ] && [ "$resets_at" != "null" ] && { [ "$resets_at" -gt 0 ] 2>/dev/null; }; then
      secs_left=$(( resets_at - NOW ))
    fi
    [ "$secs_left" -le 0 ] && cd="${DIM}now${R}" || cd="${DIM}$(fmt_countdown $secs_left)${R}"
    printf '%s' "${DIM}${label}${R} ${bar} ${pc}${pct}%${R} ${cd}"
  }
  # phases offset in ms so the three bars don't sweep in lockstep
  USAGE_SEG="$(rl_seg "5h" "$FH_PCT" "$FH_RESET" 1500)   $(rl_seg "7d" "$SD_PCT" "$SD_RESET" 3000)"
fi

# ─────────────────────────────────────────────
# ASSEMBLE
# ─────────────────────────────────────────────
CTX_SIZE_K=$(fmt_k "$MAX_TOK")

# Bracket interior: model + 1M + effort + thinking
BRACKET="${MODEL_DISPLAY}"
[ -n "$ONEM" ]          && BRACKET="${BRACKET} ${ONEM}"
[ -n "$EFFORT_WORD" ]   && BRACKET="${BRACKET} ${EFFORT_WORD}"
[ -n "$THINKING_WORD" ] && BRACKET="${BRACKET} ${THINKING_WORD}"

# Line 1 — model identity | clock
L1_LEFT="${PERM_GLYPH} ${DIM}[${R}${BRACKET}${DIM}]${R}"
L1_RIGHT="${CLOCK_SEG}"

# Line 2 — context bar + stats | usage bars
CTX_STATS="${DIM}${CTX_SIZE_K}${R}"
[ -n "$TURN_SEG" ] && CTX_STATS="${CTX_STATS} ${TURN_SEG}"
L2_LEFT="${BAR_PREFIX}${BAR}  ${PCT_SEG}${COMPACT_LABEL}  ${CTX_STATS}"
L2_RIGHT="${USAGE_SEG}"

# Line 3 — work context: dir › file, branch, git id, deltas | account, cost, age
L3_LEFT="${DIR_SEG}${FILE_SEG}"
[ -n "$BRANCH" ]                            && L3_LEFT="${L3_LEFT}  ${CYAN}⎇ ${BRANCH}${R}"
[ -n "$GIT_ID" ]                            && L3_LEFT="${L3_LEFT}  ${DIM}${GIT_ID}${R}"
[ "$ADDED" -gt 0 ] || [ "$REMOVED" -gt 0 ]  && L3_LEFT="${L3_LEFT}  ${GREEN}+${ADDED}${R}/${RED}-${REMOVED}${R}"
[ "$DIRTY" -gt 0 ]                          && L3_LEFT="${L3_LEFT}  ${AMBER}~${DIRTY}${R}"
[ "$STAGED" -gt 0 ]                         && L3_LEFT="${L3_LEFT} ${GREEN}●${STAGED}${R}"
L3_RIGHT=""
[ -n "$CLAUDE_USER" ] && L3_RIGHT="$(rainbow "$CLAUDE_USER")  "
L3_RIGHT="${L3_RIGHT}${COST_SEG}  ${AGE_SEG}"

# ─────────────────────────────────────────────
# OUTPUT
# ─────────────────────────────────────────────
justified "$L1_LEFT" "$L1_RIGHT"
justified "$L2_LEFT" "$L2_RIGHT"
justified "$L3_LEFT" "$L3_RIGHT"
