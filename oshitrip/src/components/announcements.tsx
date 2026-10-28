"use client";
import { useState } from "react";
import Link from "next/link";
import {
  type Announcement,
  imageKindLabels,
  announcementKind,
} from "@/lib/announcements";
import { OfficialImage } from "./official-image";

export function AnnouncementImages({ items }: { items: Announcement[] }) {
  const seen = new Set<string>();
  const images = items
    .flatMap((item) =>
      item.images.map((image) => ({ ...image, source_url: item.source_url })),
    )
    .filter((image) => {
      if (seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    });
  return (
    <>
      {Object.entries(imageKindLabels).map(([kind, label]) => {
        const group = images.filter((image) => image.kind === kind);
        return group.length ? (
          <section key={kind} className="news-image-group">
            <h3>
              {label} <span className="count">{group.length}</span>
            </h3>
            <div className="event-gallery">
              {group.map((image) => (
                <OfficialImage
                  key={image.url}
                  asset={{
                    url: image.url,
                    alt: image.alt || label,
                    source_url: image.source_url,
                    checked_on: null,
                  }}
                />
              ))}
            </div>
          </section>
        ) : null;
      })}
    </>
  );
}

export function AnnouncementList({ items }: { items: Announcement[] }) {
  const [query, setQuery] = useState("");
  const [goodsOnly, setGoodsOnly] = useState(false);
  const [limit, setLimit] = useState(12);
  const [collection, setCollection] = useState("all");
  const filtered = items.filter(
    (item) =>
      (collection === "all" || announcementKind(item) === collection) &&
      (!goodsOnly ||
        item.images.some((image) => image.kind === "merchandise")) &&
      `${item.title} ${item.activity?.title_zh || ""} ${item.activity?.summary_zh || ""} ${item.source_id} ${item.images.map((i) => i.alt).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <nav className="collection-tabs" aria-label="官方消息合集">
        {[
          ["all", "全部消息"],
          ["offline", "线下活动合集"],
          ["live", "Live 合集"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`chip ${collection === value ? "selected" : ""}`}
            aria-pressed={collection === value}
            onClick={() => {
              setCollection(value);
              setLimit(12);
            }}
          >
            {label} ·{" "}
            {
              items.filter(
                (item) => value === "all" || announcementKind(item) === value,
              ).length
            }
          </button>
        ))}
      </nav>
      <div className="news-filters panel">
        <label>
          搜索官方公告
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(12);
            }}
            placeholder="输入作品、快闪或商品名称"
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={goodsOnly}
            onChange={(e) => {
              setGoodsOnly(e.target.checked);
              setLimit(12);
            }}
          />
          只看识别到售卖商品图的公告
        </label>
        <p className="helper">
          共 {filtered.length}{" "}
          条。图片自动分类可能有误，商品价格、限购、预约与库存请以官方原文为准。
        </p>
      </div>
      {!filtered.length && (
        <p className="panel">暂未找到公告；可调整搜索词，或稍后刷新数据。</p>
      )}
      {(["offline", "live"] as const)
        .filter((kind) => collection === "all" || collection === kind)
        .map((kind) => (
          <section
            key={kind}
            aria-label={kind === "live" ? "Live 官方消息" : "线下活动官方消息"}
          >
            <h2>{kind === "live" ? "Live 合集" : "线下活动合集"}</h2>
            {filtered
              .filter((item) => announcementKind(item) === kind)
              .slice(0, limit)
              .map((item) => (
                <ActivityAnnouncement item={item} key={item.id} />
              ))}
            {!filtered.some((item) => announcementKind(item) === kind) && (
              <p className="helper">这个合集暂无符合条件的公告。</p>
            )}
          </section>
        ))}
      {["offline", "live"].some(
        (kind) =>
          filtered.filter((item) => announcementKind(item) === kind).length >
          limit,
      ) && (
        <button
          className="button secondary"
          onClick={() => setLimit(limit + 12)}
        >
          加载更多公告
        </button>
      )}
    </>
  );
}

export function ActivityAnnouncement({
  item,
  showImages = true,
}: {
  item: Announcement;
  showImages?: boolean;
}) {
  const activity = item.activity;
  return (
    <article
      className="panel section-space news-card"
      id={`announcement-${item.id}`}
    >
      <span className="badge green">官方公告 · 自动采集</span>
      <span className="badge">
        {announcementKind(item) === "live" ? "Live" : "线下活动"} ·{" "}
        {activity?.state === "ready" ? "已整理" : "待审核"}
      </span>
      <h2>{activity?.title_zh || item.title}</h2>
      {activity?.title_zh && (
        <p lang="ja" className="helper">
          {item.title}
        </p>
      )}
      <p className="helper">
        来源：{new URL(item.source_url).hostname} · 最近采集：
        {item.last_seen_at.slice(0, 10)}（UTC）
      </p>
      {activity?.summary_zh && <p>{activity.summary_zh}</p>}
      <p className="helper">
        {activity?.state === "ready"
          ? "日期与场地已从官方正文提取；中文为辅助译文，请对照原文确认参与规则。"
          : activity?.state === "translation_pending"
            ? "中文翻译等待处理，尚未据此加入行程匹配。"
            : "举办日期与预约规则待核实，尚未据此加入行程匹配。"}{" "}
        采集时间不是活动举办时间。
      </p>
      {!!activity?.rules.length && (
        <details className="activity-rules">
          <summary>中文参与规则（{activity.rules.length} 项）</summary>
          {activity.rules.map((rule, i) => (
            <div className="booking-rule" key={i}>
              <h3>{rule.title}</h3>
              <p>{rule.text_zh}</p>
              <details>
                <summary>日文依据</summary>
                <p lang="ja">{rule.evidence_ja}</p>
              </details>
            </div>
          ))}
        </details>
      )}
      {!!item.image_readings?.length && (
        <details className="activity-rules">
          <summary>图片规则译文 · 待核实</summary>
          <p className="helper">
            以下为图片机器识别结果，未用于报名状态或行程匹配；请对照原图，尤其是数量和截止日期。
          </p>
          {item.image_readings.map((reading) => (
            <div key={reading.url}>
              {reading.unreadable && <p>图片部分文字无法辨认。</p>}
              {reading.rules.map((rule, i) => (
                <div className="booking-rule" key={i}>
                  <h3>
                    {rule.title}
                    {rule.uncertain ? "（不确定）" : ""}
                  </h3>
                  <p>{rule.text_zh}</p>
                  <p lang="ja" className="helper">
                    {rule.evidence_ja}
                  </p>
                </div>
              ))}
              <a href={reading.url} target="_blank" rel="noopener noreferrer">
                查看规则原图 ↗
              </a>
            </div>
          ))}
        </details>
      )}
      <Link
        className="text-link"
        href={
          activity?.state !== "ready"
            ? `/events#announcement-${item.id}`
            : "/events"
        }
      >
        {activity?.state !== "ready"
          ? "已推送至发现活动 · 待审核 →"
          : "在发现活动中查看场次与报名 →"}
      </Link>
      {showImages && !!item.images.length && (
        <details>
          <summary>查看商品及活动图片（{item.images.length} 张）</summary>
          <AnnouncementImages items={[item]} />
        </details>
      )}
      <a
        className="text-link"
        href={item.source_url}
        target="_blank"
        rel="noopener noreferrer"
      >
        阅读完整官方公告 ↗
      </a>
    </article>
  );
}
