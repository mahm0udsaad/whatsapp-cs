"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
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
          href: "/dashboard/conversations",
          label: t("nav.conversations"),
          description: "المحادثات والطلبات والمتابعة",
          icon: MessageSquare,
          badge: unclaimedCount,
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
          description: "بيانات النشاط والمنتجات والأسعار",
          icon: Store,
        },
        {
          href: "/dashboard/ai-agent",
          label: t("nav.aiAgent"),
          description: "إعدادات المساعد الذكي",
          icon: Bot,
        },
      ],
    },
    {
      title: "التسويق",
      items: [
        {
          href: "/dashboard/customers",
          label: "العملاء",
          description: "البيانات وتصدير المحادثات",
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
      items: isOwner
        ? [
            {
              href: "/dashboard/shifts",
              label: "الجدول",
              description: "مواعيد الدوام والحضور",
              icon: CalendarClock,
            },
            {
              href: "/dashboard/team",
              label: t("nav.team"),
              description: "الأعضاء والصلاحيات",
              icon: Users,
            },
          ]
        : [],
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
        className="fixed start-4 top-4 z-50 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-[#20339a]/15 bg-white text-[#172777] shadow-sm transition-colors hover:bg-[#edf0ff] lg:hidden"
        aria-label={isOpen ? "إغلاق التنقل" : "فتح التنقل"}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 w-60 border-e border-white/10 bg-[#20339a] text-white shadow-[0_24px_80px_-40px_rgba(17,29,87,0.65)] transition-transform duration-300 lg:translate-x-0",
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[#ffc400] text-[#172777]">
                  <Store size={16} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {restaurantName}
                </p>
                <div className="mt-0.5 inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ffc400]" />
                  <span className="text-[10px] text-white/70">
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
                              "group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors duration-200",
                              active
                                ? "bg-[#ffc400] text-[#172777]"
                                : "text-white/75 hover:bg-white/10 hover:text-white"
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-colors",
                                active
                                  ? "border-[#172777]/10 bg-[#172777]/8 text-[#172777]"
                                  : "border-white/10 bg-white/5 text-white/80 group-hover:border-white/20"
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
                                  active ? "text-[#172777]/70" : "text-white/45 group-hover:text-white/65"
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
                  <AvatarFallback className="bg-[#ffc400] text-sm font-bold text-[#172777]">
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
