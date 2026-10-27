"use client";
import { useState } from "react";
import { type Announcement, imageKindLabels } from "@/lib/announcements";
import { OfficialImage } from "./official-image";

export function AnnouncementImages({ items }: { items: Announcement[] }) {
  const seen = new Set<string>();
  const images = items.flatMap(item => item.images.map(image => ({ ...image, source_url: item.source_url }))).filter(image => {
    if (seen.has(image.url)) return false;
    seen.add(image.url); return true;
  });
  return <>{Object.entries(imageKindLabels).map(([kind, label]) => {
    const group = images.filter(image => image.kind === kind);
    return group.length ? <section key={kind} className="news-image-group">
      <h3>{label} <span className="count">{group.length}</span></h3>
      <div className="event-gallery">{group.map(image => <OfficialImage key={image.url} asset={{ url: image.url, alt: image.alt || label, source_url: image.source_url, checked_on: null }} />)}</div>
    </section> : null;
  })}</>;
}

export function AnnouncementList({ items }: { items: Announcement[] }) {
  const [query, setQuery] = useState("");
  const [goodsOnly, setGoodsOnly] = useState(false);
  const [limit, setLimit] = useState(12);
  const filtered = items.filter(item => (!goodsOnly || item.images.some(image => image.kind === "merchandise")) && `${item.title} ${item.source_id} ${item.images.map(i => i.alt).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="news-filters panel">
      <label>搜索官方公告<input value={query} onChange={e => { setQuery(e.target.value); setLimit(12); }} placeholder="输入作品、快闪或商品名称" /></label>
      <label className="checkbox-label"><input type="checkbox" checked={goodsOnly} onChange={e => { setGoodsOnly(e.target.checked); setLimit(12); }} />只看识别到售卖商品图的公告</label>
      <p className="helper">共 {filtered.length} 条。图片自动分类可能有误，商品价格、限购、预约与库存请以官方原文为准。</p>
    </div>
    {!filtered.length && <p className="panel">暂未找到公告；可调整搜索词，或稍后刷新数据。</p>}
    {filtered.slice(0, limit).map(item => <article className="panel section-space news-card" key={item.id}>
      <span className="badge green">官方公告 · 自动采集</span>
      <h2><a href={item.source_url} target="_blank" rel="noopener noreferrer" lang="ja">{item.title} ↗</a></h2>
      <p className="helper">来源：{new URL(item.source_url).hostname} · 最近采集：{item.last_seen_at.slice(0, 10)}（UTC）</p>
      <p className="helper">举办日期与预约规则待核实，尚未据此加入行程匹配。采集时间不是活动举办时间，公告也可能涉及已结束的活动。</p>
      {!!item.images.length && <details><summary>查看商品及活动图片（{item.images.length} 张）</summary><AnnouncementImages items={[item]} /></details>}
      <a className="text-link" href={item.source_url} target="_blank" rel="noopener noreferrer">阅读完整官方公告 ↗</a>
    </article>)}
    {filtered.length > limit && <button className="button secondary" onClick={() => setLimit(limit + 12)}>加载更多公告</button>}
  </>;
}
