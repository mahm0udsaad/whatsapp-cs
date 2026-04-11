"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { LanguageSwitcher } from "./language-switcher";
import { getClientLocale, createTranslator } from "@/lib/i18n";

interface SidebarProps {
  restaurantName?: string;
  restaurantLogo?: string;
  userEmail?: string;
  userName?: string;
  onLogout?: () => void;
}

export function Sidebar({
  restaurantName = "Restaurant",
  restaurantLogo,
  userEmail,
  userName,
  onLogout,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const locale = getClientLocale();
  const t = createTranslator(locale);

  const navItems = [
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
      icon: UtensilsCrossed,
    },
    {
      href: "/dashboard/orders",
      label: "Orders",
      description: "Reservations & escalations",
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
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{item.label}</p>
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
                    {userName || "User"}
                  </p>
                  <p className="truncate text-xs text-white/58">
                    {userEmail || "user@example.com"}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <LanguageSwitcher />
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
