/**
 * Create + submit the Nehgz Hub salon-outreach WhatsApp templates.
 *
 * Mirrors POST /api/mobile/marketing/templates: Twilio Content API create →
 * WhatsApp approval request → `marketing_templates` row (status 'submitted')
 * + `template_approval_polls` row so the existing poller flips it to
 * 'approved'. Idempotent per template name — existing rows are skipped.
 *
 * Variable labels drive auto-fill when sending from the app
 * (src/lib/template-conversation.ts): agent_name → the sending agent,
 * salon_name → the customer's stored name, link → typed by the agent.
 *
 * Usage:
 *   npm run seed:outreach-templates
 *   npm run seed:outreach-templates -- --dry-run
 *   npm run seed:outreach-templates -- --restaurant=<uuid>
 */

import { createClient } from "@supabase/supabase-js";
import { validateTemplateContent } from "../src/lib/template-validation";

const NEHGZ_HUB_RESTAURANT_ID = "11111111-aaaa-4aaa-8aaa-000000001001";
const CONTENT_API_BASE = "https://content.twilio.com/v1";

interface OutreachTemplate {
  /** Display name in the app. */
  name: string;
  /** Meta submission name: lowercase ASCII + underscores, unique per WABA. */
  metaName: string;
  body: string;
  variables: string[];
  sampleValues: string[];
}

const TEMPLATES: OutreachTemplate[] = [
  {
    name: "حجوزات خارج الدوام",
    metaName: "nehgz_hub_after_hours_bookings",
    body: [
      "هلا، {{1}} من نحجز هب، كلمتكم قبل شوي.",
      "",
      "للإدارة:",
      "العميلة اللي تراسلكم الساعة ١١ بالليل وما تلقى رد… غالبًا تحجز عند صالون ثاني.",
      "",
      "تخيلوا {{2}} يستقبل حجوزات حتى خارج ساعات عملكم: العميلة تختار الخدمة والموظفة والوقت، وتدفع عربون، والحجز يوصلكم جاهز.",
      "",
      "شوفوها بدقيقة: {{3}}",
      "",
      "تحبون أجهز لكم صفحة تجريبية باسم الصالون مجانًا؟",
    ].join("\n"),
    variables: ["agent_name", "salon_name", "link"],
    sampleValues: ["سارة", "صالون لمسة", "https://nehgzbot.com"],
  },
  {
    name: "الاستقبال المشغول",
    metaName: "nehgz_hub_busy_reception",
    body: [
      "هلا، {{1}} من نحجز هب.",
      "",
      "للإدارة: العميلة اللي تراسل بعد الدوام وما تلقى رد، تروح لصالون ثاني.",
      "",
      "نخلي {{2}} يستقبل حجوزات ويقبض عربون ٢٤ ساعة، بدون عمولة.",
      "",
      "تبون صفحة تجريبية باسمكم مجانًا؟",
    ].join("\n"),
    variables: ["agent_name", "salon_name"],
    sampleValues: ["سارة", "صالون لمسة"],
  },
  {
    name: "بطاقات الهدايا",
    metaName: "nehgz_hub_gift_cards",
    // WhatsApp rejects a body that ends with a variable, so the link moves
    // before the closing question.
    body: [
      "هلا، معك {{1}} من نحجز هب.",
      "",
      "فكرة تجيب لكم عميلات جدد ودخل مقدّم:",
      "عميلتكم تشتري بطاقة هدية أونلاين وترسلها لصديقتها، أنتم تستلمون المبلغ اليوم، وصديقتها تصير عميلة جديدة.",
      "",
      "شوفوا كيف تشتغل: {{2}}",
      "",
      "تبون أوريكم بالتفصيل؟",
    ].join("\n"),
    variables: ["agent_name", "link"],
    sampleValues: ["سارة", "https://nehgzbot.com"],
  },
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (run with --env-file=.env.local)`);
  return v;
}

async function contentApi<T>(path: string, body: unknown): Promise<T> {
  const auth = Buffer.from(
    `${requireEnv("TWILIO_ACCOUNT_SID")}:${requireEnv("TWILIO_AUTH_TOKEN")}`
  ).toString("base64");
  const res = await fetch(`${CONTENT_API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Twilio Content API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const restaurantArg = process.argv.find((a) => a.startsWith("--restaurant="));
  const restaurantId = restaurantArg?.split("=")[1] || NEHGZ_HUB_RESTAURANT_ID;

  for (const t of TEMPLATES) {
    const err = validateTemplateContent({
      bodyTemplate: t.body,
      headerType: "none",
      variables: t.variables,
      sampleValues: t.sampleValues,
    });
    if (err) throw new Error(`${t.name}: ${err}`);
  }

  if (dryRun) {
    for (const t of TEMPLATES) {
      console.log(`\n— ${t.name} (${t.metaName}) vars=${t.variables.join(", ")}\n${t.body}`);
    }
    console.log("\n✅ dry run: all templates pass validation");
    return;
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!restaurant) throw new Error(`Restaurant ${restaurantId} not found`);
  console.log(`Tenant: ${restaurant.name} (${restaurant.id})`);

  for (const t of TEMPLATES) {
    const { data: existing } = await supabase
      .from("marketing_templates")
      .select("id, approval_status")
      .eq("restaurant_id", restaurantId)
      .eq("name", t.name)
      .maybeSingle();
    if (existing) {
      console.log(`⏭  ${t.name}: already exists (${existing.approval_status})`);
      continue;
    }

    const variablesMap: Record<string, string> = {};
    t.sampleValues.forEach((v, i) => (variablesMap[String(i + 1)] = v));

    const { sid: contentSid } = await contentApi<{ sid: string }>("/Content", {
      friendly_name: t.metaName,
      language: "ar",
      variables: variablesMap,
      types: { "twilio/text": { body: t.body } },
    });

    const now = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("marketing_templates")
      .insert({
        restaurant_id: restaurantId,
        name: t.name,
        twilio_content_sid: contentSid,
        body_template: t.body,
        language: "ar",
        category: "MARKETING",
        header_type: "none",
        variables: t.variables,
        approval_status: "draft",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(`${t.name}: insert failed — ${error?.message}`);

    try {
      await contentApi(`/Content/${contentSid}/ApprovalRequests/whatsapp`, {
        name: t.metaName,
        category: "MARKETING",
      });
    } catch (e) {
      console.error(`⚠️  ${t.name}: created as draft but submit failed —`, e);
      continue;
    }

    const submittedAt = new Date().toISOString();
    await supabase
      .from("marketing_templates")
      .update({ approval_status: "submitted", updated_at: submittedAt })
      .eq("id", row.id);
    await supabase.from("template_approval_polls").insert({
      template_id: row.id,
      restaurant_id: restaurantId,
      twilio_content_sid: contentSid,
      poll_count: 0,
      next_poll_at: submittedAt,
      status: "polling",
      created_at: submittedAt,
      updated_at: submittedAt,
    });
    console.log(`✅ ${t.name}: submitted (${contentSid})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
