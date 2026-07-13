import { redirect } from "next/navigation";

export default async function MenuPage() {
  redirect("/dashboard/restaurant?tab=menu");
}
