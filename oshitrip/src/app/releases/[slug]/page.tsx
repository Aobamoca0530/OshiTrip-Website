import { getStores } from "@/lib/store-catalog";
import { notFound } from "next/navigation";
import { getReleases } from "@/lib/release-catalog";
import { ReleaseDetail } from "@/components/releases";
import { getAnnouncements } from "@/lib/announcement-catalog";
import { AnnouncementImages } from "@/components/announcements";
export const dynamic = "force-dynamic";
export const metadata = { title: "抽选关联商品详情" };
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, result, stores, announcements] = await Promise.all([
    params,
    getReleases(),
    getStores(),
    getAnnouncements(),
  ]);
  if (result.error)
    return (
      <>
        <h1>商品资料暂时无法读取</h1>
        <p role="alert" className="notice error">
          {result.error}
        </p>
      </>
    );
  const p = result.releases.find((p) => p.slug === slug);
  if (!p) notFound();
  const related = announcements.filter(a => a.images.length && p.lotteries.some(l => l.source_url === a.source_url));
  return (
    <>
      <ReleaseDetail product={p} stores={stores.stores} />
      {related.length > 0 && <details className="panel" data-testid="lottery-images"><summary>关联 Live 的官方演出与票务配图</summary><p className="helper">这些是演出公告配图，不能代替商品封面或版本说明；图中文字仍需单独核实。</p><AnnouncementImages items={related}/></details>}
      {stores.error && (
        <p role="alert" className="notice error">
          {stores.error}
        </p>
      )}
    </>
  );
}
