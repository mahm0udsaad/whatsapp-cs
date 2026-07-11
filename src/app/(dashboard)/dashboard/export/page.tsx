import { redirect } from "next/navigation";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import { ExportClientData } from "@/components/dashboard/export-client-data";

export default async function ExportPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) {
    redirect("/onboarding");
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">تصدير بيانات العميل</h1>
          <p className="mt-2 text-slate-600">
            اربط رقم واتساب العميل مؤقتًا لسحب سجل المحادثات والوسائط والرسائل
            الصوتية، ثم اعتمد التصدير وافصل الاتصال.
          </p>
        </div>

        <ExportClientData />
      </div>
    </div>
  );
}
