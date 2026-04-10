import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";
import { crawlWebsiteMultiPage } from "@/lib/website-kb-crawler";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim() || restaurant.website_url?.trim();

    if (!url) {
      return NextResponse.json(
        { error: "No URL provided and no website URL on record." },
        { status: 400 }
      );
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const { entries, pagesCrawled } = await crawlWebsiteMultiPage(url, restaurant.id);

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Could not extract any content from the website. Make sure the URL is accessible." },
        { status: 422 }
      );
    }

    const { data, error } = await adminSupabaseClient
      .from("knowledge_base")
      .insert(entries)
      .select("*");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath("/dashboard/knowledge-base");

    return NextResponse.json({
      entries: data,
      entries_created: data?.length ?? 0,
      pages_crawled: pagesCrawled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
