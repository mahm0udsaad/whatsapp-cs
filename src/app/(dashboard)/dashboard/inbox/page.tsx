import { redirect } from "next/navigation";

export default async function InboxPage() {
  redirect("/dashboard/conversations");
}
