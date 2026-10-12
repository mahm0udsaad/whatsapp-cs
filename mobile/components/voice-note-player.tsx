// Inline player for voice notes / audio attachments in the chat thread.
// Only one note plays at a time — starting another pauses the previous one.

import { useEffect, useState } from "react";
import { I18nManager, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from "expo-audio";
import { ActivityIndicator, Pressable, Text, View } from "./tw";
import { managerColors } from "./manager-ui";

const RATES = [1, 1.5, 2] as const;

let activePlayer: AudioPlayer | null = null;

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function VoiceNotePlayer({
  url,
  tone,
}: {
  url: string;
  tone: "customer" | "agent";
}) {
  const player = useAudioPlayer({ uri: url }, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(0);
  const [rateIndex, setRateIndex] = useState(0);

  useEffect(() => {
    return () => {
      if (activePlayer === player) activePlayer = null;
    };
  }, [player]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      void player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const duration = status.duration || 0;
  const current = Math.min(status.currentTime || 0, duration || Infinity);
  const progress = duration > 0 ? current / duration : 0;
  const isCustomer = tone === "customer";
  const accent = isCustomer ? managerColors.brand : "#FFFFFF";
  const trackBg = isCustomer ? "#D6DDF8" : "rgba(255,255,255,0.28)";

  const togglePlay = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (activePlayer && activePlayer !== player) {
      try {
        activePlayer.pause();
      } catch {
        // Previous player was already released.
      }
    }
    activePlayer = player;
    // Play through the speaker even when the ringer switch is on silent, and
    // drop any record-mode routing left over from a recording.
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    }).catch(() => undefined);
    if (duration > 0 && current >= duration - 0.1) {
      await player.seekTo(0);
    }
    player.play();
  };

  const onSeek = (x: number) => {
    if (!trackWidth || !duration) return;
    const ratio = Math.min(1, Math.max(0, x / trackWidth));
    void player.seekTo((I18nManager.isRTL ? 1 - ratio : ratio) * duration);
  };

  const cycleRate = () => {
    const next = (rateIndex + 1) % RATES.length;
    setRateIndex(next);
    player.setPlaybackRate(RATES[next]);
  };

  return (
    <View
      className="flex-row items-center gap-2.5 py-1"
      style={{ minWidth: 220, maxWidth: 280 }}
    >
      <Pressable
        onPress={togglePlay}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "إيقاف مؤقت" : "تشغيل الرسالة الصوتية"}
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: isCustomer ? managerColors.brand : "#FFFFFF",
        }}
      >
        {!status.isLoaded ? (
          <ActivityIndicator
            size="small"
            color={isCustomer ? "#FFFFFF" : managerColors.brand}
          />
        ) : (
          <Ionicons
            name={status.playing ? "pause" : "play"}
            size={18}
            color={isCustomer ? "#FFFFFF" : managerColors.brand}
          />
        )}
      </Pressable>

      <View className="flex-1">
        <Pressable
          onLayout={(e: LayoutChangeEvent) =>
            setTrackWidth(e.nativeEvent.layout.width)
          }
          onPress={(e) => onSeek(e.nativeEvent.locationX)}
          hitSlop={{ top: 10, bottom: 10 }}
          className="h-4 justify-center"
        >
          <View
            className="h-1 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: trackBg }}
          >
            <View
              className="h-1 rounded-full"
              style={{
                position: "absolute",
                start: 0,
                width: `${progress * 100}%`,
                backgroundColor: accent,
              }}
            />
          </View>
        </Pressable>
        <View className="mt-0.5 flex-row items-center justify-between">
          <Text
            className={`text-[11px] ${
              isCustomer ? "text-[#5E6A99]" : "text-white/80"
            }`}
          >
            {status.playing || current > 0
              ? formatClock(current)
              : formatClock(duration)}
          </Text>
          <Pressable onPress={cycleRate} hitSlop={6}>
            <Text
              className={`rounded-full px-1.5 text-[10px] font-bold ${
                isCustomer
                  ? "bg-[#E8EEFF] text-[#273B9A]"
                  : "bg-white/20 text-white"
              }`}
            >
              {`${RATES[rateIndex]}x`}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Placeholder shown while the playable URL is being resolved.
export function VoiceNoteLoading({ tone }: { tone: "customer" | "agent" }) {
  const isCustomer = tone === "customer";
  return (
    <View
      className="flex-row items-center gap-2.5 py-1"
      style={{ minWidth: 220, maxWidth: 280 }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: isCustomer ? managerColors.brand : "#FFFFFF",
        }}
      >
        <ActivityIndicator
          size="small"
          color={isCustomer ? "#FFFFFF" : managerColors.brand}
        />
      </View>
      <View
        className="h-1 flex-1 rounded-full"
        style={{
          backgroundColor: isCustomer ? "#D6DDF8" : "rgba(255,255,255,0.28)",
        }}
      />
    </View>
  );
}
