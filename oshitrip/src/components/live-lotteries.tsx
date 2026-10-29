"use client";
import { useState } from 'react';
import Link from 'next/link';
import type { Announcement } from '@/lib/announcements';
import type { Franchise, OshiEvent } from '@/lib/schema';
import { japanTimestamp, type Release } from '@/lib/releases';
import { descendants } from '@/lib/domain';
import { orderedFranchises, releaseFranchiseGroups } from '@/lib/franchises';
import { liveLotteryItems } from '@/lib/live-lotteries';
import { AnnouncementImages } from './announcements';

export function LiveLotteries({ announcements, events, releases, franchises }: { announcements:Announcement[]; events:OshiEvent[]; releases:Release[]; franchises:Franchise[] }) {
  const [ip,setIp]=useState(''), [query,setQuery]=useState('');
  const allowed=ip?descendants(ip,franchises):null;
  const items=liveLotteryItems(announcements,events,releases).filter(item => (!allowed || item.franchise_ids.some(id=>allowed.has(id))) && `${item.title} ${item.summary}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="section-space" id="live-applications" aria-label="按IP查看Live报名">
    <h2>按 IP 查看 Live 报名</h2>
    <p className="notice">汇总已采集的 Live、一般抽选、商品附券先行及先着售票，包含历史轮次。待复核条目不表示正在报名；结构化报名时间为日本时间，海外公告按正文注明当地时间。</p>
    <div className="form-row">
      <label>Live 报名企划<select value={ip} onChange={e=>setIp(e.target.value)}><option value="">全部企划</option>{orderedFranchises(franchises).map(f=><option key={f.id} value={f.id}>{f.parent_id?'　':''}{f.name}</option>)}</select></label>
      <label>搜索 Live 报名<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="八巡、Roselia、103期…" /></label>
    </div>
    <p className="helper" role="status">{items.length} 条 Live / 演出资料</p>
    {releaseFranchiseGroups(items,franchises).map(group=><section key={group.id} className="section-space" aria-label={`${group.label}Live报名`}>
      <h3>{group.label}</h3>
      {group.products.map(item=><details key={item.id} className="panel" data-testid="live-lottery-card">
        <summary>{item.title} · {item.pending?'待复核':'已核实资料'}</summary>
        <p>{item.summary}</p>
        {item.pending && <p className="notice">{item.reason}</p>}
        {item.rules.filter(r=>/票|券|抽选|先行|报名|售票|身份|实名|入场|升席|年龄/.test(r.title+' '+r.text_zh)).map((r,i)=><div key={i}><h4>{r.title}</h4><p>{r.text_zh}</p></div>)}
        {item.event?.venues.map(v=><div key={v.id}><h4>{v.city} · {v.name} · {v.start_date}{v.end_date!==v.start_date?` — ${v.end_date}`:''}</h4>{v.rounds.map(r=><p key={r.id}>{r.label} · {r.method}<br/>开始：{japanTimestamp(r.opens_at)} · 截止：{japanTimestamp(r.closes_at)}<br/>{r.note}</p>)}</div>)}
        {item.products.length ? <div><h4>已核实的附券商品</h4><ul>{item.products.map(p=><li key={p.id}><Link href={`/releases/${p.slug}`}>{p.title}</Link> — {p.summary}</li>)}</ul></div> : <p className="helper">尚无关联的已核实附券商品；请按该轮官方资格说明报名，不能据此推断必须购买或无需购买商品。</p>}
        <a className="text-link" href={item.url} target="_blank" rel="noopener noreferrer">核对官方报名原文 ↗</a>
        {item.announcements.some(a=>a.images.length>0) && <details className="section-space" data-testid="lottery-images"><summary>查看官方演出与票务配图</summary><p className="helper">来自对应公告的配图，可能包含座席、特典及票务说明。图片收录不代表图中文字已经审核，也不作为附券商品封面。</p><AnnouncementImages items={item.announcements}/></details>}
        {item.event && <p><Link href={`/events/${item.event.slug}`}>查看演出场次与完整规则 →</Link></p>}
      </details>)}
    </section>)}
    {!items.length&&<p className="empty">没有匹配的 Live 报名信息。</p>}
  </section>;
}
