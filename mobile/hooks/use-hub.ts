import { useEffect } from "react";
import { router } from "expo-router";
import { HubRepairNeededError } from "../lib/hub-api";

/**
 * Bounce the user back to the pairing screen when any Hub query/mutation
 * reports the stored token is no longer valid. Pass the error from a
 * React Query result; it's a no-op for every other error.
 */
export function useHubRepairGuard(error: unknown) {
  useEffect(() => {
    if (error instanceof HubRepairNeededError) {
      router.replace("/(hub)/pair");
    }
  }, [error]);
}
