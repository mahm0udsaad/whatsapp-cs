import { NextRequest, NextResponse } from "next/server";
import { adminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Public "request access / contact sales" endpoint.
 *
 * This replaces self-serve account creation. Submitting a lead here creates NO
 * auth user and NO credentials — it records a sales lead that the Nehgz team
 * qualifies and provisions manually after signing the commercial agreement.
 *
 * Compliance: App Store Review Guidelines 3.1.1 / 3.1.3(c). Neither the app nor
 * the website permits an individual/consumer to self-purchase the service.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      businessName?: string;
      contactEmail?: string;
      contactPhone?: string;
      country?: string;
      commercialRegistration?: string;
      message?: string;
    };

    const businessName = body.businessName?.trim();
    const contactEmail = body.contactEmail?.trim();

    if (!businessName) {
      return NextResponse.json(
        { error: "اسم النشاط التجاري مطلوب" },
        { status: 400 }
      );
    }

    if (!contactEmail || !contactEmail.includes("@")) {
      return NextResponse.json(
        { error: "بريد إلكتروني صحيح مطلوب" },
        { status: 400 }
      );
    }

    const { error } = await adminSupabaseClient.from("access_requests").insert({
      business_name: businessName,
      contact_email: contactEmail,
      contact_phone: body.contactPhone?.trim() || null,
      country: body.country?.trim() || "SA",
      commercial_registration: body.commercialRegistration?.trim() || null,
      message: body.message?.trim() || null,
      source: "web_signup",
    });

    if (error) {
      return NextResponse.json(
        { error: "تعذّر إرسال الطلب. حاول مرة أخرى." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع" },
      { status: 500 }
    );
  }
}
