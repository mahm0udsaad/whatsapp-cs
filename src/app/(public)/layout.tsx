import Link from "next/link";
import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900">
      <header className="border-b border-gray-100">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/about" className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-7 w-7 rounded-lg bg-emerald-500 text-white grid place-items-center text-sm">
              N
            </span>
            <span>Nehgz</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-gray-600">
            <Link href="/about" className="hover:text-gray-900">About</Link>
            <Link href="/support" className="hover:text-gray-900">Support</Link>
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-900">Terms</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-gray-100 mt-16">
        <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Nehgz. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-gray-800">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-800">Terms</Link>
            <Link href="/support" className="hover:text-gray-800">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
