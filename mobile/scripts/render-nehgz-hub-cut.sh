#!/usr/bin/env bash

set -euo pipefail

VIDEO_IN="${1:-output/playwright/nehgz-test.webm}"
AUDIO_IN="${2:-output/voiceover/nehgz-hub-ar.mp3}"
VIDEO_OUT="${3:-output/final/nehgz-hub-dashboard.mp4}"

mkdir -p "$(dirname "$VIDEO_OUT")"

ffmpeg -y \
  -stream_loop -1 -i "$VIDEO_IN" \
  -i "$AUDIO_IN" \
  -filter_complex "[0:v]scale=1280:960:force_original_aspect_ratio=decrease,pad=1280:960:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=40,format=yuv420p[v];[1:a]atrim=duration=40,afade=t=out:st=37:d=3[a]" \
  -map "[v]" \
  -map "[a]" \
  -c:v libx264 \
  -preset medium \
  -crf 20 \
  -c:a aac \
  -b:a 192k \
  -shortest \
  "$VIDEO_OUT"
