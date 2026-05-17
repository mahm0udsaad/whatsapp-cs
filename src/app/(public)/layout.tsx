import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const WHATSAPP_NUMBER = "966554866685";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "السلام عليكم، أرغب بتجربة نِحجز بوت لإدارة محادثات الواتساب."
)}`;

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" lang="ar" className="min-h-screen flex flex-col bg-white text-gray-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 md:px-6 md:py-4">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-full border border-slate-200/80 bg-white/80 px-3 py-2 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] transition-colors hover:border-[#011F91]/20"
          >
            <Image
              src="/logo.png"
              alt="نِحجز"
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-cover"
            />
            <div className="leading-tight">
              <span className="block text-base font-extrabold text-slate-950">نِحجز</span>
              <span className="block text-[11px] text-slate-500">WhatsApp AI Desk</span>
            </div>
          </Link>
          <nav className="hidden items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 p-1 text-sm text-slate-600 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] md:flex">
            <Link href="/#features" className="rounded-full px-4 py-2 transition-colors hover:bg-slate-100 hover:text-slate-950">المميزات</Link>
            <Link href="/#screens" className="rounded-full px-4 py-2 transition-colors hover:bg-slate-100 hover:text-slate-950">واجهة التطبيق</Link>
            <Link href="/#contact-sales" className="rounded-full px-4 py-2 transition-colors hover:bg-slate-100 hover:text-slate-950">للأعمال</Link>
            <Link href="/support" className="rounded-full px-4 py-2 transition-colors hover:bg-slate-100 hover:text-slate-950">الدعم</Link>
          </nav>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#011F91] px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(1,31,145,0.85)] transition-colors hover:bg-[#021770] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#011F91] focus-visible:ring-offset-2"
          >
            اطلب تجربة
          </a>
        </div>
        <div className="border-t border-slate-200/70 md:hidden">
          <nav className="mx-auto flex max-w-7xl overflow-x-auto gap-2 px-4 py-2 text-sm text-slate-600 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href="/#features" className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 transition-colors hover:bg-slate-50">المميزات</Link>
            <Link href="/#screens" className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 transition-colors hover:bg-slate-50">واجهة التطبيق</Link>
            <Link href="/#contact-sales" className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 transition-colors hover:bg-slate-50">للأعمال</Link>
            <Link href="/support" className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 transition-colors hover:bg-slate-50">الدعم</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-20 border-t border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f8fafc_35%,#eef2ff_100%)]">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-10 text-sm text-slate-600 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 font-bold text-slate-950">
              <Image
                src="/logo.png"
                alt="نِحجز"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg object-cover"
              />
              <span>نِحجز</span>
            </div>
            <p className="mt-3 leading-relaxed">
              مساعد ذكي للواتساب يرد على عملائك على مدار الساعة بلهجتك ومن قاعدة معرفتك.
            </p>
          </div>
          <div>
            <h4 className="mb-3 font-semibold text-slate-950">روابط</h4>
            <ul className="space-y-2">
              <li><Link href="/#features" className="transition-colors hover:text-slate-950">المميزات</Link></li>
              <li><Link href="/#contact-sales" className="transition-colors hover:text-slate-950">للأعمال</Link></li>
              <li><Link href="/support" className="transition-colors hover:text-slate-950">الدعم والأسئلة</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 font-semibold text-slate-950">قانوني</h4>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="transition-colors hover:text-slate-950">سياسة الخصوصية</Link></li>
              <li><Link href="/terms" className="transition-colors hover:text-slate-950">شروط الاستخدام</Link></li>
              <li><Link href="/delete-account" className="transition-colors hover:text-slate-950">حذف الحساب</Link></li>
              <li>
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-slate-950"
                >
                  واتساب: 6685 486 55 966+
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200">
          <div className="mx-auto max-w-7xl px-6 py-5 text-center text-xs text-slate-500">
            &copy; {new Date().getFullYear()} نِحجز. جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>
    </div>
  );
}
