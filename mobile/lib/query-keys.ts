export const qk = {
  session: ["session"] as const,
  me: ["me"] as const,
  memberships: (userId: string) => ["memberships", userId] as const,

  inboxUnclaimed: (restaurantId: string) =>
    ["inbox", "unclaimed", restaurantId] as const,

  order: (orderId: string) => ["order", orderId] as const,
  conversation: (conversationId: string) =>
    ["conversation", conversationId] as const,

  shifts: (teamMemberId: string) => ["shifts", teamMemberId] as const,
};
