"use client";
import Link from "next/link";
import { ArrowRight, CalendarDays, Compass, MapPin } from "lucide-react";
import { cities, type Catalog } from "@/lib/schema";
import { EventCollectionCard, Empty, IPChoices } from "./events";
import { usePersonal } from "./personal";
import { filterEvents, groupMatches } from "@/lib/domain";
export function Home({ catalog }: { catalog: Catalog }) {
  const { data, now } = usePersonal();
  const upcoming = filterEvents(catalog.events, catalog.franchises, {}, now);
  const cards = groupMatches(upcoming).slice(0, 3);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="mini-line" /> YOUR FANDOM, YOUR JOURNEY
          </p>
          <h1>
            下一站，
            <br />
            去见<span>你的喜欢。</span>
          </h1>
          <p className="hero-description">
            把热爱的 IP 放进旅行地图。
            <br />
            发现日本联动咖啡、快闪与展览，让每一段行程多一点期待。
          </p>
          <div className="hero-meta">
            <span>
              <Compass size={16} />
              官方来源可追溯
            </span>
            <span>
              <CalendarDays size={16} />
              按城市与日期匹配
            </span>
          </div>
        </div>
        <div className="journey-art" aria-label="日本旅行路线插画">
          <div className="art-stamp">
            OSHI TRIP
            <br />
            <strong>日本を、もっと好きに。</strong>
          </div>
          <svg
            viewBox="0 0 480 330"
            role="img"
            aria-label="从名古屋、神户到大阪的旅行路线"
          >
            <path
              d="M58 266 C85 210 61 180 140 184 S192 92 258 128 S340 190 423 66"
              fill="none"
              stroke="#a5b9a9"
              strokeWidth="2"
              strokeDasharray="6 7"
            />
            <path d="M324 247 l28 -58 19 25 22 -49 31 82Z" fill="#d4ddd0" />
            <path
              d="M352 189 l-10 21 17 0Z M393 165 l-9 20 20 0Z"
              fill="#fbfaf5"
            />
            <circle
              cx="140"
              cy="184"
              r="8"
              fill="#f7faf1"
              stroke="#28614c"
              strokeWidth="4"
            />
            <circle
              cx="258"
              cy="128"
              r="8"
              fill="#f7faf1"
              stroke="#28614c"
              strokeWidth="4"
            />
            <circle
              cx="383"
              cy="110"
              r="8"
              fill="#f7faf1"
              stroke="#c9714c"
              strokeWidth="4"
            />
            <text x="83" y="219">
              神户 KOBE
            </text>
            <text x="219" y="100">
              大阪 OSAKA
            </text>
            <text x="333" y="81">
              名古屋 NAGOYA
            </text>
            <path
              d="M74 96 l40 0 M94 76 l0 40 M402 272 l20 0 M412 262 l0 20"
              stroke="#b0bba5"
              strokeWidth="2"
            />
          </svg>
          <div className="journey-ticket">
            <span className="ticket-icon">旅</span>
            <div>
              <small>A LITTLE DETOUR</small>
              <strong>让喜欢，成为出发的理由</strong>
            </div>
            <span className="ticket-arrow">↗</span>
          </div>
          <span className="art-caption">
            一场 Live，一杯联动咖啡，一段新的回忆。
          </span>
        </div>
      </section>
      <form action="/events" className="search-box">
        <label>
          <span>
            <Compass size={16} /> 喜欢的 IP
          </span>
          <select name="ip" defaultValue="">
            <option value="">全部 IP / 子系列</option>
            {catalog.franchises.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            <MapPin size={16} /> 去哪座城市
          </span>
          <select name="city" defaultValue="">
            <option value="">所有城市</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span>
            <CalendarDays size={16} /> 出发日期
          </span>
          <input name="start" type="date" aria-label="出发日期" />
        </label>
        <label>
          <span>
            <CalendarDays size={16} /> 返程日期
          </span>
          <input name="end" type="date" aria-label="返程日期" />
        </label>
        <button type="submit" className="button primary">
          寻找旅行期间的联动 <ArrowRight size={17} />
        </button>
      </form>
      <section className="follow-strip">
        <div>
          <h2>从你的喜欢开始</h2>
          <p>点选关注 IP，保存在当前浏览器</p>
        </div>
        <IPChoices franchises={catalog.franchises} />
      </section>
      <section className="section-space">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ON THE CALENDAR</span>
            <h2>下一次相遇，正在这里</h2>
            <p>近期联动精选 · 同一活动在不同城市，也有不同的相遇时间</p>
          </div>
          <Link className="text-link" href="/events">
            查看全部活动 <ArrowRight size={17} />
          </Link>
        </div>
        <div className="cards-grid three">
          {cards.map((group) => (
            <EventCollectionCard key={group.event.id} group={group} />
          ))}
        </div>
        {!cards.length && <Empty />}
      </section>
      <section className="trip-banner">
        <div>
          <span className="eyebrow">BEFORE THE LIVE</span>
          <h2>抽选券，藏在哪件商品里？</h2>
          <p>
            武士道20周年纪念书、MyGO!!!!! 与 Ave
            Mujica：查看发售日、店铺特典和各自的预约期限。
          </p>
        </div>
        <Link className="button primary" href="/releases">
          查看抽选与发售 <ArrowRight size={17} />
        </Link>
      </section>
      <section className="trip-banner">
        <div className="trip-banner-icon">
          <MapPin size={33} />
        </div>
        <div>
          <span className="eyebrow">MAKE IT YOUR TRIP</span>
          <h2>Live 之外，还能顺路去哪里？</h2>
          <p>记录每座城市的停留日期，为你的旅程找到刚刚好的联动。</p>
        </div>
        <Link className="button primary" href="/trip">
          {data.trip.stays.length ? "查看我的旅行" : "规划我的旅行"}
          <ArrowRight size={17} />
        </Link>
      </section>
    </>
  );
}
