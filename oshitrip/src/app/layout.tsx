import type { Metadata } from "next";
import { Header, Footer } from "@/components/shell";
import { PersonalProvider } from "@/components/personal";
import { DataSyncBar } from "@/components/data-sync";
import { sharedDataEnabled, sharedDataService } from "@/lib/shared-data";
import "./globals.css";
import { AppUpdate } from "@/components/app-update";
export const metadata: Metadata = {
  title: {
    default: "OshiTrip · 下一站，去见你的喜欢",
    template: "%s · OshiTrip",
  },
  description: "按 IP、城市和旅行日期，发现有官方来源的日本联动活动。",
};
export const dynamic = "force-dynamic";
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const syncStatus = sharedDataEnabled() ? await sharedDataService().status() : null;
  return (
    <html lang="zh-CN">
      <body>
        <PersonalProvider initialNow={new Date().toISOString()}>
          <a className="skip-link" href="#main">
            跳到主要内容
          </a>
          <Header />
          <main id="main" className="main-container">
            <AppUpdate />
            {syncStatus && <DataSyncBar initial={syncStatus} />}
            {children}
          </main>
          <Footer />
        </PersonalProvider>
      </body>
    </html>
  );
}
