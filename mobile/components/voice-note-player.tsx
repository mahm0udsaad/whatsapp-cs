// Inline player for voice notes / audio attachments in the chat thread.
// Only one note plays at a time — starting another pauses the previous one.
//
// Built on expo-video's player (audio-only sources play fine without a
// VideoView) because it already ships in the installed binaries, so this can
// go out over OTA. On iOS it uses the .playback audio session, which plays
// through the speaker even with the ringer switch on silent.

import { useEffect, useState } from "react";
import { I18nManager, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, type VideoPlayer } from "expo-video";
import { ActivityIndicator, Pressable, Text, View } from "./tw";
import { managerColors } from "./manager-ui";
import { formatClock } from "../lib/format-clock";

const RATES = [1, 1.5, 2] as const;

let activePlayer: VideoPlayer | null = null;

export function VoiceNotePlayer({
  url,
  tone,
}: {
  url: string;
  tone: "customer" | "agent";
}) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.2;
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [rateIndex, setRateIndex] = useState(0);

  useEventListener(player, "timeUpdate", (e) => setCurrentTime(e.currentTime));
  useEventListener(player, "sourceLoad", (e) => setDuration(e.duration));
  useEventListener(player, "playToEnd", () => {
    player.pause();
    player.currentTime = 0;
    setCurrentTime(0);
  });

  useEffect(() => {
    return () => {
      if (activePlayer === player) activePlayer = null;
    };
  }, [player]);

  const isLoaded = status === "readyToPlay" || duration > 0;
  const current = Math.min(currentTime, duration || Infinity);
  const progress = duration > 0 ? current / duration : 0;
  const isCustomer = tone === "customer";
  const accent = isCustomer ? managerColors.brand : "#FFFFFF";
  const trackBg = isCustomer ? "#D6DDF8" : "rgba(255,255,255,0.28)";

  const togglePlay = () => {
    if (isPlaying) {
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
    if (duration > 0 && current >= duration - 0.1) {
      player.currentTime = 0;
    }
    player.play();
  };

  const onSeek = (x: number) => {
    if (!trackWidth || !duration) return;
    const ratio = Math.min(1, Math.max(0, x / trackWidth));
    const target = (I18nManager.isRTL ? 1 - ratio : ratio) * duration;
    player.currentTime = target;
    setCurrentTime(target);
  };

  const cycleRate = () => {
    const next = (rateIndex + 1) % RATES.length;
    setRateIndex(next);
    player.playbackRate = RATES[next];
  };

  return (
    <View
      className="flex-row items-center gap-2.5 py-1"
      style={{ minWidth: 220, maxWidth: 280 }}
    >
      <Pressable
        onPress={togglePlay}
        disabled={status === "error"}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "إيقاف مؤقت" : "تشغيل الرسالة الصوتية"}
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: isCustomer ? managerColors.brand : "#FFFFFF",
        }}
      >
        {status === "error" ? (
          <Ionicons
            name="alert-circle-outline"
            size={20}
            color={isCustomer ? "#FFFFFF" : managerColors.danger}
          />
        ) : !isLoaded ? (
          <ActivityIndicator
            size="small"
            color={isCustomer ? "#FFFFFF" : managerColors.brand}
          />
        ) : (
          <Ionicons
            name={isPlaying ? "pause" : "play"}
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
            {isPlaying || current > 0
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
