"use client";
import { OfficialImage } from "./official-image";
import Link from "next/link";
import { useState } from "react";
import type { Trip } from "@/lib/schema";
import { tripSchema } from "@/lib/schema";
import { japanTimestamp, type Release } from "@/lib/releases";
import { mapUrl, storeOptions, tripProducts, type Store } from "@/lib/shopping";

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="text-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children} ↗
    </a>
  );
}
export function StoreFinder({
  product,
  stores,
  trip,
}: {
  product: Release;
  stores: Store[];
  trip?: Trip;
}) {
  const [edition, setEdition] = useState(product.editions[0].id);
  const [city, setCity] = useState("");
  const selected = product.editions.find((e) => e.id === edition)!;
  const options = storeOptions(product, stores, edition, trip).filter(
    (o) => !city || o.store.city === city,
  );
  return (
    <div className="store-finder">
      <div className="form-row">
        <label>
          到店查询版本
          <select value={edition} onChange={(e) => setEdition(e.target.value)}>
            {product.editions.map((e) => (
              <option value={e.id} key={e.id}>
                {e.label} · {e.sku}
              </option>
            ))}
          </select>
        </label>
        {!trip && (
          <label>
            门店城市
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">全部城市</option>
              {Array.from(new Set(stores.map((s) => s.city))).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="notice">
        门店库存：待查询。以下是已核实地址的品牌分店，尚未确认该分店经营本商品、附券批次及特典剩余。网店有货不代表分店有货。
      </p>
      <p className="helper">
        查询时出示：{product.title} ／ {selected.sku || selected.label}
        。请同时询问「初回生産分の申込券と店舗特典はまだ付きますか？」
      </p>
      <div className="store-grid">
        {options.map(({ store: s, offers, visits }) => (
          <article className="store-card" key={s.id} data-testid="store-card">
            <h4>{s.name}</h4>
            <span className="badge">{s.city} · 库存未核实</span>
            <p>{s.address}</p>
            {visits.map((v, i) => (
              <p key={i} className="helper">
                行程内可查询日期：{v.start} — {v.end}（营业时间请查官网）
              </p>
            ))}
            <p>渠道特典：{offers.map((o) => o.bonus).join("；")}</p>
            <p className="helper">{s.stock_note}</p>
            <div className="detail-tags">
              <Out href={s.official_url}>门店官网</Out>
              <Out href={mapUrl(s)}>地图导航</Out>
              {s.stock_url && <Out href={s.stock_url}>官网商品搜索</Out>}
              {s.phone && (
                <a className="text-link" href={`tel:${s.phone}`}>
                  电话 {s.phone}
                </a>
              )}
            </div>
            <p className="helper">地址核实：{s.checked_on} · 库存：未查询</p>
          </article>
        ))}
      </div>
      {!options.length && (
        <p className="helper">
          暂无符合此版本{trip ? "、城市停留和发售日期" : ""}
          的已核实门店。并不表示没有线下销售；请使用商品详情中的官方渠道询问。
        </p>
      )}
    </div>
  );
}
export function ReleaseTable({
  products,
  stores,
  trip,
}: {
  products: Release[];
  stores: Store[];
  trip?: Trip;
}) {
  return (
    <div className="shopping-table-wrap">
      <table className="shopping-table">
        <caption>
          按商品发售日查找附券商品，抽选申请时间列于最后。所有时间为日本时间。
        </caption>
        <thead>
          <tr>
            {[
              "发售日期",
              "附券商品 / 版本",
              "对应 Live",
              "购买渠道 / 线下店 / 库存",
              "抽选开始 → 截止（日本时间）",
            ].map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} data-testid="release-card">
              <td data-label="发售日期">
                <strong>{p.release_on || "尚未公布"}</strong>
                {trip && p.release_on && p.release_on > trip.end && (
                  <p className="badge">仅供行前预约参考</p>
                )}
              </td>
              <td data-label="附券商品 / 版本">
                {p.images?.find((i) => i.kind === "cover") && (
                  <OfficialImage
                    asset={p.images.find((i) => i.kind === "cover")!}
                    compact
                  />
                )}
                <h3>
                  <Link href={`/releases/${p.slug}`}>{p.title}</Link>
                </h3>
                {p.editions.map((e) => (
                  <p className="helper" key={e.id}>
                    {e.label} · {e.sku}{" "}
                    {e.price_yen !== null &&
                      `¥${e.price_yen.toLocaleString("ja-JP")}`}
                  </p>
                ))}
                <Link className="text-link" href={`/releases/${p.slug}`}>
                  查看版本、特典与预约日期 →
                </Link>
              </td>
              <td data-label="对应 Live">
                {p.lotteries.map((l) => (
                  <p key={l.id}>
                    {l.title}
                    <br />
                    <span className="helper">
                      {l.live_dates.length
                        ? l.live_dates.join("、")
                        : "具体场次日期待核实"}
                    </span>
                  </p>
                ))}
              </td>
              <td data-label="购买渠道 / 线下店 / 库存">
                <p>
                  {Array.from(new Set(p.offers.map((o) => o.retailer)))
                    .slice(0, 3)
                    .join(" / ")}
                  {new Set(p.offers.map((o) => o.retailer)).size > 3
                    ? " 等"
                    : ""}
                </p>
                <p className="badge">库存待查询</p>
                <details className="store-disclosure">
                  <summary>线下门店与查询入口</summary>
                  <StoreFinder product={p} stores={stores} trip={trip} />
                </details>
              </td>
              <td data-label="抽选开始 → 截止（日本时间）">
                {p.lotteries.map((l) => (
                  <div className="lottery-dates" key={l.id}>
                    {p.lotteries.length > 1 && <strong>{l.title}</strong>}
                    <p>
                      开始：
                      {l.window.opens_on || japanTimestamp(l.window.opens_at)}
                    </p>
                    <p>截止：{japanTimestamp(l.window.closes_at)}</p>
                    <Out href={l.source_url}>官方抽选依据</Out>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function TripShopping({
  products,
  stores,
  trip,
  error,
}: {
  products: Release[];
  stores: Store[];
  trip: Trip;
  error?: string;
}) {
  const [days, setDays] = useState(30);
  const valid = trip.start && trip.end && tripSchema.safeParse(trip).success;
  const matches = tripProducts(products, trip, days);
  return (
    <section className="section-space" data-testid="trip-shopping">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SHOPPING BEFORE THE LIVE</span>
          <h2>
            旅行期间的附券商品 <span className="count">{matches.length}</span>
          </h2>
        </div>
        <Link className="text-link" href="/releases">
          查看全部发售日历 →
        </Link>
      </div>
      <p>
        匹配旅行期间及行前发售的商品，也保留旅途中截止的抽选与预约。门店按各城市停留日期匹配；这是购入线索，不保证有库存。
      </p>
      <label className="sort-label">
        行前发售范围
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={30}>行前30天</option>
          <option value={90}>行前90天</option>
          <option value={-1}>全部已收录发售商品</option>
        </select>
      </label>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {matches.length ? (
        <ReleaseTable
          products={matches.map((m) => m.product)}
          stores={stores}
          trip={trip}
        />
      ) : (
        <div className="empty">
          <p>
            {valid
              ? "这个日期范围内暂无匹配记录，可以扩大行前发售范围或查看全部商品。"
              : "先填写有效旅行日期，再添加城市停留。"}
          </p>
        </div>
      )}
    </section>
  );
}
