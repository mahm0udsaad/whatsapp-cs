import { redirect } from "next/navigation";

export default async function KnowledgeBasePage() {
  redirect("/dashboard/ai-agent?tab=knowledge");
}
