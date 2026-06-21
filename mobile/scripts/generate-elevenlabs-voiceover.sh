#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then
  echo "Missing ELEVENLABS_API_KEY" >&2
  exit 1
fi

if [[ -z "${ELEVENLABS_VOICE_ID:-}" ]]; then
  echo "Missing ELEVENLABS_VOICE_ID" >&2
  exit 1
fi

TEXT_FILE="${1:-video/nehgz-hub/voiceover.ar.txt}"
OUT_FILE="${2:-output/voiceover/nehgz-hub-ar.mp3}"
MODEL_ID="${ELEVENLABS_MODEL_ID:-eleven_v3}"

mkdir -p "$(dirname "$OUT_FILE")"

node -e '
const fs = require("fs");
const [textFile, outFile, apiKey, voiceId, modelId] = process.argv.slice(1);
const text = fs.readFileSync(textFile, "utf8").trim();

async function main() {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs request failed: ${response.status} ${body}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outFile, buffer);
  console.log(outFile);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
' "$TEXT_FILE" "$OUT_FILE" "$ELEVENLABS_API_KEY" "$ELEVENLABS_VOICE_ID" "$MODEL_ID"
