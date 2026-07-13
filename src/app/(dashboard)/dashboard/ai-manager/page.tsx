import { redirect } from "next/navigation";

export default async function AiManagerPage() {
  redirect("/dashboard/ai-agent?tab=training");
}
