import { redirect } from "next/navigation";
import { getCurrentUser, getTenantContextForUser } from "@/lib/tenant";

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const tenant = await getTenantContextForUser(user.id);

  if (!tenant?.restaurant || tenant.setupStatus === "draft" || tenant.setupStatus === "failed") {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
