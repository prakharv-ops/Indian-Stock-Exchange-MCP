#!/usr/bin/env bash
# Renders docs/demo.html to docs/demo.gif using headless Chrome (stepped virtual time) and ffmpeg.
# Usage: scripts/render-demo.sh [frames_dir]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRAMES="${1:-$ROOT/docs/.frames}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$ROOT/docs/demo.html"
COUNT=44
STEP_MS=400

mkdir -p "$FRAMES"

shot() {
  local i="$1"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1060,860 \
    --virtual-time-budget=$((i * STEP_MS + 300)) \
    --screenshot="$FRAMES/f$(printf %03d "$i").png" "$URL" >/dev/null 2>&1
}

for i in $(seq 0 $((COUNT - 1))); do
  shot "$i" &
  if (( (i + 1) % 4 == 0 )); then wait; fi
done
wait

# Hold the final frame for ~3s, then build a palette-optimised GIF.
ffmpeg -y -loglevel error -framerate 2.5 -i "$FRAMES/f%03d.png" \
  -vf "tpad=stop_mode=clone:stop_duration=3,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  "$ROOT/docs/demo.gif"

echo "wrote $ROOT/docs/demo.gif"
