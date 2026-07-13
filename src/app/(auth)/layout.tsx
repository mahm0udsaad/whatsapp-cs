import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f8fc] p-5 sm:p-8">
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#ffc400]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-40 h-[28rem] w-[28rem] rounded-full bg-[#20339a]/10 blur-3xl" />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
