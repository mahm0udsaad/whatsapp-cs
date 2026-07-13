import { redirect } from "next/navigation";

export default async function OrdersPage() {
  redirect("/dashboard/conversations?tab=requests");
}
