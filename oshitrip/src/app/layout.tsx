import type { Metadata } from "next";
import { Header, Footer } from "@/components/shell";
import { PersonalProvider } from "@/components/personal";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "OshiTrip · 下一站，去见你的喜欢",
    template: "%s · OshiTrip",
  },
  description: "按 IP、城市和旅行日期，发现有官方来源的日本联动活动。",
};
export const dynamic = "force-dynamic";
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <PersonalProvider initialNow={new Date().toISOString()}>
          <a className="skip-link" href="#main">
            跳到主要内容
          </a>
          <Header />
          <main id="main" className="main-container">
            {children}
          </main>
          <Footer />
        </PersonalProvider>
      </body>
    </html>
  );
}
