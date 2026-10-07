/**
 * Helpers for starting a conversation with an approved WhatsApp template.
 *
 * Business-initiated messages outside the 24h window must be approved
 * templates. These pure helpers resolve the `{{n}}` variable map the Twilio
 * Content API expects and render the body we persist in `messages.content`
 * so the inbox shows what the customer actually received.
 *
 * Convention (shared with campaigns, see campaign-send-jobs.ts): `{{1}}` is
 * the customer name and degrades to a polite generic greeting when missing.
 */

const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;

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
 * Build the Twilio contentVariables map. `{{1}}` falls back to the customer
 * name and then a generic greeting; every other placeholder must be supplied.
 */
export function resolveTemplateVariables(params: {
  body: string | null | undefined;
  language: string | null | undefined;
  provided: Record<string, unknown> | null | undefined;
  customerName: string | null | undefined;
}): ResolveVariablesResult {
  const indexes = templatePlaceholderIndexes(params.body);
  const provided = params.provided ?? {};
  const variables: Record<string, string> = {};
  const missing: number[] = [];

  for (const idx of indexes) {
    const raw = provided[String(idx)];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) {
      variables[String(idx)] = value.slice(0, 1024);
      continue;
    }
    if (idx === 1) {
      variables["1"] =
        params.customerName?.trim() || defaultCustomerNameFallback(params.language);
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
