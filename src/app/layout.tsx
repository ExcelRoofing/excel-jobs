import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/components/I18nProvider";
import { PwaRegister } from "@/components/Pwa";
import { getI18n } from "@/lib/i18n";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Excel Jobs",
  description: "Jobs, photos, and customer links for Excel Roofing & Solar.",
  applicationName: "Excel Jobs",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Excel Jobs", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#121a24",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dict } = await getI18n();
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} dict={dict}>
          {children}
          <PwaRegister />
        </I18nProvider>
      </body>
    </html>
  );
}
