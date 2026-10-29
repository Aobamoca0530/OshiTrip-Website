import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import { getReleases } from "@/lib/release-catalog";
import { getAnnouncements } from "@/lib/announcement-catalog";
import { SourceNote } from "@/components/events";
import { EventDetail } from "@/components/event-detail";
export default async function Page({params, searchParams}: {params: Promise<{slug:string}>; searchParams: Promise<{venue?:string}>}) {
  const [catalog, {slug}, query] = await Promise.all([getCatalog(), params, searchParams]);
  if (catalog.error) return <SourceNote mode={catalog.mode} error={catalog.error}/>;
  const event = catalog.events.find(e => e.slug === slug);
  if (!event) notFound();
  const news = (await getAnnouncements()).filter(a => a.related_event_ids.includes(event.id));
  const products = event.category === "音乐和声优活动" ? await getReleases() : null;
  return <EventDetail catalog={catalog} event={event} news={news} products={products} query={query}/>;
}
