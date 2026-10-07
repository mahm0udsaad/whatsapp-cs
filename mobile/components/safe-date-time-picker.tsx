import { useEffect, useState, type ComponentType } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TurboModuleRegistry,
  View,
} from "react-native";
import * as Updates from "expo-updates";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";

/**
 * @react-native-community/datetimepicker was added in app 1.0.6. OTA updates
 * also reach the 1.0.5 store binary, which has no native picker: on Android
 * the library throws at import (TurboModuleRegistry.getEnforcing) and on iOS
 * the native view is missing. So the library is only required when the
 * native side is known to exist; otherwise a typed-in fallback is shown.
 */
const FIRST_RUNTIME_WITH_PICKER = [1, 0, 6];

function runtimeHasPicker(): boolean {
  const runtime = Updates.runtimeVersion;
  // Dev client / Expo Go have no runtime version and bundle the picker.
  if (!runtime) return true;
  const parts = runtime.split(".").map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < FIRST_RUNTIME_WITH_PICKER.length; i++) {
    const a = parts[i] ?? 0;
    const b = FIRST_RUNTIME_WITH_PICKER[i];
    if (a !== b) return a > b;
  }
  return true;
}

function nativePickerAvailable(): boolean {
  if (Platform.OS === "android") {
    return (
      TurboModuleRegistry.get("RNCDatePicker") != null &&
      TurboModuleRegistry.get("RNCTimePicker") != null
    );
  }
  if (Platform.OS === "ios") return runtimeHasPicker();
  return false;
}

let NativePicker: ComponentType<any> | null = null;
if (nativePickerAvailable()) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    NativePicker = require("@react-native-community/datetimepicker").default;
  } catch {
    NativePicker = null;
  }
}

export type SafeDateTimePickerEvent = Pick<DateTimePickerEvent, "type">;

type Props = {
  value: Date;
  mode: "date" | "time" | "datetime";
  display?: "default" | "compact" | "spinner" | "inline";
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
  minimumDate?: Date;
  themeVariant?: "light" | "dark";
  onChange: (event: SafeDateTimePickerEvent, date?: Date) => void;
};

export const hasNativeDateTimePicker = NativePicker != null;

export function SafeDateTimePicker(props: Props) {
  if (NativePicker) return <NativePicker {...props} />;
  return <FallbackPicker {...props} />;
}

const pad = (n: number) => String(n).padStart(2, "0");

function format(value: Date, mode: Props["mode"]): string {
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  return mode === "time" ? time : mode === "date" ? date : `${date} ${time}`;
}

function parse(text: string, mode: Props["mode"], base: Date): Date | null {
  const t = text.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const timeMatch = t.match(/(\d{1,2}):(\d{2})/);
  const dateMatch = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const next = new Date(base);
  if (mode !== "time") {
    if (!dateMatch) return null;
    next.setFullYear(+dateMatch[1], +dateMatch[2] - 1, +dateMatch[3]);
  }
  if (mode !== "date") {
    if (!timeMatch) return null;
    const h = +timeMatch[1];
    const m = +timeMatch[2];
    if (h > 23 || m > 59) return null;
    next.setHours(h, m, 0, 0);
  }
  return isNaN(next.getTime()) ? null : next;
}

/** Typed-in fallback for binaries without the native picker. */
function FallbackPicker({ value, mode, minimumDate, onChange }: Props) {
  const [text, setText] = useState(format(value, mode));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setText(format(value, mode)), [value, mode]);

  const commit = () => {
    const date = parse(text, mode, value);
    if (!date || (minimumDate && date < minimumDate)) {
      setInvalid(true);
      onChange({ type: "dismissed" });
      return;
    }
    setInvalid(false);
    onChange({ type: "set" }, date);
  };

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={commit}
        onSubmitEditing={commit}
        placeholder={mode === "time" ? "HH:MM" : mode === "date" ? "YYYY-MM-DD" : "YYYY-MM-DD HH:MM"}
        placeholderTextColor="#98A2B3"
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        style={[styles.input, invalid && styles.inputInvalid]}
      />
      {invalid ? (
        <Text style={styles.hint}>
          {mode === "time" ? "اكتب الوقت بصيغة 14:30" : "اكتب الموعد بصيغة 2026-10-15 14:30"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minWidth: 120,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6DDF8",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "700",
    color: "#16245C",
    textAlign: "center",
  },
  inputInvalid: {
    borderColor: "#F04438",
  },
  hint: {
    marginTop: 4,
    fontSize: 11,
    color: "#B42318",
    textAlign: "right",
  },
});
