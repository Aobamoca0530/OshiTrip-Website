import { getReleases } from "@/lib/release-catalog";
import { getStores } from "@/lib/store-catalog";
import { getCatalog } from "@/lib/catalog";
import { TripPage } from "@/components/trip";
import { SourceNote } from "@/components/events";
export const metadata = { title: "我的旅行" };
export default async function Page() {
  const [c, r, s] = await Promise.all([
    getCatalog(),
    getReleases(),
    getStores(),
  ]);
  return (
    <>
      <TripPage
        catalog={c}
        releases={r.releases}
        stores={s.stores}
        shoppingError={[r.error, s.error].filter(Boolean).join("；")}
      />
      <SourceNote mode={c.mode} error={c.error} />
    </>
  );
}
