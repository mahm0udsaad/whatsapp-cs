import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isAfter,
  isBefore,
  isSameDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { managerColors } from "./manager-ui";

const WEEKDAYS = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

/**
 * Custom in-app date-range picker — a month-grid calendar in a bottom sheet.
 * Pure JS (no native datetime-picker dependency). First tap sets the start,
 * second tap the end; tapping before the start moves the start.
 */
export function DateRangePicker({
  visible,
  initialFrom,
  initialTo,
  onApply,
  onClose,
}: {
  visible: boolean;
  initialFrom?: Date;
  initialTo?: Date;
  onApply: (from: Date, to: Date) => void;
  onClose: () => void;
}) {
  const [viewMonth, setViewMonth] = useState<Date>(
    startOfMonth(initialFrom ?? new Date())
  );
  const [from, setFrom] = useState<Date | null>(initialFrom ?? null);
  const [to, setTo] = useState<Date | null>(initialTo ?? null);

  function pick(day: Date) {
    if (!from || (from && to)) {
      setFrom(day);
      setTo(null);
      return;
    }
    if (isBefore(day, from)) {
      setFrom(day);
      return;
    }
    setTo(day);
  }

  const monthStart = startOfMonth(viewMonth);
  const days = eachDayOfInterval({
    start: monthStart,
    end: endOfMonth(viewMonth),
  });
  const lead = getDay(monthStart); // empty cells before day 1

  function dayState(d: Date): "from" | "to" | "between" | "none" {
    if (from && isSameDay(d, from)) return "from";
    if (to && isSameDay(d, to)) return "to";
    if (from && to && isAfter(d, from) && isBefore(d, to)) return "between";
    return "none";
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(8,16,52,0.45)" }}
      />
      <View
        style={{
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          padding: 20,
          paddingBottom: 32,
        }}
      >
        {/* month nav */}
        <View
          style={{
            flexDirection: "row-reverse",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Pressable
            onPress={() => setViewMonth(subMonths(viewMonth, 1))}
            hitSlop={10}
          >
            <Ionicons name="chevron-forward" size={24} color={managerColors.ink} />
          </Pressable>
          <Text style={{ fontSize: 16, fontWeight: "700", color: managerColors.ink }}>
            {format(viewMonth, "MMMM yyyy")}
          </Text>
          <Pressable
            onPress={() => setViewMonth(addMonths(viewMonth, 1))}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={24} color={managerColors.ink} />
          </Pressable>
        </View>

        {/* weekday headers */}
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {WEEKDAYS.map((w) => (
            <Text
              key={w}
              style={{
                width: `${100 / 7}%`,
                textAlign: "center",
                fontSize: 11,
                fontWeight: "600",
                color: managerColors.muted,
                marginBottom: 6,
              }}
            >
              {w}
            </Text>
          ))}
        </View>

        {/* day grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {Array.from({ length: lead }).map((_, i) => (
            <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />
          ))}
          {days.map((d) => {
            const st = dayState(d);
            const endpoint = st === "from" || st === "to";
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => pick(d)}
                style={{
                  width: `${100 / 7}%`,
                  aspectRatio: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 2,
                }}
              >
                <View
                  style={{
                    width: "100%",
                    height: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    backgroundColor: endpoint
                      ? managerColors.brand
                      : st === "between"
                        ? managerColors.brandSoft
                        : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: endpoint ? "700" : "500",
                      color: endpoint
                        ? "#FFFFFF"
                        : st === "between"
                          ? managerColors.brand
                          : managerColors.ink,
                    }}
                  >
                    {format(d, "d")}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* footer */}
        <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 16 }}>
          <Pressable
            onPress={() => {
              if (from) onApply(from, to ?? from);
            }}
            disabled={!from}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 13,
              borderRadius: 14,
              backgroundColor: managerColors.brand,
              opacity: from ? 1 : 0.5,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>تطبيق</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 13,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: managerColors.border,
            }}
          >
            <Text style={{ color: managerColors.muted, fontWeight: "600" }}>
              إلغاء
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
