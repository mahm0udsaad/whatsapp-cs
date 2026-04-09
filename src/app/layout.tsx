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
  title: "WhatsApp AI Customer Service Dashboard",
  description: "Manage your restaurant's WhatsApp AI customer service bot",
  icons: {
    icon: "/favicon.ico",
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
