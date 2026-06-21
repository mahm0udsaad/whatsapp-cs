# Nehgz Hub Dashboard Video

This folder contains the first-pass production assets for a dashboard promo:

- `voiceover.ar.txt`: Arabic voice-over copy
- `selected-period.json`: the reporting period chosen for the stronger promo cut
- `scripts/generate-elevenlabs-voiceover.sh`: Generate narration with ElevenLabs
- `scripts/render-nehgz-hub-cut.sh`: Combine captured browser footage and narration into an `mp4`

## Current workflow

1. Capture dashboard footage with Playwright browser recording into `output/playwright/`.
2. Generate narration:

```bash
ELEVENLABS_API_KEY=... \
ELEVENLABS_VOICE_ID=... \
bash scripts/generate-elevenlabs-voiceover.sh
```

3. Render an initial cut:

```bash
bash scripts/render-nehgz-hub-cut.sh
```

## Notes

- The current browser recorder produced `800x600` footage, so the render script pads it to `1280x960`.
- A stronger reporting period was identified as `2026-02-01` to `2026-02-28`, which materially outperformed the more recent months tested.
- A more polished final version should use a higher-resolution capture pass or a Remotion composition with overlays, zooms, branded titles, and a tighter scripted recording around the selected reporting period.
