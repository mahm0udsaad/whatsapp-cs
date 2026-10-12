// Voice-note recording for the chat composer: a hook that owns the recorder
// and a bar that replaces the composer row while recording.
//
// Recording is AAC in an .m4a (audio/mp4) container on both platforms — a
// format WhatsApp accepts for outbound media.
//
// expo-audio is a native module that older installed binaries don't have, and
// this file ships over OTA. So it never imports expo-audio statically: when the
// native module is missing, useVoiceRecorder is a no-op and the composer hides
// the mic button.

import { requireOptionalNativeModule } from "expo";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "./tw";
import { managerColors, softShadow } from "./manager-ui";
import { formatClock } from "../lib/format-clock";

export type RecordedVoiceNote = {
  uri: string;
  name: string;
  type: string;
  durationMs: number;
};

export type VoiceRecorder = {
  supported: boolean;
  active: boolean;
  durationMs: number;
  start: () => Promise<boolean>;
  cancel: () => Promise<void>;
  /** Stop and return the recorded file, or null if it was too short. */
  finish: () => Promise<RecordedVoiceNote | null>;
};

export const voiceRecordingSupported =
  requireOptionalNativeModule("ExpoAudio") != null;

const UNSUPPORTED: VoiceRecorder = {
  supported: false,
  active: false,
  durationMs: 0,
  start: async () => false,
  cancel: async () => undefined,
  finish: async () => null,
};

function useUnsupportedVoiceRecorder(): VoiceRecorder {
  return UNSUPPORTED;
}

// Chosen once at load; the binary can't change at runtime, so hook order is
// stable.
export const useVoiceRecorder: () => VoiceRecorder = voiceRecordingSupported
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("./voice-recorder-native") as typeof import("./voice-recorder-native"))
      .useVoiceRecorder
  : useUnsupportedVoiceRecorder;

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
