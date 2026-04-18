import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLockupProps {
  className?: string;
  imageClassName?: string;
  titleClassName?: string;
  subtitle?: string;
}

export function BrandLockup({
  className,
  imageClassName,
  titleClassName,
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
      <div className="mt-4 space-y-1">
        <h1 className={cn("text-2xl font-semibold text-[#172554]", titleClassName)}>
          جهز بوت
        </h1>
        {subtitle ? (
          <p className="text-sm leading-6 text-slate-600">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
