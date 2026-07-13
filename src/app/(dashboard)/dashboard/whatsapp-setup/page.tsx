import { redirect } from "next/navigation";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { WhatsAppSetupForm } from "@/components/dashboard/whatsapp-setup-form";

export default async function WhatsAppSetupPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const restaurant = await getRestaurantForUserId(user.id);

  if (!restaurant) {
    redirect("/onboarding");
  }

  const { data: existingNumber } = await adminSupabaseClient
    .from("whatsapp_numbers")
    .select("phone_number, onboarding_status, last_error, twilio_whatsapp_sender_sid")
    .eq("restaurant_id", restaurant.id)
    .eq("is_primary", true)
    .maybeSingle();

  return (
    <div className="dashboard-page">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="dashboard-page-header">
          <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#20339a]">قناة التواصل</p>
          <h1>ربط رقم واتساب</h1>
          <p>
            سجّل الرقم الذي سيستقبل رسائل عملائك على واتساب ويرد عليها.
          </p>
          </div>
        </div>

        <WhatsAppSetupForm
          businessName={restaurant.name}
          initialPhoneNumber={
            existingNumber?.phone_number || restaurant.twilio_phone_number || ""
          }
          existingStatus={existingNumber?.onboarding_status || null}
          existingError={existingNumber?.last_error || null}
          existingSenderSid={existingNumber?.twilio_whatsapp_sender_sid || null}
        />
      </div>
    </div>
  );
}
