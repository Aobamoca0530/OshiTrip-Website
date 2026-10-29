import { getCatalog } from "@/lib/catalog";
import { getStores } from "@/lib/store-catalog";
import { getReleases } from "@/lib/release-catalog";
import { ReleaseExplorer } from "@/components/releases";
import { LiveLotteries } from "@/components/live-lotteries";
import { getAnnouncements } from "@/lib/announcement-catalog";
export const dynamic = "force-dynamic";
export const metadata = { title: "Live 抽选与发售" };
export default async function Page() {
  const [result, stores, catalog, announcements] = await Promise.all([
    getReleases(),
    getStores(),
    getCatalog(),
    getAnnouncements(),
  ]);
  return (
    <>
      <header className="page-heading">
        <span className="eyebrow">BEFORE THE LIVE</span>
        <h1>Live 抽选与发售</h1>
        <p>从附券商品到店铺特典，分清每一个需要留意的日期。</p>
        <nav className="detail-tags"><a className="text-link" href="#live-applications">按 IP 查看全部 Live 报名 ↓</a><a className="text-link" href="#ticket-products">附券商品与发售 ↓</a></nav>
      </header>
      <div id="ticket-products">
      <ReleaseExplorer
        franchises={catalog.franchises}
        {...result}
        stores={stores.stores}
        error={[result.error, stores.error].filter(Boolean).join("；")}
      />
      </div>
      <LiveLotteries announcements={announcements} events={catalog.events} franchises={catalog.franchises} releases={result.releases} />
    </>
  );
}
