"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const trimmed = identifier.trim();
      if (trimmed.includes("@")) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmed,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        router.push("/dashboard");
      } else {
        const response = await fetch("/api/auth/member-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmed, password }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error || "اسم المستخدم أو كلمة المرور غير صحيحة");
          return;
        }
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[430px]">
      <header className="mb-8 flex items-center justify-between px-1">
        <Link href="/" className="flex items-center gap-3" aria-label="العودة إلى الصفحة الرئيسية">
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[var(--radius-md)] bg-[#20339a] shadow-[0_8px_20px_-10px_rgba(32,51,154,0.8)]">
            <Image src="/logo.png" alt="" width={40} height={40} className="h-full w-full object-contain" />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-[#172554]">نِحجز</span>
        </Link>
        <span className="text-xs font-semibold text-[#7480a3]">لوحة المتجر</span>
      </header>

      <section className="rounded-[var(--radius-lg)] border border-[#e2e6f0] bg-white px-6 py-7 shadow-[0_24px_70px_-42px_rgba(23,39,119,0.5)] sm:px-9 sm:py-9">
        <div className="mb-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#20339a]">تسجيل الدخول</p>
          <h1 className="text-[30px] font-extrabold tracking-[-0.04em] text-[#172554]">أهلاً بعودتك</h1>
          <p className="mt-2 text-[15px] leading-6 text-[#526083]">أدخل بياناتك للوصول إلى محادثات متجرك.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {error ? (
            <div role="alert" className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-6 text-red-700">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="identifier" className="text-[13px] font-bold text-[#25345f]">البريد الإلكتروني أو اسم المستخدم</label>
            <Input
              id="identifier"
              type="text"
              placeholder="أدخل البريد أو اسم المستخدم"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              disabled={loading}
              autoComplete="username"
              required
              className="h-12 border-[#d8deeb] bg-[#fbfcfe] text-[15px] placeholder:text-[#9aa5bf]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-[13px] font-bold text-[#25345f]">كلمة المرور</label>
              <span className="text-xs text-[#9aa5bf]">مطلوبة</span>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="أدخل كلمة المرور"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                autoComplete="current-password"
                required
                className="h-12 border-[#d8deeb] bg-[#fbfcfe] pe-12 text-[15px] placeholder:text-[#9aa5bf]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={loading}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                className="absolute inset-y-0 end-0 flex min-h-11 w-12 items-center justify-center text-[#7480a3] transition-colors hover:text-[#20339a] disabled:cursor-not-allowed"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" size="lg" disabled={loading} className="h-12 w-full text-[15px] shadow-[0_10px_22px_-12px_rgba(32,51,154,0.9)]">
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> جارٍ التحقق...</>
            ) : (
              <>تسجيل الدخول <ArrowLeft className="h-4 w-4" aria-hidden="true" /></>
            )}
          </Button>
          <p className="min-h-5 text-center text-xs text-[#7480a3]" role="status" aria-live="polite">
            {loading ? "يتم تجهيز مساحة العمل الخاصة بك" : "دخول آمن ومشفّر"}
          </p>
        </form>
      </section>

      <p className="mt-6 text-center text-sm text-[#526083]">
        ليس لديك حساب؟ <Link href="/signup" className="font-bold text-[#20339a] hover:underline">إنشاء حساب جديد</Link>
      </p>
    </main>
  );
}
