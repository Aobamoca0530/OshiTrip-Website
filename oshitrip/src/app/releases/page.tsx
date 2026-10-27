import { getCatalog } from "@/lib/catalog";
import { getStores } from "@/lib/store-catalog";
import { getReleases } from "@/lib/release-catalog";
import { ReleaseExplorer } from "@/components/releases";
export const dynamic = "force-dynamic";
export const metadata = { title: "Live 抽选与发售" };
export default async function Page() {
  const [result, stores, catalog] = await Promise.all([
    getReleases(),
    getStores(),
    getCatalog(),
  ]);
  return (
    <>
      <header className="page-heading">
        <span className="eyebrow">BEFORE THE LIVE</span>
        <h1>Live 抽选与发售</h1>
        <p>从附券商品到店铺特典，分清每一个需要留意的日期。</p>
      </header>
      <ReleaseExplorer
        franchises={catalog.franchises}
        {...result}
        stores={stores.stores}
        error={[result.error, stores.error].filter(Boolean).join("；")}
      />
    </>
  );
}
