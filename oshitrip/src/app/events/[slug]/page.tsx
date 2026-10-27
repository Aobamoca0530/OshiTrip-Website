import { OfficialImage } from "@/components/official-image";
import { EventBenefits } from "@/components/event-benefits";
import { AnnouncementImages } from "@/components/announcements";
import { getAnnouncements } from "@/lib/announcement-catalog";
import { EventRules } from "@/components/event-rules";
import { tokyoDate } from "@/lib/domain";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, MapPin } from "lucide-react";
import { getCatalog } from "@/lib/catalog";
import { getReleases } from "@/lib/release-catalog";
import {
  AddVenue,
  BookingPanel,
  SaveEvent,
  SourceNote,
} from "@/components/events";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ venue?: string }>;
}) {
  const [catalog, { slug }, query] = await Promise.all([
    getCatalog(),
    params,
    searchParams,
  ]);
  if (catalog.error)
    return <SourceNote mode={catalog.mode} error={catalog.error} />;
  const event = catalog.events.find((e) => e.slug === slug);
  if (!event) notFound();
  const news = (await getAnnouncements()).filter(item => item.related_event_ids.includes(event.id));
  const products =
    event.category === "音乐和声优活动" ? await getReleases() : null;
  const linkedProducts =
    products?.releases.filter((p) =>
      p.lotteries.some((l) => l.event_slug === event.slug),
    ) || [];
  return (
    <>
      <Link className="back-link" href="/events">
        <ArrowLeft size={16} />
        返回活动列表
      </Link>
      <SourceNote mode={catalog.mode} />
      <div className="detail-heading">
        <span className="badge green">{event.category}</span>
        <h1>{event.title_zh}</h1>
        <p lang="ja">{event.title_ja}</p>
        <p className="helper">
          活动合集 · {event.venues.length} 个门店 / 场次，各地日期与预约分别列出
        </p>
        <nav className="collection-jumps" aria-label="合集内容">
          {!!event.translated_rules?.length && <a href="#rules">中文规则</a>}
          <a href="#venues">门店与日期</a>
          {news.some(item => item.images.length) && <a href="#official-goods">官方商品与活动图片</a>}
          {!!(event.benefits?.length || event.gallery?.length) && (
            <a href="#benefits">商品图与特典</a>
          )}
        </nav>
        <div className="detail-tags">
          {catalog.franchises
            .filter((f) => event.franchise_ids.includes(f.id))
            .map((f) => (
              <span className="chip" key={f.id}>
                {f.name}
              </span>
            ))}
          <SaveEvent eventId={event.id} />
        </div>
        {event.status === "cancelled" && (
          <p className="notice error">活动已取消，请查看官方公告。</p>
        )}
      </div>
      <div className="detail-layout">
        <div>
          <section className="panel">
            {event.image && <OfficialImage asset={event.image} />}
            <h2>活动与参加条件</h2>
            <p>{event.summary}</p>
            {linkedProducts.map((p) => (
              <p key={p.id}>
                <Link className="text-link" href={`/releases/${p.slug}`}>
                  附券商品、店铺预约与特典：{p.title} →
                </Link>
              </p>
            ))}
            {products?.error && (
              <p className="notice error">
                附券商品资料暂时读取失败，请直接查看官方公告。
              </p>
            )}
            <h3>费用说明</h3>
            <p>{event.fees || "尚未核实"}</p>
            <h3>出发前，请留意</h3>
            <ul className="conditions">
              {event.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
          <EventRules event={event} />
          {news.some(item => item.images.length) && <section className="panel section-space" id="official-goods">
            <h2>官方商品与活动图片</h2>
            <p className="helper">从本活动关联的官方公告自动收集，包含售卖商品、特典和菜单。分类尚未人工核实；图片不代表商品仍有库存。</p>
            <AnnouncementImages items={news} />
          </section>}
          <section className="panel section-space" id="venues">
            <h2>
              举办门店 / 场次{" "}
              <span className="count">{event.venues.length}</span>
            </h2>
            <div className="venue-list">
              {event.venues.map((v) => (
                <article className="venue-row" key={v.id} id={v.id}>
                  <div>
                    <span className="eyebrow">
                      <MapPin size={14} />
                      {v.city}
                    </span>
                    <h3 lang="ja">{v.name}</h3>
                    <p>
                      {v.start_date} — {v.end_date}
                    </p>
                    <p className="helper">
                      地址：{v.address || "尚未核实，请查阅官方门店页面"}
                    </p>
                    {v.official_url && (
                      <p>
                        <a
                          className="text-link"
                          href={v.official_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          门店官网 / 售罄公告 ↗
                        </a>
                        <span className="helper"> · 实时库存未知</span>
                      </p>
                    )}
                    {v.address && (
                      <a
                        className="text-link"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Google Maps 导航 <ArrowUpRight size={14} />
                      </a>
                    )}
                  </div>
                  <AddVenue venueId={v.id} />
                </article>
              ))}
            </div>
          </section>
          <EventBenefits event={event} />
          <section className="panel section-space">
            <h2>官方来源与核实记录</h2>
            {event.sources.map((s) => (
              <div className="source-row" key={s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label}
                  <ArrowUpRight size={15} />
                </a>
                <p className="helper">
                  {s.checked_at
                    ? `最后核实：${tokyoDate(new Date(s.checked_at))}`
                    : "尚未核实"}
                </p>
              </div>
            ))}
            <p className="helper">
              资料更新：{tokyoDate(new Date(event.updated_at))} · 核实日期：
              {event.verified_at
                ? tokyoDate(new Date(event.verified_at))
                : "尚未核实"}
              <br />
              资料可能变更，最终以官方公告为准。没有查询实时空位或抽选结果。
            </p>
          </section>
        </div>
        <BookingPanel event={event} selectedId={query.venue} />
      </div>
    </>
  );
}
