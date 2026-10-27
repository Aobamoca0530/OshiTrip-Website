"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Heart, Map, ArrowUpRight, Ticket } from "lucide-react";
export function Header() {
  const path = usePathname();
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="OshiTrip 首页">
          <span className="brand-icon">
            <Compass size={24} />
          </span>
          OshiTrip<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="主导航">
          {[
            ["/events", "发现活动", Compass],
            ["/releases", "抽选与发售", Ticket],
            ["/trip", "我的旅行", Map],
            ["/favorites", "收藏与关注", Heart],
          ].map(([href, label, Icon]) => {
            const I = Icon as typeof Compass;
            return (
              <Link
                key={String(href)}
                className={path.startsWith(String(href)) ? "active" : ""}
                href={String(href)}
              >
                <I size={17} />
                <span>{String(label)}</span>
              </Link>
            );
          })}
        </nav>
        <Link className="header-about" href="/about">
          关于 OshiTrip <ArrowUpRight size={15} />
        </Link>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <Link className="brand" href="/">
          OshiTrip.
        </Link>
        <p>为了喜欢的事物，去一趟日本。</p>
      </div>
      <div>
        <Link href="/about">数据来源与说明</Link>
        <Link href="/admin">活动管理</Link>
        <span>个人非商业项目 · 所有时间为日本时间</span>
      </div>
    </footer>
  );
}
