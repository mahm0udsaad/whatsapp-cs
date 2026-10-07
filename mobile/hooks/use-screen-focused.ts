import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

/**
 * True while this screen is the one on screen. Tab screens and screens under
 * a pushed stack stay mounted, so their React Query polling would otherwise
 * keep running in the background. Pass it as `subscribed` on polling queries:
 * an unsubscribed query stops its interval, and re-subscribing on return
 * refetches only if the data went stale.
 */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  return focused;
}
