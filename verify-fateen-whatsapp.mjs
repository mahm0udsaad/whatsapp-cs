// STEP 2 of WhatsApp connect for Fateen — submit the voice-call OTP to Twilio.
//   node verify-fateen-whatsapp.mjs <CODE>
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(new URL("./.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const RID = "018f1bff-4e21-4f55-bde4-48b4d992e7ec";
const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
const code = (process.argv[2] || "").trim();
if (!code) { console.error("Usage: node verify-fateen-whatsapp.mjs <CODE>"); process.exit(1); }

async function main() {
  const { data: num } = await sb.from("whatsapp_numbers")
    .select("id,twilio_whatsapp_sender_sid,phone_number")
    .eq("restaurant_id", RID).eq("is_primary", true).maybeSingle();
  if (!num?.twilio_whatsapp_sender_sid) throw new Error("No sender sid on file — run connect step first.");
  const sid = num.twilio_whatsapp_sender_sid;

  const resp = await fetch(`https://messaging.twilio.com/v2/Channels/Senders/${sid}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ configuration: { verification_code: code } }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Twilio verify ${resp.status}: ${text.slice(0, 600)}`);
  const status = (JSON.parse(text).status || "PENDING").toUpperCase();
  console.log("sender status after verify:", status);

  const online = status === "ONLINE" || status === "VERIFIED";
  const now = new Date().toISOString();
  await sb.from("whatsapp_numbers").update({
    onboarding_status: online ? "active" : (status === "FAILED" ? "failed" : "pending_test"),
    assignment_status: online ? "active" : "assigned",
    updated_at: now,
  }).eq("id", num.id);
  if (online) {
    await sb.from("restaurants").update({ setup_status: "active", activated_at: now, updated_at: now }).eq("id", RID);
    console.log("✅ WhatsApp ACTIVE — restaurant setup_status=active. Send a test message to", num.phone_number);
  } else {
    console.log("Status not yet online; re-check or re-run with a fresh code if it failed.");
  }
}
main().catch((e) => { console.error("FATAL:", e.message || e); process.exit(1); });
