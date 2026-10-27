import { getCatalog } from "@/lib/catalog";
import { FavoritesPage } from "@/components/trip";
import { SourceNote } from "@/components/events";
export const metadata = { title: "收藏与关注" };
export default async function Page() {
  const c = await getCatalog();
  return (
    <>
      <FavoritesPage catalog={c} />
      <SourceNote mode={c.mode} error={c.error} />
    </>
  );
}
