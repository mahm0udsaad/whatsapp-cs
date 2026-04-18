// Tracks which conversation the user is currently viewing in the chat
// detail screen. Module-level state because the notification handler in
// push.ts needs SYNC access to the value — it has no React context/hooks.
//
// The chat screen calls setActiveConv(id) on mount and setActiveConv(null)
// on unmount. The handler uses getActiveConv() to decide whether to
// suppress the in-app banner for a push that targets the same conversation.

let activeConvId: string | null = null;

export function setActiveConv(id: string | null): void {
  activeConvId = id;
}

export function getActiveConv(): string | null {
  return activeConvId;
}
