"use client";
import type { Franchise } from "@/lib/schema";
import { orderedFranchises, releaseFranchiseGroups } from "@/lib/franchises";
import { descendants } from "@/lib/domain";

import { ReleaseTable, StoreFinder } from "./shopping";
import type { Store } from "@/lib/shopping";
import { OfficialImage } from "./official-image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Ticket, CalendarDays } from "lucide-react";
import {
  japanTimestamp,
  salesStatusLabels,
  windowStatus,
  type Release,
  type SalesWindow,
} from "@/lib/releases";
import { usePersonal } from "./personal";

function Official({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className="text-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children} <ArrowUpRight size={14} />
    </a>
  );
}
function Window({ value, now }: { value: SalesWindow; now: Date }) {
  return (
    <div className="release-window">
      <span className="badge">
        {salesStatusLabels[windowStatus(value, now)]}
      </span>
      <dl>
        <dt>开始（日本时间）</dt>
        <dd>
          {value.opens_on
            ? `${value.opens_on}（具体时刻未公布）`
            : japanTimestamp(value.opens_at)}
        </dd>
        <dt>截止（日本时间）</dt>
        <dd>{japanTimestamp(value.closes_at)}</dd>
      </dl>
      <p className="helper">{value.note}</p>
    </div>
  );
}
export function ReleaseExplorer({
  releases,
  franchises,
  stores,
  mode,
  error,
}: {
  releases: Release[];
  franchises: Franchise[];
  stores: Store[];
  mode: string;
  error?: string;
}) {
  const { now } = usePersonal();
  const [query, setQuery] = useState("");
  const [ip, setIp] = useState("");
  const [upcoming, setUpcoming] = useState(false);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("release");
  const allowed = ip ? descendants(ip, franchises) : null;
  const today = new Date(now.getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
  const filtered = releases
    .filter(
      (p) =>
        (!query ||
          `${p.title} ${p.summary} ${p.lotteries.map((l) => l.title).join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!allowed || p.franchise_ids.some(id => allowed.has(id))) &&
        (!upcoming || Boolean(p.release_on && p.release_on >= today)) &&
        (!status ||
          p.lotteries.some((l) => windowStatus(l.window, now) === status)),
    )
    .sort((a, b) =>
      sort === "release"
        ? (a.release_on || "9999").localeCompare(b.release_on || "9999")
        : Math.min(
            ...a.lotteries.map((l) =>
              l.window.closes_at ? Date.parse(l.window.closes_at) : Infinity,
            ),
          ) -
          Math.min(
            ...b.lotteries.map((l) =>
              l.window.closes_at ? Date.parse(l.window.closes_at) : Infinity,
            ),
          ),
    );
  return (
    <>
      <p className={`notice ${error ? "error" : ""}`}>
        {error ||
          `${mode === "shared" ? "统一发布资料 · 自动检查数据更新，非实时库存" : mode === "local" ? "本地人工核实资料 · 非自动同步" : "数据库已发布资料 · 人工审核"}。所有时间为日本时间，未知时间保留为空。`}
      </p>
      <div className="explorer-layout">
        <aside className="filter-panel">
          <h2>
            <Ticket size={18} />
            查找抽选关联商品
          </h2>
          <label>
            商品 / Live 关键词
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="20周年、MyGO、Ave Mujica"
            />
          </label>
          <label>
            关联企划
            <select value={ip} onChange={(e) => setIp(e.target.value)}>
              <option value="">全部</option>
              {orderedFranchises(franchises).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.parent_id ? "　" : ""}
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Live 抽选状态
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部状态</option>
              {Object.entries(salesStatusLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={upcoming}
              onChange={(e) => setUpcoming(e.target.checked)}
            />
            仅看今日及以后发售
          </label>
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setIp("");
              setUpcoming(false);
              setStatus("");
            }}
          >
            清空筛选
          </button>
        </aside>
        <div>
          <div className="results-bar">
            <p>
              <strong>{filtered.length}</strong> 件已核实商品
            </p>
            <label className="sort-label">
              排序
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="release">发售日期</option>
                <option value="deadline">Live 抽选截止（未知置后）</option>
              </select>
            </label>
          </div>
          {releaseFranchiseGroups(filtered, franchises).map(group => (
            <section className="section-space" key={group.id} aria-label={`${group.label}抽选商品`} data-testid="release-ip-group">
              <h2>{group.label} <span className="count">{group.products.length}</span></h2>
              <ReleaseTable products={group.products} stores={stores} />
            </section>
          ))}
          {!filtered.length && (
            <div className="empty">
              <h2>没有匹配的商品</h2>
              <p>
                试试其他关键词，或清空筛选。未公布时间的抽选不会被当作正在报名。
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
export function ReleaseDetail({
  product: p,
  stores,
}: {
  product: Release;
  stores: Store[];
}) {
  const { now } = usePersonal();
  const [edition, setEdition] = useState("");
  const [shop, setShop] = useState("");
  const offers = p.offers.filter(
    (o) =>
      (!edition || o.edition_ids.includes(edition)) &&
      (!shop || o.retailer === shop),
  );
  return (
    <>
      <Link className="back-link" href="/releases">
        ← Live 抽选与发售
      </Link>
      <header className="detail-heading">
        <span className="eyebrow">RELEASE & LIVE LOTTERY</span>
        <h1>{p.title}</h1>
        <p>{p.summary}</p>
        <div className="detail-tags">
          <span className="badge green">
            <CalendarDays size={14} /> 发售日 {p.release_on || "尚未公布"}
          </span>
          <span className="badge">日元价格均含税</span>
        </div>
      </header>
      <div className="notice">
        商品发售日、商品预约截止、特典活动截止与 Live
        抽选截止是四件不同的事。购入附券商品不等于获得门票；开放时间也不代表有库存。
      </div>
      <div className="release-list section-space">
        <section className="panel">
          <h2>① 选择商品版本</h2>
          <div className="product-gallery">
            {p.images
              ?.filter((i) => i.kind === "cover")
              .map((i) => (
                <OfficialImage asset={i} key={i.url} />
              ))}
          </div>
          <div className="release-editions">
            {p.editions.map((e) => (
              <article key={e.id}>
                <h3>{e.label}</h3>
                <strong>
                  {e.price_yen === null
                    ? "价格待核实"
                    : `¥${e.price_yen.toLocaleString("ja-JP")}`}
                </strong>
                <p className="helper">{e.sku}</p>
                <p>{e.eligibility}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>② 店铺特典与商品预约</h2>
          <p>
            以下为逐版本记录；“未核实”不等于没有特典。没有固定截止日期时请询问店铺。
          </p>
          <div className="form-row">
            <label>
              商品版本
              <select
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
              >
                <option value="">全部版本</option>
                {p.editions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              店铺
              <select value={shop} onChange={(e) => setShop(e.target.value)}>
                <option value="">全部店铺</option>
                {Array.from(new Set(p.offers.map((o) => o.retailer))).map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <p className="helper" role="status">
            匹配 {offers.length} 条店铺 / 版本记录
          </p>
          <div className="release-offers">
            {offers.map((o) => (
              <article
                key={o.id}
                className="release-offer"
                data-testid="retailer-offer"
              >
                <h3>{o.retailer}</h3>
                <div className="bonus-gallery">
                  {p.images
                    ?.filter(
                      (i) =>
                        i.kind === "bonus" &&
                        i.retailer === o.retailer &&
                        (!i.edition_ids.length ||
                          i.edition_ids.some((id) =>
                            o.edition_ids.includes(id),
                          )),
                    )
                    .map((i) => (
                      <OfficialImage key={i.url} asset={i} />
                    ))}
                </div>
                <p className="badge">
                  {p.editions
                    .filter((e) => o.edition_ids.includes(e.id))
                    .map((e) => e.label)
                    .join(" / ")}
                </p>
                <p>
                  <strong>店铺特典：</strong>
                  {o.bonus}
                </p>
                <h4>商品预约时间</h4>
                <Window value={o.preorder} now={now} />
                <p className="helper">{o.note}</p>
                <div className="detail-tags">
                  <Official url={o.source_url}>信息依据</Official>
                  {o.shop_url && (
                    <Official url={o.shop_url}>
                      前往店铺商品页 / 官网搜索
                    </Official>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!offers.length && (
            <p className="notice">
              该版本没有此店的已核实记录；不能据此推断可以购买或获得特典。
            </p>
          )}
        </section>
        <section className="panel" data-testid="campaign-section">
          <h2>③ 共通特典活动的独立期限</h2>
          {p.campaigns.length ? (
            p.campaigns.map((c) => (
              <article key={c.name}>
                <h3>{c.name}</h3>
                <p>{c.bonus}</p>
                <Window value={c.window} now={now} />
                <details>
                  <summary>查看参与店铺（不等于上方全部店铺）</summary>
                  <ul className="conditions">
                    {c.retailers.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </details>
                <Official url={c.source_url}>官方特典活动说明</Official>
              </article>
            ))
          ) : (
            <p>
              本条尚未录入已核实的共通特典预约活动。请以各商品官方公告为准。
            </p>
          )}
        </section>
        <section className="panel">
          <h2>④ 线下门店与库存查询</h2>
          <StoreFinder product={p} stores={stores} />
        </section>
        <section className="panel" data-testid="lottery-section">
          <h2>⑤ Live 抽选资格与时间</h2>
          {p.lotteries.map((l) => (
            <article key={l.id} className="release-lottery">
              <h3>{l.title}</h3>
              <p>
                适用版本：
                {p.editions
                  .filter((e) => l.edition_ids.includes(e.id))
                  .map((e) => e.label)
                  .join(" / ")}
              </p>
              <p>
                Live 日期：
                {l.live_dates.length
                  ? l.live_dates.join("、")
                  : "具体日期尚未核实"}{" "}
                · {l.venue || "会场尚未核实"}
              </p>
              <Window value={l.window} now={now} />
              <ul className="conditions">
                {l.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <Official url={l.source_url}>核对官方抽选公告</Official>
              {l.event_slug && (
                <p>
                  <Link className="text-link" href={`/events/${l.event_slug}`}>
                    查看 Live 场次、收藏或加入旅行备选 →
                  </Link>
                </p>
              )}
            </article>
          ))}
        </section>
        <section className="panel">
          <h2>官方来源与核实日期</h2>
          <p>
            人工核实的资料快照，未自动监测后续变更。下单及报名之前请再次查看官方公告。
          </p>
          {p.sources.map((s) => (
            <div className="source-row" key={s.url}>
              <Official url={s.url}>{s.label}</Official>
              <p className="helper">最后核实：{s.checked_on || "待核实"}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
