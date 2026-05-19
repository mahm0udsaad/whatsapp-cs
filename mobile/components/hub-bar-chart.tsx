import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { managerColors } from "./manager-ui";

export interface BarDatum {
  key: string;
  /** Short axis label, e.g. "١٢/٥" or "أحد". */
  label: string;
  value: number;
  /** Optional richer label shown when the bar is tapped. */
  detail?: string;
}

/**
 * Lightweight hand-rolled bar chart — no charting dependency. Bars scroll
 * horizontally when they don't fit. Tapping a bar surfaces its exact value.
 */
export function HubBarChart({
  data,
  height = 150,
  barWidth = 34,
  valueSuffix = "",
}: {
  data: BarDatum[];
  height?: number;
  barWidth?: number;
  valueSuffix?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const plotHeight = height - 40; // leave room for value + axis labels

  if (data.length === 0) {
    return (
      <View style={{ height, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: managerColors.muted, fontSize: 13 }}>
          لا توجد بيانات في هذه الفترة
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: "flex-end", paddingTop: 4 }}
    >
      {data.map((d) => {
        const isActive = active === d.key;
        const barH = Math.max(3, (d.value / max) * plotHeight);
        return (
          <Pressable
            key={d.key}
            onPress={() => setActive(isActive ? null : d.key)}
            style={{ width: barWidth, alignItems: "center" }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: d.value > 0 ? managerColors.ink : "transparent",
                marginBottom: 2,
              }}
            >
              {d.value}
              {d.value > 0 ? valueSuffix : ""}
            </Text>
            <View
              style={{
                width: barWidth * 0.6,
                height: barH,
                borderRadius: 6,
                backgroundColor:
                  d.value === max && max > 0
                    ? managerColors.brand
                    : managerColors.brandSoft,
                borderWidth: d.value === max ? 0 : 1,
                borderColor: managerColors.border,
              }}
            />
            <Text
              numberOfLines={1}
              style={{
                fontSize: 9,
                color: isActive ? managerColors.brand : managerColors.muted,
                fontWeight: isActive ? "700" : "500",
                marginTop: 6,
                width: barWidth,
                textAlign: "center",
              }}
            >
              {d.label}
            </Text>
            {isActive && d.detail ? (
              <Text
                style={{
                  fontSize: 9,
                  color: managerColors.brand,
                  textAlign: "center",
                  width: barWidth * 1.8,
                  marginTop: 2,
                }}
              >
                {d.detail}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
