"use client";
import { OfficialImage } from "./official-image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Coffee,
  Heart,
  MapPin,
  Plus,
  SlidersHorizontal,
  Ticket,
} from "lucide-react";
import {
  categories,
  cities,
  methods,
  type Franchise,
  type OshiEvent,
} from "@/lib/schema";
import {
  filterEvents,
  statusLabels,
  venueStatus,
  reservationWindow,
  roundStatus,
  venueBenefits,
  groupMatches,
  type EventCollection,
  type Filters,
  type Match,
} from "@/lib/domain";
import { usePersonal } from "./personal";

export function SourceNote({ mode, error }: { mode: string; error?: string }) {
  return (
    <div className={`source-note ${error ? "error" : ""}`}>
      <span className="status-dot" />
      {error ||
        (mode === "local"
          ? "本地已核实资料 · 人工维护，非实时同步"
          : mode === "shared" ? "统一活动资料 · 自动检查发布更新，非实时空位"
          : "Supabase 数据库 · 人工审核发布，非实时空位")}
      <Link href="/about">
        数据说明 <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}
export function IPChoices({ franchises }: { franchises: Franchise[] }) {
  const { data, toggleIP } = usePersonal();
  return (
    <div className="ip-choices">
      {franchises.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`chip ${data.ips.includes(f.id) ? "selected" : ""} ${f.parent_id ? "sub-ip" : ""}`}
          onClick={() => toggleIP(f.id)}
          aria-pressed={data.ips.includes(f.id)}
        >
          {data.ips.includes(f.id) ? <Check size={14} /> : <Plus size={14} />}{" "}
          {f.name}
        </button>
      ))}
    </div>
  );
}
export function SaveEvent({ eventId }: { eventId: string }) {
  const { data, toggleFavorite } = usePersonal();
  const active = data.favorites.includes(eventId);
  return (
    <button
      className={`icon-button ${active ? "saved" : ""}`}
      aria-label={active ? "取消收藏活动" : "收藏活动"}
      aria-pressed={active}
      onClick={() => toggleFavorite(eventId)}
    >
      <Heart size={19} fill={active ? "currentColor" : "none"} />
    </button>
  );
}
export function AddVenue({ venueId }: { venueId: string }) {
  const { data, toggleVenue } = usePersonal();
  const active = data.trip.venue_ids.includes(venueId);
  return (
    <button
      type="button"
      className={`button small ${active ? "soft" : "secondary"}`}
      onClick={() => toggleVenue(venueId)}
      aria-pressed={active}
    >
      {active ? <Check size={15} /> : <Plus size={15} />}{" "}
      {active ? "已加入旅行备选" : "加入旅行备选"}
    </button>
  );
}
export function EventCard({ match, visit }: { match: Match; visit?: string }) {
  const { now } = usePersonal();
  const { event, venue } = match;
  const status = venueStatus(event, venue, now, visit);
  const benefits = venueBenefits(event, venue, visit, visit);
  return (
    <article className="event-card" data-testid="event-card">
      {event.image ? (
        <div className="event-image">
          <OfficialImage asset={event.image} compact />
          <span className="badge">
            {event.category} · {venue.city}
          </span>
        </div>
      ) : (
        <div className="card-art">
          <span className="art-category">
            {event.category === "音乐和声优活动" ? (
              <Ticket size={14} />
            ) : (
              <Coffee size={14} />
            )}
            {event.category}
          </span>
          <span className="art-micro">OFFICIAL COLLABORATION</span>
          <div className="art-title">
            {event.title_ja.split(" × ")[0]}
            {event.title_ja.includes(" × ") && (
              <>
                <span>×</span>
                {event.title_ja.split(" × ")[1]}
              </>
            )}
          </div>
          <div className="art-bottom">
            <span>{venue.city}</span>
            <span>旅の、寄り道。</span>
          </div>
          <span className="art-orbit" />
        </div>
      )}
      <div className="card-body">
        <div className="card-top">
          <span className="eyebrow">{event.category}</span>
          <SaveEvent eventId={event.id} />
        </div>
        <Link
          className="card-title"
          href={`/events/${event.slug}?venue=${venue.id}`}
        >
          {event.title_zh}
        </Link>
        <p className="venue-name">
          <MapPin size={15} />
          {venue.city} · {venue.name}
        </p>
        <p className="card-date">
          <CalendarDays size={15} />
          {venue.start_date.replaceAll("-", ".")} —{" "}
          {venue.end_date.slice(5).replace("-", ".")}
        </p>
        {benefits.length > 0 && (
          <p className="card-benefit">
            <span className="badge green">特典 / 满赠</span> {benefits[0].title}
          </p>
        )}
        <div className="card-bottom">
          <span className={`badge ${status === "open" ? "green" : ""}`}>
            {status === "unknown" &&
            venue.rounds.some((r) => r.kind === "rolling") &&
            !visit
              ? "按到店日期预约"
              : statusLabels[status]}
          </span>
          <Link
            aria-label={`查看${venue.name}详情`}
            href={`/events/${event.slug}?venue=${venue.id}`}
          >
            查看详情 <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function Empty({
  children = "试试调整城市、日期或 IP，也可以查看历史活动。",
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <CompassMark />
      <h3>暂时没有匹配活动</h3>
      <p>{children}</p>
    </div>
  );
}
export function EventCollectionCard({
  group,
  start,
  end,
}: {
  group: EventCollection;
  start?: string;
  end?: string;
}) {
  const { event, venues } = group;
  const { now } = usePersonal();
  const dates = venues.flatMap((v) => [v.start_date, v.end_date]).sort();
  const gifts = venues.some(
    (v) => venueBenefits(event, v, start, end).length > 0,
  );
  return (
    <article
      className="event-card collection-card"
      data-testid="event-card"
      data-event-id={event.id}
    >
      {event.image ? (
        <div className="event-image">
          <OfficialImage asset={event.image} compact />
          <span className="badge">{event.category} · 活动合集</span>
        </div>
      ) : (
        <div className="collection-placeholder">
          <span className="eyebrow">{event.category}</span>
          <span>{event.title_zh}</span>
        </div>
      )}
      <div className="card-body">
        <div className="card-top">
          <span className="eyebrow">{venues.length} 个匹配门店 / 场次</span>
          <SaveEvent eventId={event.id} />
        </div>
        <Link className="card-title" href={`/events/${event.slug}`}>
          {event.title_zh}
        </Link>
        <p className="venue-name">
          <MapPin size={15} />
          {[...new Set(venues.map((v) => v.city))].join(" · ")}
        </p>
        <p className="card-date">
          <CalendarDays size={15} />
          {dates[0]} — {dates.at(-1)}
        </p>
        <p className="helper">各地档期不同，展开查看具体日期。</p>
        {gifts && (
          <p className="card-benefit">
            <span className="badge green">特典 / 满赠</span>{" "}
            合集中查看适用条件与图片
          </p>
        )}
        <Link
          className="text-link"
          href={`/events/${event.slug}${event.translated_rules?.length ? "#rules" : ""}`}
        >
          查看合集{event.translated_rules?.length ? "与中文规则" : "详情"}{" "}
          <ArrowRight size={14} />
        </Link>
        <details
          className="collection-venues"
          open={venues.length === 1}
          key={venues.map((v) => v.id).join(",")}
        >
          <summary>查看 {venues.length} 个匹配门店 / 场次</summary>
          {venues.map((v) => {
            const visit = start || end;
            const date = visit
              ? visit > v.start_date
                ? visit
                : v.start_date
              : undefined;
            const status = venueStatus(event, v, now, date);
            return (
              <div
                className="collection-venue"
                key={v.id}
                data-testid="collection-venue"
              >
                <Link
                  href={`/events/${event.slug}?venue=${v.id}`}
                  aria-label={`查看${v.name}详情`}
                >
                  {v.city} · {v.name} ↗
                </Link>
                <span>
                  {v.start_date} — {v.end_date}
                </span>
                <span className="helper">{statusLabels[status]}</span>
              </div>
            );
          })}
        </details>
        {venues.length < event.venues.length && (
          <p className="helper">
            合集共 {event.venues.length} 个场次；这里只显示符合筛选的地点。
          </p>
        )}
      </div>
    </article>
  );
}
function CompassMark() {
  return <MapPin size={30} strokeWidth={1.4} />;
}
export function EventExplorer({
  events,
  franchises,
  initial = {},
}: {
  events: OshiEvent[];
  franchises: Franchise[];
  initial?: Filters;
}) {
  const [filters, setFilters] = useState<Filters>(initial);
  const { now } = usePersonal();
  const update = (key: keyof Filters, value: string | boolean) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const invalid = Boolean(
    filters.start && filters.end && filters.start > filters.end,
  );
  const matches = invalid ? [] : filterEvents(events, franchises, filters, now);
  const collections = groupMatches(matches);
  return (
    <>
      <div className="explorer-layout">
        <aside className="filter-panel">
          <h2>
            <SlidersHorizontal size={18} />
            筛选活动
          </h2>
          <label>
            IP / 子系列
            <select
              value={filters.ip || ""}
              onChange={(e) => update("ip", e.target.value)}
            >
              <option value="">全部 IP</option>
              {franchises.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.parent_id ? "↳ " : ""}
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            旅行城市
            <select
              value={filters.city || ""}
              onChange={(e) => update("city", e.target.value)}
            >
              <option value="">所有城市</option>
              {[
                ...new Set([
                  ...cities,
                  ...events.flatMap((e) => e.venues.map((v) => v.city)),
                ]),
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            活动分类
            <select
              value={filters.category || ""}
              onChange={(e) => update("category", e.target.value)}
            >
              <option value="">全部分类</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            旅行开始日期
            <input
              type="date"
              value={filters.start || ""}
              onChange={(e) => update("start", e.target.value)}
            />
          </label>
          <label>
            旅行结束日期
            <input
              type="date"
              value={filters.end || ""}
              onChange={(e) => update("end", e.target.value)}
            />
          </label>
          <label>
            参加方式
            <select
              value={filters.method || ""}
              onChange={(e) => update("method", e.target.value)}
            >
              <option value="">全部参加方式</option>
              {methods.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            报名状态
            <select
              value={filters.status || ""}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">全部状态</option>
              {Object.entries(statusLabels).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <p className="helper">
            滚动预约按筛选范围内最早可到店日计算。未选日期时状态无法确认。
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={!!filters.benefits}
              onChange={(e) => update("benefits", e.target.checked)}
            />
            只看有门店特典 / 满赠
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={!!filters.history}
              onChange={(e) => update("history", e.target.checked)}
            />
            包含历史活动
          </label>
          <button className="text-button" onClick={() => setFilters({})}>
            清除筛选
          </button>
        </aside>
        <section className="results">
          <div className="results-bar">
            <p>
              <strong>{collections.length}</strong> 个活动合集{" "}
              <span>· {matches.length} 个匹配门店 / 场次</span>
            </p>
            <label className="sort-label">
              <span className="sr-only">排序</span>
              <select
                value={filters.sort || "start"}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="start">按活动开始时间</option>
                <option value="deadline">按报名截止时间</option>
              </select>
            </label>
          </div>
          {invalid && (
            <p role="alert" className="notice error">
              结束日期不能早于开始日期。
            </p>
          )}
          {filters.sort === "deadline" && (
            <p className="helper">
              滚动预约需要旅行日期才能计算截止时间；未知截止时间排在后面。
            </p>
          )}
          <div className="cards-grid">
            {collections.map((group) => (
              <EventCollectionCard
                key={group.event.id}
                group={group}
                start={filters.start}
                end={filters.end}
              />
            ))}
          </div>
          {!matches.length && <Empty />}
        </section>
      </div>
    </>
  );
}
export function BookingPanel({
  event,
  selectedId,
}: {
  event: OshiEvent;
  selectedId?: string;
}) {
  const [venueId, setVenueId] = useState(
    selectedId && event.venues.some((v) => v.id === selectedId)
      ? selectedId
      : event.venues[0].id,
  );
  const [visit, setVisit] = useState("");
  const { now } = usePersonal();
  const venue = event.venues.find((v) => v.id === venueId)!;
  const valid =
    !visit || (visit >= venue.start_date && visit <= venue.end_date);
  const format = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Tokyo",
          dateStyle: "medium",
          timeStyle: "short",
          hour12: false,
        }).format(new Date(v))
      : "尚未核实";
  return (
    <section className="panel booking-panel">
      <span className="eyebrow">PLAN YOUR VISIT</span>
      <h2>这次，哪一天去？</h2>
      <label>
        参加门店
        <select
          value={venueId}
          onChange={(e) => {
            setVenueId(e.target.value);
            setVisit("");
          }}
        >
          {event.venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.city} · {v.name}
            </option>
          ))}
        </select>
      </label>
      <p className="helper">
        举办日期：{venue.start_date} — {venue.end_date}
      </p>
      <label>
        计划到店日期
        <input
          type="date"
          min={venue.start_date}
          max={venue.end_date}
          value={visit}
          onChange={(e) => setVisit(e.target.value)}
        />
      </label>
      {!valid && (
        <p className="notice error" role="alert">
          此日期不在该门店的活动期间内。
        </p>
      )}
      {event.status === "cancelled" && (
        <p className="notice error">活动已取消，请查看官方说明。</p>
      )}
      {venue.rounds.length === 0 && <p>预约规则尚未核实</p>}
      {venue.rounds.map((r) => {
        const w = reservationWindow(r, valid && visit ? visit : undefined);
        const status =
          event.status === "cancelled"
            ? "cancelled"
            : valid
              ? roundStatus(r, now, visit || undefined)
              : "unknown";
        return (
          <div className="booking-rule" key={r.id}>
            <h3>{r.label}</h3>
            <span className="badge green">{statusLabels[status]}</span>
            <p>{r.note}</p>
            {r.kind === "rolling" && !visit && (
              <p className="helper">先选择到店日期，再查看对应预约窗口。</p>
            )}
            {(r.kind !== "rolling" || (visit && valid)) &&
              r.kind !== "none" && (
                <dl>
                  <dt>开放</dt>
                  <dd>
                    {w.opens
                      ? format(w.opens)
                      : w.openDate
                        ? `${w.openDate}（具体时刻尚未核实）`
                        : "尚未核实"}
                  </dd>
                  <dt>截止</dt>
                  <dd>{format(w.closes)} JST</dd>
                </dl>
              )}
            {status === "open" && (
              <p className="notice">
                处于预约开放时间范围内，剩余名额请到官网确认。
              </p>
            )}
            {status === "closed" && (
              <p className="helper">
                仅表示此轮已截止，后续是否追加请关注官方。
              </p>
            )}
            {r.url && (
              <a
                className="button primary full"
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {r.method === "官方 App 预约"
                  ? "前往官方 App 说明"
                  : ["none", "unknown", "unannounced"].includes(r.kind)
                    ? "查看官方参加说明"
                    : "前往官方报名入口"}
                <ArrowUpRight size={17} />
              </a>
            )}
          </div>
        );
      })}
      <AddVenue venueId={venue.id} />
      <p className="helper">
        加入备选不代表完成预约。日期和具体时刻均为 Asia/Tokyo。
      </p>
    </section>
  );
}
