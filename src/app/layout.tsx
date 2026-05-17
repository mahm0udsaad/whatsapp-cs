import type { Metadata } from "next";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import { getLocale, getDirection } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-noto-sans-arabic",
  subsets: ["arabic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://nehgzbot.com"
  ),
  title: {
    default: "نِحجز | مساعد ذكي للواتساب",
    template: "%s | نِحجز",
  },
  description: "منصة نِحجز لربط متجرك بواتساب الأعمال والرد على عملائك بالذكاء الاصطناعي على مدار الساعة.",
  keywords: ["واتساب للأعمال", "خدمة عملاء", "ذكاء اصطناعي", "بوت واتساب", "نحجز", "رد آلي"],
  openGraph: {
    type: "website",
    locale: "ar_SA",
    url: "/",
    siteName: "نِحجز",
    title: "نِحجز | مساعد ذكي للواتساب",
    description: "مساعد واتساب يبدو كأنه جزء من فريقك. يرد على عملائك تلقائياً بلهجتك ومن قاعدة معرفتك.",
    images: [
      {
        url: "/screenshots/02-ai-chat.png",
        width: 1200,
        height: 630,
        alt: "واجهة محادثات نِحجز",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "نِحجز | مساعد ذكي للواتساب",
    description: "مساعد واتساب يبدو كأنه جزء من فريقك.",
    images: ["/screenshots/02-ai-chat.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const dir = getDirection(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${inter.variable} ${notoSansArabic.variable}`}
    >
      <body className="min-h-full bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
