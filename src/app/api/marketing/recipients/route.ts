import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import * as XLSX from "xlsx";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

const PHONE_COLUMN_NAMES = ["phone_number", "phone", "mobile", "phonenumber", "phone number", "mobile number"];
const NAME_COLUMN_NAMES = ["name", "customer_name", "customername", "customer name", "full_name", "fullname", "full name"];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_\s]+/g, "_");
}

function findColumn(headers: string[], candidates: string[]): string | null {
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (candidates.includes(normalized)) {
      return header;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaign_id");

    if (!campaignId) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }

    // Verify campaign belongs to restaurant
    const { data: campaign, error: campaignError } = await adminSupabaseClient
      .from("marketing_campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const { data: recipients, error } = await adminSupabaseClient
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ recipients }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const campaignId = formData.get("campaign_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!campaignId) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }

    // Verify campaign belongs to restaurant and is in draft/scheduled status
    const { data: campaign, error: campaignError } = await adminSupabaseClient
      .from("marketing_campaigns")
      .select("id, status")
      .eq("id", campaignId)
      .eq("restaurant_id", restaurant.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      return NextResponse.json(
        { error: "Recipients can only be uploaded to draft or scheduled campaigns" },
        { status: 400 }
      );
    }

    // Parse the file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    if (workbook.SheetNames.length === 0) {
      return NextResponse.json({ error: "File contains no sheets" }, { status: 400 });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (rows.length === 0) {
      return NextResponse.json({ error: "File contains no data rows" }, { status: 400 });
    }

    // Find phone and name columns
    const headers = Object.keys(rows[0]);
    const phoneCol = findColumn(headers, PHONE_COLUMN_NAMES);
    const nameCol = findColumn(headers, NAME_COLUMN_NAMES);

    if (!phoneCol) {
      return NextResponse.json(
        { error: "Could not find a phone number column. Expected: phone_number, phone, or mobile" },
        { status: 400 }
      );
    }

    // Fetch opt-outs for this restaurant
    const { data: optOuts } = await adminSupabaseClient
      .from("opt_outs")
      .select("phone_number")
      .eq("restaurant_id", restaurant.id);

    const optOutSet = new Set(
      (optOuts || []).map((o: { phone_number: string }) => o.phone_number)
    );

    const errors: string[] = [];
    const validRecipients: Array<{ phone_number: string; name: string | null }> = [];
    let optedOutCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawPhone = String(row[phoneCol] || "").trim();
      const name = nameCol ? String(row[nameCol] || "").trim() || null : null;

      if (!rawPhone) {
        errors.push(`Row ${i + 2}: Empty phone number`);
        invalidCount++;
        continue;
      }

      // Validate E.164 format
      if (!E164_REGEX.test(rawPhone)) {
        errors.push(`Row ${i + 2}: Invalid phone format "${rawPhone}" (must be E.164, e.g. +1234567890)`);
        invalidCount++;
        continue;
      }

      // Check opt-out
      if (optOutSet.has(rawPhone)) {
        optedOutCount++;
        continue;
      }

      validRecipients.push({ phone_number: rawPhone, name });
    }

    // Deduplicate by phone number
    const seen = new Set<string>();
    const uniqueRecipients = validRecipients.filter((r) => {
      if (seen.has(r.phone_number)) return false;
      seen.add(r.phone_number);
      return true;
    });

    // Insert recipients in batches
    if (uniqueRecipients.length > 0) {
      const now = new Date().toISOString();
      const insertRows = uniqueRecipients.map((r) => ({
        campaign_id: campaignId,
        phone_number: r.phone_number,
        name: r.name,
        status: "pending" as const,
        created_at: now,
      }));

      // Insert in chunks of 500 to avoid payload limits
      const CHUNK_SIZE = 500;
      for (let i = 0; i < insertRows.length; i += CHUNK_SIZE) {
        const chunk = insertRows.slice(i, i + CHUNK_SIZE);
        const { error: insertError } = await adminSupabaseClient
          .from("campaign_recipients")
          .insert(chunk);

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      }

      // Update campaign total_recipients count
      // Get current count in case recipients were added before
      const { count } = await adminSupabaseClient
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);

      await adminSupabaseClient
        .from("marketing_campaigns")
        .update({
          total_recipients: count || uniqueRecipients.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);
    }

    return NextResponse.json(
      {
        total: rows.length,
        valid: uniqueRecipients.length,
        optedOut: optedOutCount,
        invalid: invalidCount,
        duplicates: validRecipients.length - uniqueRecipients.length,
        errors: errors.slice(0, 50), // Limit error messages
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
