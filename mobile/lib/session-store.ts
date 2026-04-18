import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { TeamMemberRow } from "./supabase";

const DEVICE_ID_KEY = "agent_console.device_id";
const ACTIVE_TENANT_KEY = "agent_console.active_tenant";

async function generateDeviceId() {
  // Random 128-bit id persisted in SecureStore — we use it to upsert
  // user_push_tokens per (team_member, device).
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = await generateDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

export async function persistActiveTenant(teamMemberId: string) {
  await SecureStore.setItemAsync(ACTIVE_TENANT_KEY, teamMemberId);
}
export async function loadActiveTenant(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_TENANT_KEY);
}
export async function clearActiveTenant() {
  await SecureStore.deleteItemAsync(ACTIVE_TENANT_KEY);
}

type SessionState = {
  activeMember: TeamMemberRow | null;
  setActiveMember: (m: TeamMemberRow | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  activeMember: null,
  setActiveMember: (m) => set({ activeMember: m }),
}));
