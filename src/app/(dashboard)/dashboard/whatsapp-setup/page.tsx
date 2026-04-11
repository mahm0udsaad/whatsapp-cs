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
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">
            ربط رقم واتساب
          </h1>
          <p className="mt-2 text-slate-600">
            سجّل الرقم الذي سيستقبل رسائل عملائك على واتساب ويرد عليها.
          </p>
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
