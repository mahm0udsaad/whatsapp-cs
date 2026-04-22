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

  // ---- manager surface ----
  aiStatus: (restaurantId: string) =>
    ["manager", "ai-status", restaurantId] as const,
  overviewSummary: (restaurantId: string) =>
    ["manager", "overview", restaurantId] as const,
  teamRoster: (restaurantId: string) =>
    ["manager", "team-roster", restaurantId] as const,
  weeklySchedule: (restaurantId: string, weekStart: string) =>
    ["manager", "schedule", restaurantId, weekStart] as const,
  kpisToday: (restaurantId: string) =>
    ["manager", "kpis-today", restaurantId] as const,
  approvals: (restaurantId: string) =>
    ["manager", "approvals", restaurantId] as const,
  whatsappHealth: (restaurantId: string) =>
    ["manager", "whatsapp-health", restaurantId] as const,
  teamPerformance: (restaurantId: string, from: string, to: string) =>
    ["manager", "team-performance", restaurantId, from, to] as const,
  agentPerformanceDetail: (
    teamMemberId: string,
    from: string,
    to: string
  ) =>
    ["manager", "agent-performance", teamMemberId, from, to] as const,
  teamMemberNotes: (teamMemberId: string) =>
    ["manager", "team-member-notes", teamMemberId] as const,
  teamMemberGoals: (teamMemberId: string) =>
    ["manager", "team-member-goals", teamMemberId] as const,
  marketingTemplates: (restaurantId: string) =>
    ["manager", "marketing-templates", restaurantId] as const,
  marketingTemplatesAll: (restaurantId: string) =>
    ["manager", "marketing-templates-all", restaurantId] as const,
  marketingCampaigns: (restaurantId: string) =>
    ["manager", "marketing-campaigns", restaurantId] as const,
  marketingCampaignDetail: (campaignId: string) =>
    ["manager", "marketing-campaign", campaignId] as const,
  marketingCustomersCount: (restaurantId: string, since: string | null) =>
    ["manager", "marketing-customers-count", restaurantId, since ?? "all"] as const,

  customers: (
    restaurantId: string,
    q: string,
    page: number,
    optedOut: "all" | "active" | "opted_out"
  ) => ["customers", restaurantId, q, page, optedOut] as const,
};
