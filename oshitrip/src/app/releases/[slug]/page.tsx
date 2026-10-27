import { getStores } from "@/lib/store-catalog";
import { notFound } from "next/navigation";
import { getReleases } from "@/lib/release-catalog";
import { ReleaseDetail } from "@/components/releases";
export const dynamic = "force-dynamic";
export const metadata = { title: "抽选关联商品详情" };
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, result, stores] = await Promise.all([
    params,
    getReleases(),
    getStores(),
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
  return (
    <>
      <ReleaseDetail product={p} stores={stores.stores} />
      {stores.error && (
        <p role="alert" className="notice error">
          {stores.error}
        </p>
      )}
    </>
  );
}
