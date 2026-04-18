/**
 * GET /api/mobile/whatsapp/health
 *
 * Returns the health of the primary WhatsApp number for the caller's
 * restaurant. Powers the mobile overview "WhatsApp status" card so owners
 * can tell at a glance whether their channel is live, still onboarding,
 * or broken.
 *
 * Shape:
 *   {
 *     primary: {
 *       phoneNumber: string | null,
 *       provider: string,          // 'twilio'
 *       assignmentStatus: string,  // available|reserved|assigned|active|suspended|released
 *       onboardingStatus: string,  // unclaimed|pending_embedded_signup|pending_sender_registration|pending_test|active|failed
 *       lastError: string | null,
 *       isHealthy: boolean,        // derived: both statuses === 'active' && no last_error
 *       label: string,             // short Arabic status label
 *       severity: 'ok' | 'warn' | 'error'
 *     } | null,
 *     hasNumbers: boolean
 *   }
 */

import { NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";

type WaRow = {
  phone_number: string | null;
  provider: string;
  assignment_status: string;
  onboarding_status: string;
  last_error: string | null;
  is_primary: boolean;
};

function deriveStatus(row: WaRow): {
  isHealthy: boolean;
  label: string;
  severity: "ok" | "warn" | "error";
} {
  const { assignment_status, onboarding_status, last_error } = row;

  if (last_error) {
    return { isHealthy: false, label: "خطأ في الاتصال", severity: "error" };
  }
  if (onboarding_status === "failed" || assignment_status === "suspended") {
    return { isHealthy: false, label: "الرقم معطّل", severity: "error" };
  }
  if (assignment_status === "released") {
    return { isHealthy: false, label: "الرقم مُحرَّر", severity: "error" };
  }
  if (
    onboarding_status === "active" &&
    (assignment_status === "active" || assignment_status === "assigned")
  ) {
    return { isHealthy: true, label: "يعمل بشكل طبيعي", severity: "ok" };
  }
  // Any of the pending states
  if (onboarding_status.startsWith("pending_")) {
    return {
      isHealthy: false,
      label: "قيد الإعداد — خطوة متبقية",
      severity: "warn",
    };
  }
  if (onboarding_status === "unclaimed") {
    return {
      isHealthy: false,
      label: "لم يكتمل الإعداد",
      severity: "warn",
    };
  }
  return { isHealthy: false, label: "حالة غير معروفة", severity: "warn" };
}

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  // Pick the primary number if one is flagged; otherwise the most recently
  // assigned row. Helps when a restaurant has multiple numbers provisioned.
  const { data, error } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .select(
      "phone_number, provider, assignment_status, onboarding_status, last_error, is_primary, assigned_at"
    )
    .eq("restaurant_id", restaurantId)
    .order("is_primary", { ascending: false })
    .order("assigned_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = (data ?? [])[0] as WaRow | undefined;
  if (!row) {
    return NextResponse.json({ primary: null, hasNumbers: false });
  }

  const status = deriveStatus(row);

  return NextResponse.json({
    primary: {
      phoneNumber: row.phone_number,
      provider: row.provider,
      assignmentStatus: row.assignment_status,
      onboardingStatus: row.onboarding_status,
      lastError: row.last_error,
      ...status,
    },
    hasNumbers: true,
  });
}
