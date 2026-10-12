// Voice-note recording for the chat composer: a hook that owns the recorder
// and a bar that replaces the composer row while recording.
//
// Recording is AAC in an .m4a (audio/mp4) container on both platforms — a
// format WhatsApp accepts for outbound media.

import { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { Pressable, Text, View } from "./tw";
import { managerColors, softShadow } from "./manager-ui";
import { formatClock } from "./voice-note-player";

export type RecordedVoiceNote = {
  uri: string;
  name: string;
  type: string;
  durationMs: number;
};

const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
};

/** Shorter taps are treated as accidental and discarded. */
const MIN_DURATION_MS = 800;

export function useVoiceRecorder() {
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
    active,
    durationMs: state.durationMillis,
    start,
    cancel,
    finish,
  };
}

export function VoiceRecordingBar({
  durationMs,
  onCancel,
  onSend,
}: {
  durationMs: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <View
      className="flex-row-reverse items-center gap-2 rounded-[24px] border px-2 py-2"
      style={{ borderColor: managerColors.border, backgroundColor: "#FFFFFF" }}
    >
      <Pressable
        onPress={onCancel}
        hitSlop={6}
        accessibilityLabel="إلغاء التسجيل"
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: "#FEF2F2" }}
      >
        <Ionicons name="trash-outline" size={19} color={managerColors.danger} />
      </Pressable>
      <View className="flex-1 flex-row-reverse items-center justify-center gap-2">
        <View
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: managerColors.danger }}
        />
        <Text className="text-sm font-semibold text-[#16245C]">
          {formatClock(durationMs / 1000)}
        </Text>
        <Text className="text-xs text-[#5E6A99]">جارٍ التسجيل...</Text>
      </View>
      <Pressable
        onPress={onSend}
        accessibilityLabel="إرسال الرسالة الصوتية"
        className="h-11 w-11 items-center justify-center rounded-full"
        style={[softShadow, { backgroundColor: managerColors.brand }]}
      >
        <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
