import Link from "next/link";
import type { ReactNode } from "react";

const WHATSAPP_NUMBER = "966554866685";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "السلام عليكم، أرغب بتجربة نِهجز بوت لإدارة محادثات الواتساب."
)}`;

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" lang="ar" className="min-h-screen flex flex-col bg-white text-gray-900 font-[system-ui,-apple-system,Segoe_UI,Tahoma,Arial]">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="inline-block h-8 w-8 rounded-lg bg-emerald-500 text-white grid place-items-center text-base">
              ن
            </span>
            <span className="text-lg">نِهجز</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
            <Link href="/#features" className="hover:text-gray-900">المميزات</Link>
            <Link href="/#screens" className="hover:text-gray-900">واجهة التطبيق</Link>
            <Link href="/#contact-sales" className="hover:text-gray-900">للأعمال</Link>
            <Link href="/support" className="hover:text-gray-900">الدعم</Link>
          </nav>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white text-sm font-semibold hover:bg-emerald-700 shadow-sm"
          >
            اطلب تجربة
          </a>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-gray-100 mt-20 bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-10 grid gap-6 sm:grid-cols-2 md:grid-cols-3 text-sm text-gray-600">
          <div>
            <div className="flex items-center gap-2 font-bold text-gray-900">
              <span className="inline-block h-7 w-7 rounded-lg bg-emerald-500 text-white grid place-items-center text-sm">ن</span>
              <span>نِهجز</span>
            </div>
            <p className="mt-3 leading-relaxed">
              مساعد ذكي للواتساب يرد على عملائك على مدار الساعة بلهجتك ومن قاعدة معرفتك.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">روابط</h4>
            <ul className="space-y-2">
              <li><Link href="/#features" className="hover:text-gray-900">المميزات</Link></li>
              <li><Link href="/#contact-sales" className="hover:text-gray-900">للأعمال</Link></li>
              <li><Link href="/support" className="hover:text-gray-900">الدعم والأسئلة</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">قانوني</h4>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="hover:text-gray-900">سياسة الخصوصية</Link></li>
              <li><Link href="/terms" className="hover:text-gray-900">شروط الاستخدام</Link></li>
              <li><Link href="/delete-account" className="hover:text-gray-900">حذف الحساب</Link></li>
              <li>
                <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="hover:text-gray-900">
                  واتساب: 6685 486 55 966+
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200">
          <div className="mx-auto max-w-6xl px-6 py-5 text-xs text-gray-500 text-center">
            &copy; {new Date().getFullYear()} نِهجز. جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>
    </div>
  );
}
