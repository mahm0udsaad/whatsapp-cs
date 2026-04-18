import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit,
  Eye,
  FileText,
  Megaphone,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { adminSupabaseClient } from "@/lib/supabase/admin";
import { getCurrentUser, getRestaurantForUserId } from "@/lib/tenant";
import type { MarketingTemplate } from "@/lib/types";

const statusConfig: Record<
  string,
  { className: string; label: string; icon: typeof CheckCircle2 }
> = {
  draft: { className: "bg-slate-200/70 text-slate-700", label: "مسودة", icon: FileText },
  submitted: { className: "bg-amber-500/12 text-amber-700", label: "مرسلة", icon: Clock },
  pending: { className: "bg-amber-500/12 text-amber-700", label: "قيد المراجعة", icon: Clock },
  approved: { className: "bg-emerald-500/12 text-emerald-700", label: "معتمدة", icon: CheckCircle2 },
  rejected: { className: "bg-red-500/12 text-red-700", label: "مرفوضة", icon: XCircle },
  paused: { className: "bg-orange-500/12 text-orange-700", label: "متوقفة", icon: AlertCircle },
  disabled: { className: "bg-slate-200/70 text-slate-600", label: "معطلة", icon: XCircle },
};

const categoryColors: Record<string, string> = {
  MARKETING: "bg-violet-500/12 text-violet-700",
  UTILITY: "bg-sky-500/12 text-sky-700",
  AUTHENTICATION: "bg-orange-500/12 text-orange-700",
};

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurantForUserId(user.id);
  if (!restaurant) redirect("/onboarding");

  const { data: templates } = await adminSupabaseClient
    .from("marketing_templates")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false });

  const allTemplates = (templates || []) as MarketingTemplate[];

  const draftCount = allTemplates.filter((t) => t.approval_status === "draft").length;
  const pendingCount = allTemplates.filter((t) =>
    ["submitted", "pending"].includes(t.approval_status)
  ).length;
  const approvedCount = allTemplates.filter((t) => t.approval_status === "approved").length;
  const rejectedCount = allTemplates.filter((t) => t.approval_status === "rejected").length;

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            قوالب الرسائل
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            أنشئ قوالب واتساب وأدرها وأرسلها للاعتماد.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/marketing/templates/new">
            <Button className="gap-2 rounded-full">
              <Sparkles size={16} />
              إنشاء بالذكاء الاصطناعي
            </Button>
          </Link>
        </div>
      </div>

      {/* Status counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "مسودة", count: draftCount, color: "text-slate-600" },
          { label: "قيد المراجعة", count: pendingCount, color: "text-amber-600" },
          { label: "معتمدة", count: approvedCount, color: "text-emerald-600" },
          { label: "مرفوضة", count: rejectedCount, color: "text-red-600" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[24px] border border-slate-200/70 bg-white/70 p-4 text-center"
          >
            <p className={cn("text-2xl font-semibold", stat.color)}>
              {stat.count}
            </p>
            <p className="text-xs font-medium text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Template grid */}
      {allTemplates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText size={40} className="mb-4 text-slate-300" />
            <h3 className="text-lg font-semibold text-slate-900">
              لا توجد قوالب بعد
            </h3>
            <p className="mt-2 max-w-sm text-center text-sm text-slate-500">
              ابدأ بأول قالب واتساب عبر المساعد الذكي أو أنشئه يدوياً.
            </p>
            <Link href="/dashboard/marketing/templates/new" className="mt-6">
              <Button className="gap-2 rounded-full">
                <Sparkles size={16} />
                إنشاء بالذكاء الاصطناعي
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {allTemplates.map((template) => {
            const status = statusConfig[template.approval_status] || statusConfig.draft;
            const catColor = categoryColors[template.category] || "bg-slate-200/70 text-slate-700";
            const StatusIcon = status.icon;

            return (
              <Card key={template.id} className="group relative overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">
                        {template.name}
                      </CardTitle>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                            status.className
                          )}
                        >
                          <StatusIcon size={12} className="me-1" />
                          {status.label}
                        </Badge>
                        <Badge
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium",
                            catColor
                          )}
                        >
                          {template.category}
                        </Badge>
                        <Badge className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                          {template.language.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Body preview */}
                  {template.body_template && (
                    <div className="rounded-xl bg-slate-50 p-3 mb-4">
                      <p className="line-clamp-3 text-sm leading-6 text-slate-700">
                        {template.body_template}
                      </p>
                    </div>
                  )}

                  {/* Rejection reason */}
                  {template.approval_status === "rejected" &&
                    template.rejection_reason && (
                      <div className="rounded-xl bg-red-50 border border-red-200 p-3 mb-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500 mb-1">
                          سبب الرفض
                        </p>
                        <p className="text-xs text-red-700">
                          {template.rejection_reason}
                        </p>
                      </div>
                    )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Draft actions */}
                    {template.approval_status === "draft" && (
                      <>
                        <form
                          action={`/api/marketing/templates/${template.id}/submit`}
                          method="POST"
                        >
                          <Button
                            type="submit"
                            size="sm"
                            className="gap-1.5 rounded-full text-xs"
                          >
                            <Send size={12} />
                            إرسال للاعتماد
                          </Button>
                        </form>
                        <Link
                          href={`/dashboard/marketing/templates/new?edit=${template.id}`}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 rounded-full text-xs"
                          >
                            <Edit size={12} />
                            تعديل
                          </Button>
                        </Link>
                      </>
                    )}

                    {/* Pending/Submitted - view only */}
                    {["submitted", "pending"].includes(
                      template.approval_status
                    ) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-full text-xs"
                      >
                        <Eye size={12} />
                        عرض
                      </Button>
                    )}

                    {/* Approved - use in campaign */}
                    {template.approval_status === "approved" && (
                      <Link
                        href={`/dashboard/marketing/campaigns/new?template=${template.id}`}
                      >
                        <Button
                          size="sm"
                          className="gap-1.5 rounded-full text-xs"
                        >
                          <Megaphone size={12} />
                          استخدام في حملة
                        </Button>
                      </Link>
                    )}

                    {/* Rejected - edit and resubmit */}
                    {template.approval_status === "rejected" && (
                      <Link
                        href={`/dashboard/marketing/templates/new?edit=${template.id}`}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 rounded-full text-xs"
                        >
                          <Edit size={12} />
                          تعديل وإعادة الإرسال
                        </Button>
                      </Link>
                    )}
                  </div>

                  {/* Meta: date */}
                  <p className="mt-3 text-[11px] text-slate-400">
                    أُنشئ{" "}
                    {new Date(template.created_at).toLocaleDateString("ar", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
