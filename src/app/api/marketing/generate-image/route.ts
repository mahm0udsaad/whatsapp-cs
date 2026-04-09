import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRestaurantForUserId } from "@/lib/tenant";
import { generateMarketingImage } from "@/lib/gemini-image";
import { adminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const restaurant = await getRestaurantForUserId(user.id);

    if (!restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    // 2. Parse and validate body
    const body = (await request.json()) as {
      prompt?: string;
      restaurantName?: string;
      language?: "ar" | "en";
      aspectRatio?: "1:1" | "16:9" | "4:3";
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    const restaurantName = body.restaurantName?.trim() || restaurant.name;
    const language = body.language === "ar" ? "ar" : "en";
    const aspectRatio = body.aspectRatio || "16:9";

    // 3. Generate the image via Gemini
    let result;
    try {
      result = await generateMarketingImage({
        prompt,
        restaurantName,
        language,
        aspectRatio,
      });
    } catch (genError: unknown) {
      const msg =
        genError instanceof Error ? genError.message : String(genError);
      console.error("[generate-image] Gemini generation failed:", msg);
      return NextResponse.json(
        { error: "Image generation failed", detail: msg },
        { status: 502 }
      );
    }

    // 4. Upload to Supabase Storage
    const buffer = Buffer.from(result.imageBase64, "base64");
    const extension = result.mimeType === "image/jpeg" ? "jpg" : "png";
    const fileName = `${restaurant.id}/${Date.now()}.${extension}`;

    const { error: uploadError } = await adminSupabaseClient.storage
      .from("marketing-images")
      .upload(fileName, buffer, {
        contentType: result.mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[generate-image] Storage upload failed:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image", detail: uploadError.message },
        { status: 500 }
      );
    }

    // 5. Get public URL
    const {
      data: { publicUrl },
    } = adminSupabaseClient.storage
      .from("marketing-images")
      .getPublicUrl(fileName);

    // 6. Return result
    return NextResponse.json({
      imageUrl: publicUrl,
      description: result.description,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[generate-image] Unexpected error:", msg);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
