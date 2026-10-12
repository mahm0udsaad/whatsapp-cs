// expo-audio recorder hook. Only loaded (via voice-recorder.tsx) when the
// installed binary includes the ExpoAudio native module — importing it on an
// older binary throws at module load.

import { useCallback, useState } from "react";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import type { RecordedVoiceNote, VoiceRecorder } from "./voice-recorder";

const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
};

/** Shorter taps are treated as accidental and discarded. */
const MIN_DURATION_MS = 800;

export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 250);
  const [active, setActive] = useState(false);

  const start = useCallback(async (): Promise<boolean> => {
    // Respect the user's decision — if they denied microphone access, do
    // nothing (App Store guideline 5.1.1(iv)).
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return false;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setActive(true);
    return true;
  }, [recorder]);

  const stopRecorder = useCallback(async () => {
    try {
      await recorder.stop();
    } finally {
      setActive(false);
      // Route playback back to the speaker.
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    }
  }, [recorder]);

  const cancel = useCallback(async () => {
    await stopRecorder();
  }, [stopRecorder]);

  /** Stop and return the recorded file, or null if it was too short. */
  const finish = useCallback(async (): Promise<RecordedVoiceNote | null> => {
    const durationMs = recorder.getStatus().durationMillis;
    await stopRecorder();
    const uri = recorder.uri;
    if (!uri || durationMs < MIN_DURATION_MS) return null;
    return {
      uri,
      name: `voice-${Date.now()}.m4a`,
      type: "audio/mp4",
      durationMs,
    };
  }, [recorder, stopRecorder]);

  return {
    supported: true,
    active,
    durationMs: state.durationMillis,
    start,
    cancel,
    finish,
  };
}
