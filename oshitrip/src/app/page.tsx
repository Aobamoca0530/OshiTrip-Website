import { getCatalog } from "@/lib/catalog";
import { Home } from "@/components/home";
import { SourceNote } from "@/components/events";
export default async function Page() {
  const catalog = await getCatalog();
  return (
    <>
      <Home catalog={catalog} />
      <SourceNote mode={catalog.mode} error={catalog.error} />
    </>
  );
}
