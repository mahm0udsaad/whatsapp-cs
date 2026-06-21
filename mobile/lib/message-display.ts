// Interactive taps (WhatsApp button / list replies) are stored with the
// encoded "[user_action:<id>]" token in `content` so the AI can read them, while
// the human-readable label lives in metadata.tap. Agents should always see the
// label the customer actually picked — never the raw token.

const TAP_TOKEN_RE = /\[user_action:[^\]]+\]/g;

export interface DisplayableMessage {
  content: string | null;
  metadata?: Record<string, unknown> | null;
}

export function displayMessageText(message: DisplayableMessage): string {
  const tap = (message.metadata as
    | { tap?: { title?: string | null; raw_body?: string | null } }
    | null
    | undefined)?.tap;
  if (tap) {
    const label = (tap.title ?? "").trim() || (tap.raw_body ?? "").trim();
    if (label) return label;
  }

  const content = message.content ?? "";
  const cleaned = content.replace(TAP_TOKEN_RE, "").trim();
  if (cleaned !== content.trim()) {
    // Content contained a token. Prefer the surrounding text; otherwise
    // prettify the action id (e.g. "e_store" → "e store").
    if (cleaned) return cleaned;
    const id = /\[user_action:([^\]]+)\]/.exec(content)?.[1] ?? "";
    return id.replace(/[_-]+/g, " ").trim() || content;
  }
  return content;
}
