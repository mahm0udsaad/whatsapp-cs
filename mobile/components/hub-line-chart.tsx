import { useState } from "react";
import { LayoutChangeEvent, Text, View } from "react-native";
import { managerColors } from "./manager-ui";

export interface LinePoint {
  key: string;
  label: string;
  value: number;
}

/**
 * Hand-rolled line chart — no SVG / charting dependency. Connects points with
 * thin rotated View segments (each centered on the midpoint of its pair, so
 * the default center-origin rotation lands the ends exactly on the points).
 * Used for the cumulative bookings trend.
 */
export function HubLineChart({
  data,
  height = 170,
  color = managerColors.brand,
}: {
  data: LinePoint[];
  height?: number;
  color?: string;
}) {
  const [width, setWidth] = useState(0);

  if (data.length === 0) {
    return (
      <View style={{ height, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: managerColors.muted, fontSize: 13 }}>
          لا توجد بيانات في هذه الفترة
        </Text>
      </View>
    );
  }

  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  const pad = 10;
  const labelSpace = 22;
  const plotH = height - labelSpace - 16; // top room for the peak label
  const max = Math.max(1, ...data.map((d) => d.value));
  const plotW = Math.max(0, width - pad * 2);

  const points = data.map((d, i) => ({
    ...d,
    x:
      pad +
      (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
    y: 16 + plotH - (d.value / max) * plotH,
  }));

  // Show ~5 evenly spaced x-axis labels so they never overlap.
  const labelStep = Math.max(1, Math.ceil(data.length / 5));

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <>
          {/* connecting segments */}
          {points.slice(1).map((p, i) => {
            const prev = points[i];
            const dx = p.x - prev.x;
            const dy = p.y - prev.y;
            const len = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);
            return (
              <View
                key={`seg-${p.key}`}
                style={{
                  position: "absolute",
                  left: (prev.x + p.x) / 2 - len / 2,
                  top: (prev.y + p.y) / 2 - 1,
                  width: len,
                  height: 2.5,
                  borderRadius: 2,
                  backgroundColor: color,
                  transform: [{ rotate: `${angle}rad` }],
                }}
              />
            );
          })}
          {/* dots + peak label */}
          {points.map((p) => {
            const isPeak = p.value === max && max > 0;
            return (
              <View key={`dot-${p.key}`}>
                {isPeak ? (
                  <Text
                    style={{
                      position: "absolute",
                      left: p.x - 20,
                      top: p.y - 18,
                      width: 40,
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: "700",
                      color: managerColors.ink,
                    }}
                  >
                    {p.value}
                  </Text>
                ) : null}
                <View
                  style={{
                    position: "absolute",
                    left: p.x - (isPeak ? 4 : 3),
                    top: p.y - (isPeak ? 4 : 3),
                    width: isPeak ? 8 : 6,
                    height: isPeak ? 8 : 6,
                    borderRadius: 4,
                    backgroundColor: isPeak ? color : "#FFFFFF",
                    borderWidth: 1.5,
                    borderColor: color,
                  }}
                />
              </View>
            );
          })}
          {/* x-axis labels */}
          {points.map((p, i) =>
            i % labelStep === 0 || i === points.length - 1 ? (
              <Text
                key={`lbl-${p.key}`}
                numberOfLines={1}
                style={{
                  position: "absolute",
                  left: p.x - 22,
                  top: height - labelSpace + 2,
                  width: 44,
                  textAlign: "center",
                  fontSize: 9,
                  color: managerColors.muted,
                }}
              >
                {p.label}
              </Text>
            ) : null
          )}
        </>
      ) : null}
    </View>
  );
}
