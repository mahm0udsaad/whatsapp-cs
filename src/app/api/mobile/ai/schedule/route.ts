/**
 * GET  /api/mobile/ai/schedule  — read the AI bot schedule for the tenant.
 * POST /api/mobile/ai/schedule  — save it. Manager-only.
 *
 * Body (POST): {
 *   enabled: boolean,          // restrict the bot to the daily window
 *   start: "HH:MM",            // daily window start (tenant timezone)
 *   end: "HH:MM",              // daily window end
 *   weekend24h: boolean,       // run all day on Fri/Sat
 *   timezone?: string          // IANA tz, defaults to existing/Asia/Riyadh
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCurrentRestaurantForAdmin } from "@/lib/mobile-auth";
import { parseTimeToMinutes } from "@/lib/ai-schedule";

const TIME_RE = /^\d{1,2}:\d{2}$/;

interface ScheduleBody {
  enabled?: boolean;
  start?: string;
  end?: string;
  weekend24h?: boolean;
  timezone?: string;
}

function normalizeTime(value: string): string {
  // Postgres returns "HH:MM:SS"; the client sends/expects "HH:MM".
  const [h, m] = value.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

export async function GET() {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const { data, error } = await adminSupabaseClient
    .from("restaurants")
    .select(
      "ai_schedule_enabled, ai_schedule_start, ai_schedule_end, ai_schedule_weekend_24h, ai_schedule_timezone"
    )
    .eq("id", restaurantId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  return NextResponse.json({
    enabled: data.ai_schedule_enabled ?? false,
    start: normalizeTime(data.ai_schedule_start ?? "00:00"),
    end: normalizeTime(data.ai_schedule_end ?? "23:59"),
    weekend24h: data.ai_schedule_weekend_24h ?? false,
    timezone: data.ai_schedule_timezone ?? "Asia/Riyadh",
  });
}

export async function POST(request: NextRequest) {
  const ctx = await resolveCurrentRestaurantForAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { restaurantId } = ctx;

  const body = (await request.json().catch(() => ({}))) as ScheduleBody;

  if (typeof body.enabled !== "boolean" || typeof body.weekend24h !== "boolean") {
    return NextResponse.json(
      { error: "enabled and weekend24h (boolean) required" },
      { status: 400 }
    );
  }
  if (
    typeof body.start !== "string" ||
    typeof body.end !== "string" ||
    !TIME_RE.test(body.start) ||
    !TIME_RE.test(body.end) ||
    parseTimeToMinutes(body.start) === null ||
    parseTimeToMinutes(body.end) === null
  ) {
    return NextResponse.json(
      { error: "start and end must be valid HH:MM times" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {
    ai_schedule_enabled: body.enabled,
    ai_schedule_start: body.start,
    ai_schedule_end: body.end,
    ai_schedule_weekend_24h: body.weekend24h,
  };
  if (typeof body.timezone === "string" && body.timezone.trim()) {
    update.ai_schedule_timezone = body.timezone.trim();
  }

  const { error } = await adminSupabaseClient
    .from("restaurants")
    .update(update)
    .eq("id", restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    enabled: body.enabled,
    start: body.start,
    end: body.end,
    weekend24h: body.weekend24h,
    timezone: update.ai_schedule_timezone ?? undefined,
  });
}
