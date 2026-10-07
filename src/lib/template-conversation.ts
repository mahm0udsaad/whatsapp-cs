/**
 * Helpers for sending approved WhatsApp templates on a conversation.
 *
 * Business-initiated messages outside the 24h window must be approved
 * templates. These pure helpers resolve the `{{n}}` variable map the Twilio
 * Content API expects and render the body we persist in `messages.content`
 * so the inbox shows what the customer actually received.
 *
 * Variable roles come from the template's declared labels
 * (`marketing_templates.variables`, label i ↔ `{{i+1}}`):
 *   - agent labels (agent_name, …)       → the sending team member's name;
 *   - business labels (salon_name, …)    → the recipient's stored name;
 *   - otherwise `{{1}}` is the customer name (legacy convention shared with
 *     campaigns) and degrades to a polite generic greeting when missing.
 */

const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;

const AGENT_LABELS = new Set(["agent_name", "sender_name", "employee_name"]);
const BUSINESS_LABELS = new Set([
  "salon_name",
  "business_name",
  "store_name",
  "restaurant_name",
]);

export function isAgentLabel(label: string | null | undefined): boolean {
  return !!label && AGENT_LABELS.has(label.trim().toLowerCase());
}

export function isBusinessLabel(label: string | null | undefined): boolean {
  return !!label && BUSINESS_LABELS.has(label.trim().toLowerCase());
}

/**
 * 1-based slot that receives the recipient's name: the first business label,
 * else `{{1}}` unless `{{1}}` is the agent's name. null when none applies.
 */
export function recipientNameSlot(
  labels: readonly string[] | null | undefined
): number | null {
  const list = labels ?? [];
  const business = list.findIndex((l) => isBusinessLabel(l));
  if (business >= 0) return business + 1;
  if (isAgentLabel(list[0])) return null;
  return 1;
}

/** Distinct placeholder indexes used in a template body, ascending. */
export function templatePlaceholderIndexes(body: string | null | undefined): number[] {
  if (!body) return [];
  const set = new Set<number>();
  for (const m of body.matchAll(VAR_RE)) set.add(Number(m[1]));
  return Array.from(set).sort((a, b) => a - b);
}

export function defaultCustomerNameFallback(language: string | null | undefined): string {
  return language === "en" ? "Dear customer" : "عميلنا العزيز";
}

export type ResolveVariablesResult =
  | { ok: true; variables: Record<string, string> }
  | { ok: false; missing: number[] };

/**
 * Build the Twilio contentVariables map. Explicit values win; then the
 * label-driven auto-fill above; anything left unresolved is reported missing.
 */
export function resolveTemplateVariables(params: {
  body: string | null | undefined;
  language: string | null | undefined;
  provided: Record<string, unknown> | null | undefined;
  customerName: string | null | undefined;
  labels?: readonly string[] | null;
  senderName?: string | null;
}): ResolveVariablesResult {
  const indexes = templatePlaceholderIndexes(params.body);
  const provided = params.provided ?? {};
  const customerName = params.customerName?.trim() || null;
  const senderName = params.senderName?.trim() || null;
  const nameSlot = recipientNameSlot(params.labels);
  const variables: Record<string, string> = {};
  const missing: number[] = [];

  for (const idx of indexes) {
    const raw = provided[String(idx)];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) {
      variables[String(idx)] = value.slice(0, 1024);
      continue;
    }
    const label = params.labels?.[idx - 1];
    if (isAgentLabel(label)) {
      if (senderName) variables[String(idx)] = senderName;
      else missing.push(idx);
      continue;
    }
    if (idx === nameSlot) {
      if (customerName) variables[String(idx)] = customerName;
      else if (!isBusinessLabel(label))
        variables[String(idx)] = defaultCustomerNameFallback(params.language);
      else missing.push(idx);
      continue;
    }
    missing.push(idx);
  }

  return missing.length > 0 ? { ok: false, missing } : { ok: true, variables };
}

/** Substitute `{{n}}` with resolved values; unknown placeholders stay as-is. */
export function renderTemplateBody(
  body: string | null | undefined,
  variables: Record<string, string>
): string {
  if (!body) return "";
  return body.replace(VAR_RE, (match, g1: string) => variables[g1] ?? match);
}
