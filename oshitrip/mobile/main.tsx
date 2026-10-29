import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { PersonalProvider } from "@/components/personal";
import { Header, Footer } from "@/components/shell";
import { Home } from "@/components/home";
import { EventExplorer } from "@/components/events";
import { EventDetail } from "@/components/event-detail";
import { FavoritesPage, TripPage } from "@/components/trip";
import { ReleaseExplorer, ReleaseDetail } from "@/components/releases";
import { LiveLotteries } from "@/components/live-lotteries";
import { AnnouncementList, AnnouncementImages } from "@/components/announcements";
import { SourceDashboard } from "@/components/source-dashboard";
import { OfficialNewsSources } from "@/components/official-news-sources";
import { AppUpdate } from "@/components/app-update";
import { useRoute } from "./navigation";
import { cachedBundle, initialBundle, refreshBundle, type MobileBundle } from "./data";
import type { Filters } from "@/lib/domain";
import "@/app/globals.css";
import "./mobile.css";

function MobilePage({ bundle }: { bundle: MobileBundle }) {
  const route = useRoute();
  const url = new URL(route, "https://localhost");
  const { catalog, releases, stores, announcements, monitoring } = bundle.data;
  const path = url.pathname;
  useEffect(() => { window.scrollTo(0, 0); }, [path]);
  if (path === "/") return <Home catalog={catalog} />;
  if (path === "/events") {
    const initial: Filters = {};
    for (const key of ["ip", "city", "category", "start", "end", "method", "status", "sort"] as const) initial[key] = url.searchParams.get(key) || undefined;
    initial.history = url.searchParams.get("history") === "true";
    initial.benefits = url.searchParams.get("benefits") === "true";
    return <><div className="page-heading"><h1>发现活动</h1><p>找到刚好与你的旅行相遇的联动。</p></div><OfficialNewsSources /><EventExplorer key={route} {...catalog} announcements={announcements} initial={initial} /></>;
  }
  if (path.startsWith("/events/")) {
    const event = catalog.events.find(e => e.slug === decodeURIComponent(path.slice(8)));
    if (event) return <EventDetail catalog={{ ...catalog, mode: "shared" }} event={event} news={announcements.filter(a => a.related_event_ids.includes(event.id))} products={{ releases }} query={{ venue: url.searchParams.get("venue") || undefined }} />;
  }
  if (path === "/trip") return <TripPage catalog={catalog} releases={releases} stores={stores} />;
  if (path === "/favorites") return <FavoritesPage catalog={catalog} />;
  if (path === "/news") return <><div className="page-heading"><h1>官方新消息与商品图</h1></div><OfficialNewsSources /><AnnouncementList items={announcements} /></>;
  if (path === "/releases") return <><div className="page-heading"><h1>Live 抽选与发售</h1></div><ReleaseExplorer mode="shared" releases={releases} stores={stores} franchises={catalog.franchises} /><LiveLotteries {...catalog} releases={releases} announcements={announcements} /></>;
  if (path.startsWith("/releases/")) {
    const product = releases.find(p => p.slug === decodeURIComponent(path.slice(10)));
    if (product) {
      const related = announcements.filter(a => a.images.length && product.lotteries.some(l => l.source_url === a.source_url));
      return <><ReleaseDetail product={product} stores={stores} />{!!related.length && <details className="panel"><summary>关联 Live 的官方演出与票务配图</summary><p>图中文字仍需单独核实。</p><AnnouncementImages items={related} /></details>}</>;
    }
  }
  if (path === "/admin/sources") return <SourceDashboard status={monitoring} items={announcements} now={new Date().toISOString()} />;
  if (path === "/about") return <section className="panel"><h1>关于 OshiTrip 手机版</h1><p>活动文字、筛选、收藏和旅行安排可离线使用；官方图片、地图和原文链接需要联网。活动资料来自维护者发布的公共快照，不代表实时预约名额。出发和预约前请查看官方公告。</p><p>收藏和旅行保存在当前设备中，Android App 与浏览器各自独立。清除应用数据或卸载可能导致丢失。</p><p>iPhone：在 Safari 打开此页面，轻点分享 → 添加到主屏幕。首次打开后等待“已可离线使用”。</p><p>软件更新在启动时检查；这不是应用关闭后的系统通知。</p><a className="text-link" href="https://github.com/Aobamoca0530/OshiTrip-Website/releases" target="_blank" rel="noopener noreferrer">安装包与版本说明 ↗</a></section>;
  return <section className="panel"><h1>未找到此页面</h1><a href="#/events">返回发现活动</a></section>;
}

function MobileApp() {
  const [bundle, setBundle] = useState(initialBundle);
  const current = useRef(initialBundle);
  const [status, setStatus] = useState("内置活动资料，可离线使用。");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState("");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  async function refresh(signal?: AbortSignal) {
    setBusy(true);
    try {
      const result = await refreshBundle(current.current, signal);
      if (signal?.aborted) return;
      current.current = result.bundle;
      setBundle(result.bundle);
      setStatus(result.saved ? "活动资料已检查，当前资料已保存，可离线使用。" : "活动资料已更新；设备存储不足，本次更新未能缓存。");
    } catch { if (!signal?.aborted) setStatus("联网更新未完成，继续使用本地活动资料。"); }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void cachedBundle().then(cache => {
      if (controller.signal.aborted) return;
      current.current = cache; setBundle(cache); void refresh(controller.signal);
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (Capacitor.isNativePlatform() || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let activating = false;
    const changed = () => { if (activating) location.reload(); };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    const onUpdate = () => { activating = true; };
    window.addEventListener("oshitrip-activate-update", onUpdate);
    void navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(reg => {
      if (disposed) return;
      const inspect = () => { if (!disposed) setWaiting(navigator.serviceWorker.controller ? reg.waiting : null); };
      inspect();
      reg.addEventListener("updatefound", () => reg.installing?.addEventListener("statechange", inspect));
      void navigator.serviceWorker.ready.then(() => { if (!disposed) setOffline("已可离线使用"); });
      void reg.update().catch(() => {});
    }).catch(() => { if (!disposed) setOffline("离线缓存未就绪，请联网使用并稍后重试"); });
    return () => { disposed = true; navigator.serviceWorker.removeEventListener("controllerchange", changed); window.removeEventListener("oshitrip-activate-update", onUpdate); };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = App.addListener("backButton", () => {
      if (location.hash && location.hash !== "#/") history.back(); else void App.exitApp();
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, []);
  return <PersonalProvider initialNow={new Date().toISOString()}><a className="skip-link" href="#main">跳到主要内容</a><Header /><main id="main" className="main-container">
    <AppUpdate web={!Capacitor.isNativePlatform()} />
    {waiting && <section className="data-sync-bar" aria-label="网页版本更新"><strong>新版页面已下载，准备好后即可更新。</strong><button className="button" onClick={() => { window.dispatchEvent(new Event("oshitrip-activate-update")); waiting.postMessage("ACTIVATE_UPDATE"); }}>立即更新页面</button></section>}
    {!Capacitor.isNativePlatform() && <p className="helper">iPhone：Safari → 分享 → 添加到主屏幕。{offline}</p>}
    <section className="data-sync-bar" aria-label="活动数据更新"><div><strong>活动资料 · {new Date(bundle.publishedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（北京时间）</strong><small role="status">{busy ? "正在检查活动资料更新…" : status}</small></div><button className="button secondary" disabled={busy} onClick={() => void refresh()}>刷新活动数据</button></section>
    <MobilePage bundle={bundle} /></main><Footer /></PersonalProvider>;
}

// In-page anchors must scroll without replacing the hash router's current page.
document.addEventListener("click", event => {
  const link = (event.target as Element).closest?.("a");
  const href = link?.getAttribute("href");
  if (href?.startsWith("#") && !href.startsWith("#/")) {
    event.preventDefault(); document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }
});
createRoot(document.getElementById("root")!).render(<MobileApp />);
