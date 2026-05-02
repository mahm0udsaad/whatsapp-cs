"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BookOpen,
  Brain,
  CalendarClock,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Package,
  Store,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { LanguageSwitcher } from "./language-switcher";
import { Locale, getClientLocale, createTranslator } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

interface SidebarProps {
  restaurantName?: string;
  restaurantLogo?: string;
  userEmail?: string;
  userName?: string;
  onLogout?: () => void;
  locale?: Locale;
  showLanguageSwitcher?: boolean;
  restaurantId?: string | null;
  isOwner?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function Sidebar({
  restaurantName = "Store",
  restaurantLogo,
  userEmail,
  userName,
  onLogout,
  locale: forcedLocale,
  showLanguageSwitcher = true,
  restaurantId,
  isOwner = false,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unclaimedCount, setUnclaimedCount] = useState<number>(0);
  const pathname = usePathname();
  const locale = forcedLocale ?? getClientLocale();
  const t = createTranslator(locale);

  useEffect(() => {
    if (!restaurantId) return;
    const supabase = createClient();
    let isMounted = true;

    async function loadCount() {
      const { count } = await supabase
        .from("orders")
        .select("id", { head: true, count: "exact" })
        .eq("restaurant_id", restaurantId!)
        .eq("type", "escalation")
        .is("assigned_to", null)
        .eq("status", "pending");
      if (isMounted) setUnclaimedCount(count || 0);
    }

    loadCount();

    const channel = supabase
      .channel(`inbox-badge:${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          loadCount();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  const navSections: NavSection[] = [
    {
      title: "العمليات",
      items: [
        {
          href: "/dashboard/inbox",
          label: "صندوق التصعيدات",
          description: "طلبات تحتاج تدخلاً بشرياً",
          icon: Inbox,
          badge: unclaimedCount,
        },
        {
          href: "/dashboard/orders",
          label: "الطلبات",
          description: "الحجوزات والحالات المفتوحة",
          icon: ClipboardList,
        },
        {
          href: "/dashboard/conversations",
          label: t("nav.conversations"),
          description: "سجل جميع المحادثات",
          icon: MessageSquare,
        },
      ],
    },
    {
      title: "الإعداد",
      items: [
        {
          href: "/dashboard",
          label: t("nav.overview"),
          description: "نظرة عامة على الأداء",
          icon: LayoutDashboard,
          exact: true,
        },
        {
          href: "/dashboard/restaurant",
          label: t("nav.restaurant"),
          description: "بيانات وإعدادات المطعم",
          icon: Store,
        },
        {
          href: "/dashboard/ai-agent",
          label: t("nav.aiAgent"),
          description: "إعدادات المساعد الذكي",
          icon: Bot,
        },
        ...(isOwner
          ? [
              {
                href: "/dashboard/ai-manager",
                label: "مدرب الذكاء",
                description: "درّب المساعد بتعليمات جديدة",
                icon: Brain,
              },
            ]
          : []),
      ],
    },
    {
      title: "المحتوى",
      items: [
        {
          href: "/dashboard/knowledge-base",
          label: t("nav.knowledgeBase"),
          description: "الأسئلة الشائعة والمعلومات",
          icon: BookOpen,
        },
        {
          href: "/dashboard/menu",
          label: t("nav.menu"),
          description: "الأصناف والأسعار",
          icon: Package,
        },
      ],
    },
    {
      title: "التسويق",
      items: [
        {
          href: "/dashboard/customers",
          label: "العملاء",
          description: "قاعدة بيانات العملاء",
          icon: Users,
        },
        {
          href: "/dashboard/marketing",
          label: t("nav.marketing"),
          description: "الحملات والقوالب",
          icon: Megaphone,
        },
      ],
    },
    {
      title: "الفريق",
      items: [
        ...(isOwner
          ? [
              {
                href: "/dashboard/shifts",
                label: "الجدول",
                description: "مواعيد الدوام والحضور",
                icon: CalendarClock,
              },
            ]
          : []),
        {
          href: "/dashboard/team",
          label: t("nav.team"),
          description: "الأعضاء والصلاحيات",
          icon: Users,
        },
      ],
    },
  ].filter((section) => section.items.length > 0);

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const userInitials = userName
    ? userName
        .split(" ")
        .map((name) => name[0])
        .join("")
        .toUpperCase()
    : "U";

  return (
    <>
      <button
        onClick={() => setIsOpen((open) => !open)}
        className="fixed start-4 top-4 z-50 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-slate-900 shadow-lg backdrop-blur-xl transition-colors hover:bg-white lg:hidden"
        aria-label={isOpen ? "إغلاق التنقل" : "فتح التنقل"}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 w-60 border-e border-white/10 bg-[#0e1713] text-white shadow-[0_24px_80px_-40px_rgba(0,0,0,0.65)] transition-transform duration-300 lg:translate-x-0",
          isOpen
            ? "translate-x-0"
            : "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-3">
              {restaurantLogo ? (
                <img
                  src={restaurantLogo}
                  alt={restaurantName}
                  className="h-9 w-9 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-200">
                  <Store size={16} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {restaurantName}
                </p>
                <div className="mt-0.5 inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-emerald-400/80">
                    {t("sidebar.liveOps")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="space-y-5">
              {navSections.map((section) => (
                <div key={section.title}>
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                    {section.title}
                  </p>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href, item.exact);

                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className={cn(
                              "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-200",
                              active
                                ? "bg-white text-slate-950 shadow-[0_8px_24px_-8px_rgba(255,255,255,0.4)]"
                                : "text-white/70 hover:bg-white/6 hover:text-white"
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors",
                                active
                                  ? "border-slate-200 bg-emerald-50 text-emerald-700"
                                  : "border-white/10 bg-white/6 text-white/75 group-hover:border-white/20"
                              )}
                            >
                              <Icon size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium leading-none">
                                  {item.label}
                                </p>
                                {typeof item.badge === "number" && item.badge > 0 ? (
                                  <span
                                    className={cn(
                                      "inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                                      active
                                        ? "bg-rose-600 text-white"
                                        : "bg-rose-500 text-white shadow-[0_0_0_3px_rgba(244,63,94,0.18)]"
                                    )}
                                  >
                                    {item.badge > 99 ? "99+" : item.badge}
                                  </span>
                                ) : null}
                              </div>
                              <p
                                className={cn(
                                  "mt-0.5 truncate text-[11px] leading-none transition-colors",
                                  active ? "text-slate-500" : "text-white/40 group-hover:text-white/55"
                                )}
                              >
                                {item.description}
                              </p>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          {/* Footer */}
          <div className="border-t border-white/10 p-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-white/10">
                  <AvatarImage src={undefined} />
                  <AvatarFallback className="bg-emerald-400/15 text-sm text-emerald-100">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {userName || "مستخدم"}
                  </p>
                  <p className="truncate text-[11px] text-white/45">
                    {userEmail || "user@example.com"}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {showLanguageSwitcher ? <LanguageSwitcher /> : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="w-full justify-start rounded-xl border border-white/10 bg-white/6 px-3 text-white hover:bg-white/10"
                >
                  <LogOut size={15} />
                  {t("nav.logout")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {isOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      ) : null}
    </>
  );
}
