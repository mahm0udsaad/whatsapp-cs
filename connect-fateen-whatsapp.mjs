// STEP 1 of WhatsApp connect for Fateen — registers the customer-owned number
// as a WhatsApp sender via Twilio with VOICE verification.
// Run ONLY after the CEO has disabled the IVR on the 920 line so a human can
// answer the verification call and read back the spoken OTP.
//
//   node connect-fateen-whatsapp.mjs            (defaults to +966920033077)
//   node connect-fateen-whatsapp.mjs +966596166909
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
const UID = "2cbaba29-2dd0-4792-85b7-ea4e5617f5dc";
const phone = (process.argv[2] || "+966920033077").trim();
const businessName = "Fateen Digital Marketing";
const appUrl = (env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const webhookUrl = `${appUrl}/api/webhooks/twilio`;
const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
const now = new Date().toISOString();

async function main() {
  console.log(`Registering ${phone} as WhatsApp sender (VOICE verification)…`);
  console.log(`webhook: ${webhookUrl}`);

  let senderSid = null, senderStatus = null, lastError = null;
  const resp = await fetch("https://messaging.twilio.com/v2/Channels/Senders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender_id: phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`,
      profile: { name: businessName },
      configuration: { verification_method: "voice", verificationMethod: "voice" },
      webhook: { callback_url: webhookUrl, callback_method: "POST" },
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    lastError = `Twilio ${resp.status}: ${text.slice(0, 600)}`;
    console.error("REGISTRATION FAILED:", lastError);
  } else {
    const j = JSON.parse(text);
    senderSid = j.sid;
    senderStatus = (j.status || "CREATING").toUpperCase();
    console.log("sender sid:", senderSid, "status:", senderStatus);
  }

  // Persist the number row (so the dashboard reflects it and verify step can read the sid)
  const { data: rec, error } = await sb
    .from("whatsapp_numbers")
    .upsert({
      phone_number: phone,
      source_type: "customer_owned",
      is_primary: true,
      assignment_status: senderSid ? "active" : "assigned",
      onboarding_status: senderSid ? "pending_test" : "failed",
      twilio_whatsapp_sender_sid: senderSid,
      last_error: lastError,
      restaurant_id: RID,
      assigned_at: now,
      updated_at: now,
    }, { onConflict: "phone_number" })
    .select("id")
    .single();
  if (error) throw new Error("whatsapp_numbers upsert: " + error.message);

  await sb.from("restaurants").update({ primary_whatsapp_number_id: rec.id, twilio_phone_number: phone, updated_at: now }).eq("id", RID);
  await sb.from("provisioning_runs").insert({
    owner_id: UID, restaurant_id: RID, whatsapp_number_id: rec.id,
    status: senderSid ? "pending_sender_registration" : "failed",
    current_step: "voice_verification_pending",
    metadata: { phone, webhookUrl, senderSid, senderStatus, lastError, verification: "voice" },
  });

  console.log("\nNEXT: Twilio will place a VOICE CALL to", phone, "reading a verification code.");
  console.log("When you have the code, run:  node verify-fateen-whatsapp.mjs <CODE>");
  if (lastError) process.exit(1);
}
main().catch((e) => { console.error("FATAL:", e.message || e); process.exit(1); });
