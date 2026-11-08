import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { cn } from "../../lib/utils";
import { NumberText } from "./text";
import { useTheme } from "./theme";

/**
 * shadcn InputOTP equivalent: one hidden input, visible slots.
 * Accepts letters/digits; strips spaces and dashes (also when pasted).
 * Slots always read left-to-right because codes are Latin.
 */
export function InputOTP({ value, onChange, length = 8, groupSize = 4, invalid = false, onComplete, testID, accessibilityLabel, autoFocus = false }: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  groupSize?: number;
  invalid?: boolean;
  onComplete?: (value: string) => void;
  testID?: string;
  accessibilityLabel: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus);
  const { color } = useTheme();
  const chars = value.split("");
  const update = (text: string) => {
    const next = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, length);
    onChange(next);
    if (next.length === length && next !== value) onComplete?.(next);
  };
  return (
    <Pressable onPress={() => ref.current?.focus()} accessible={false}>
      <View className="flex-row items-center justify-center gap-1.5" style={{ direction: "ltr" }}>
        {Array.from({ length }, (_, i) => {
          const active = focused && (i === chars.length || (i === length - 1 && chars.length === length));
          return (
            <View key={i} className="flex-row items-center gap-1.5">
              {i > 0 && i % groupSize === 0 ? <View className="h-0.5 w-3 rounded-full bg-border" /> : null}
              <View
                className={cn(
                  "h-14 w-[36px] items-center justify-center rounded-xl border bg-card",
                  invalid ? "border-destructive" : active ? "border-primary" : chars[i] ? "border-input" : "border-border",
                )}
                style={active ? { borderWidth: 2 } : undefined}
              >
                <NumberText align="center" className="text-[22px] font-bold">{chars[i] ?? ""}</NumberText>
              </View>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={update}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={length + 6}
        caretHidden
        selectionColor={color("primary")}
        style={{ position: "absolute", inset: 0, opacity: 0.02, color: "transparent" }}
      />
    </Pressable>
  );
}
