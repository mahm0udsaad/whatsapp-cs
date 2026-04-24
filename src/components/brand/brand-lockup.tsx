import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLockupProps {
  className?: string;
  imageClassName?: string;
  subtitle?: string;
}

export function BrandLockup({
  className,
  imageClassName,
  subtitle,
}: BrandLockupProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div className={cn("overflow-hidden rounded-lg border border-white/30 bg-[#1f3596] shadow-[0_24px_60px_-32px_rgba(23,37,84,0.75)]", imageClassName)}>
        <Image
          src="/logo.png"
          alt="جهز بوت"
          width={220}
          height={220}
          priority
          className="h-auto w-full object-contain"
        />
      </div>
      {subtitle ? (
        <p className="mt-4 text-sm leading-6 text-slate-600">{subtitle}</p>
      ) : null}
    </div>
  );
}
