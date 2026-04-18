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

  // Live count of unclaimed escalations for the badge on the Inbox nav item.
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

  const navItems = [
    {
      href: "/dashboard/inbox",
      label: "صندوق التصعيدات",
      description: "الطلبات غير المستلمة للتدخل البشري",
      icon: Inbox,
      badge: unclaimedCount,
    },
    {
      href: "/dashboard",
      label: t("nav.overview"),
      description: t("nav.overview.desc"),
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/dashboard/restaurant",
      label: t("nav.restaurant"),
      description: t("nav.restaurant.desc"),
      icon: Store,
    },
    {
      href: "/dashboard/ai-agent",
      label: t("nav.aiAgent"),
      description: t("nav.aiAgent.desc"),
      icon: Bot,
    },
    ...(isOwner
      ? [
          {
            href: "/dashboard/ai-manager",
            label: "مدرب الذكاء",
            description: "درّب المساعد الذكي بتعليمات جديدة بالعربية",
            icon: Brain,
          },
          {
            href: "/dashboard/shifts",
            label: "الجدول",
            description: "جدول الموظفين ومن على الدوام الآن",
            icon: CalendarClock,
          },
        ]
      : []),
    {
      href: "/dashboard/knowledge-base",
      label: t("nav.knowledgeBase"),
      description: t("nav.knowledgeBase.desc"),
      icon: BookOpen,
    },
    {
      href: "/dashboard/menu",
      label: t("nav.menu"),
      description: t("nav.menu.desc"),
      icon: Package,
    },
    {
      href: "/dashboard/orders",
      label: "الطلبات والتصعيدات",
      description: "الحجوزات والحالات التي تحتاج متابعة",
      icon: ClipboardList,
    },
    {
      href: "/dashboard/conversations",
      label: t("nav.conversations"),
      description: t("nav.conversations.desc"),
      icon: MessageSquare,
    },
    {
      href: "/dashboard/marketing",
      label: t("nav.marketing"),
      description: t("nav.marketing.desc"),
      icon: Megaphone,
    },
    {
      href: "/dashboard/team",
      label: t("nav.team"),
      description: t("nav.team.desc"),
      icon: Users,
    },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }

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
        aria-label="Toggle navigation"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 w-72 border-e border-white/10 bg-[#0e1713] text-white shadow-[0_24px_80px_-40px_rgba(0,0,0,0.65)] transition-transform duration-300 lg:translate-x-0",
          isOpen
            ? "translate-x-0"
            : "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 p-6">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="mb-5 inline-flex rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200/85">
                {t("sidebar.liveOps")}
              </div>
              <div className="flex items-center gap-3">
                {restaurantLogo ? (
                  <img
                    src={restaurantLogo}
                    alt={restaurantName}
                    className="h-12 w-12 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-200">
                    <Store size={20} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-white">
                    {restaurantName}
                  </p>
                  <p className="mt-1 text-sm text-white/62">
                    {t("sidebar.serviceCenter")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-5">
            <ul className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "group relative flex items-start gap-3 rounded-3xl px-4 py-3 transition-all duration-200",
                        active
                          ? "bg-white text-slate-950 shadow-[0_20px_45px_-30px_rgba(255,255,255,0.7)]"
                          : "text-white/70 hover:bg-white/6 hover:text-white"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-colors",
                          active
                            ? "border-slate-200 bg-emerald-50 text-emerald-700"
                            : "border-white/10 bg-white/6 text-white/75 group-hover:border-white/20"
                        )}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{item.label}</p>
                          {"badge" in item && typeof item.badge === "number" && item.badge > 0 ? (
                            <span
                              className={cn(
                                "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
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
                            "mt-1 text-xs leading-5",
                            active ? "text-slate-500" : "text-white/45"
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
          </nav>

          <div className="border-t border-white/10 p-4">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 border border-white/10">
                  <AvatarImage src={undefined} />
                  <AvatarFallback className="bg-emerald-400/15 text-emerald-100">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {userName || "مستخدم"}
                  </p>
                  <p className="truncate text-xs text-white/58">
                    {userEmail || "user@example.com"}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {showLanguageSwitcher ? <LanguageSwitcher /> : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="w-full justify-start rounded-2xl border border-white/10 bg-white/6 px-4 text-white hover:bg-white/10"
                >
                  <LogOut size={16} />
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
