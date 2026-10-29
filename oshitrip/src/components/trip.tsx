"use client";
import type { Release } from "@/lib/releases";
import type { Store } from "@/lib/shopping";
import { TripShopping } from "./shopping";
import { useState } from "react";
import { CalendarDays, MapPin, Plus, Trash2 } from "lucide-react";
import type { Catalog, Trip } from "@/lib/schema";
import { cityChoices, tripSchema } from "@/lib/schema";
import { descendants, tripMatches } from "@/lib/domain";
import { usePersonal } from "./personal";
import { AddVenue, Empty, EventCollectionCard, IPChoices } from "./events";
import { groupMatches } from "@/lib/domain";

export function TripPage({
  catalog,
  releases,
  stores,
  shoppingError,
}: {
  catalog: Catalog;
  releases: Release[];
  stores: Store[];
  shoppingError?: string;
}) {
  const { data, save, now } = usePersonal();
  const [draft, setDraft] = useState<Trip | null>(null);
  const [error, setError] = useState("");
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const trip = draft || data.trip;
  const update = (next: Trip) => {
    setDraft(next);
    setError("");
  };
  const matches = tripSchema.safeParse(trip).success
    ? tripMatches(catalog.events, catalog.franchises, trip, now)
    : [];
  const followed = new Set(
    data.ips.flatMap((id) => [...descendants(id, catalog.franchises)]),
  );
  const shown = onlyFollowed
    ? matches.filter((m) =>
        m.event.franchise_ids.some((id) => followed.has(id)),
      )
    : matches;
  const saveTrip = () => {
    const result = tripSchema.safeParse(trip);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    save({ ...data, trip: { ...result.data, venue_ids: data.trip.venue_ids } });
    setDraft(null);
  };
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">YOUR TRAVEL NOTEBOOK</span>
        <h1>我的旅行</h1>
        <p>一座城市，一段停留。把喜欢的活动安排在对的时间。</p>
      </div>
      <p className="notice">
        行程、关注与收藏仅保存在当前浏览器。换设备或清除浏览器数据可能丢失。
      </p>
      <div className="trip-layout">
        <div className="panel">
          <h2>
            <CalendarDays size={21} />
            旅行日期
          </h2>
          <div className="form-row">
            <label>
              旅行开始日期
              <input
                type="date"
                value={trip.start}
                onChange={(e) => update({ ...trip, start: e.target.value })}
              />
            </label>
            <label>
              旅行结束日期
              <input
                type="date"
                value={trip.end}
                onChange={(e) => update({ ...trip, end: e.target.value })}
              />
            </label>
          </div>
          <div className="section-heading compact">
            <h2>
              <MapPin size={21} />
              城市停留
            </h2>
            <button
              className="text-button"
              onClick={() =>
                update({
                  ...trip,
                  stays: [
                    ...trip.stays,
                    {
                      id: crypto.randomUUID(),
                      city: "大阪",
                      start: trip.start,
                      end: trip.end,
                    },
                  ],
                })
              }
            >
              <Plus size={16} />
              添加城市
            </button>
          </div>
          {trip.stays.length === 0 && (
            <p className="helper">先设置旅行日期，再添加每座城市的停留时间。</p>
          )}
          {trip.stays.map((s, i) => (
            <fieldset className="stay-row" key={s.id}>
              <legend>第 {i + 1} 站</legend>
              <label>
                城市
                <select
                  value={s.city}
                  onChange={(e) =>
                    update({
                      ...trip,
                      stays: trip.stays.map((x) =>
                        x.id === s.id ? { ...x, city: e.target.value } : x,
                      ),
                    })
                  }
                >
                  {cityChoices(catalog.events).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                抵达日期
                <input
                  type="date"
                  value={s.start}
                  onChange={(e) =>
                    update({
                      ...trip,
                      stays: trip.stays.map((x) =>
                        x.id === s.id ? { ...x, start: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                离开日期
                <input
                  type="date"
                  value={s.end}
                  onChange={(e) =>
                    update({
                      ...trip,
                      stays: trip.stays.map((x) =>
                        x.id === s.id ? { ...x, end: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <button
                className="icon-button"
                aria-label={`删除第 ${i + 1} 站`}
                onClick={() =>
                  update({
                    ...trip,
                    stays: trip.stays.filter((x) => x.id !== s.id),
                  })
                }
              >
                <Trash2 size={17} />
              </button>
            </fieldset>
          ))}
          <div className="section-heading compact">
            <h2>已有安排</h2>
            <button
              className="text-button"
              onClick={() =>
                update({
                  ...trip,
                  plans: [
                    ...trip.plans,
                    {
                      id: crypto.randomUUID(),
                      title: "",
                      city: "大阪",
                      date: trip.start,
                      place: "",
                    },
                  ],
                })
              }
            >
              <Plus size={16} />
              添加安排
            </button>
          </div>
          <p className="helper">
            可记录 Live、演唱会等。以下是你的私人笔记，不是平台发布的活动。
          </p>
          {trip.plans.map((p, i) => (
            <fieldset className="plan-row" key={p.id}>
              <legend>安排 {i + 1}</legend>
              {(["title", "city", "date", "place"] as const).map((key, j) => (
                <label key={key}>
                  {["安排名称", "城市", "日期", "地点"][j]}
                  <input
                    type={key === "date" ? "date" : "text"}
                    value={p[key]}
                    onChange={(e) =>
                      update({
                        ...trip,
                        plans: trip.plans.map((x) =>
                          x.id === p.id ? { ...x, [key]: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                className="text-button"
                onClick={() =>
                  update({
                    ...trip,
                    plans: trip.plans.filter((x) => x.id !== p.id),
                  })
                }
              >
                删除安排
              </button>
            </fieldset>
          ))}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button className="button primary full" onClick={saveTrip}>
            保存旅行计划
          </button>
        </div>
        <aside className="panel trip-summary">
          <span className="eyebrow">MY SHORTLIST</span>
          <h2>旅行备选清单</h2>
          <p className="helper">
            收藏到这里不代表已安排日期或已预约；请结合城市停留推荐选择。
          </p>
          {catalog.events.flatMap((event) =>
            event.venues
              .filter((v) => data.trip.venue_ids.includes(v.id))
              .map((v) => (
                <div className="shortlist-item" key={v.id}>
                  <strong>{event.title_zh}</strong>
                  <p>
                    {v.city} · {v.name}
                  </p>
                  <p>
                    {v.start_date} — {v.end_date}
                  </p>
                  <AddVenue venueId={v.id} />
                </div>
              )),
          )}
          {!data.trip.venue_ids.length && (
            <p>在活动详情中点击“加入旅行备选”，就会出现在这里。</p>
          )}
        </aside>
      </div>
      <TripShopping
        products={releases}
        stores={stores}
        trip={trip}
        error={shoppingError}
      />
      <section className="section-space">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ALONG YOUR ROUTE</span>
            <h2>
              可顺路参加的活动合集{" "}
              <span className="count">{groupMatches(shown).length}</span>
            </h2>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={onlyFollowed}
              onChange={(e) => setOnlyFollowed(e.target.checked)}
            />
            只看已关注 IP
          </label>
        </div>
        <div className="cards-grid three">
          {groupMatches(shown).map((group) => (
            <EventCollectionCard key={group.event.id} group={group} />
          ))}
        </div>
        {!shown.length && (
          <Empty>
            添加城市停留时间后，会按各城市的具体日期匹配。
            {onlyFollowed && "请先在收藏与关注中选择 IP。"}
          </Empty>
        )}
      </section>
    </>
  );
}
export function FavoritesPage({ catalog }: { catalog: Catalog }) {
  const { data } = usePersonal();
  const favorites = catalog.events.filter((e) => data.favorites.includes(e.id));
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">A LITTLE COLLECTION OF JOY</span>
        <h1>收藏与关注</h1>
        <p>把期待留下来，下次出发时再见。</p>
      </div>
      <div className="panel">
        <h2>我关注的 IP</h2>
        <IPChoices franchises={catalog.franchises} />
        <p className="helper">
          关注父系列会在旅行推荐中包含子系列；关注子系列不会自动包含其他子系列。
        </p>
      </div>
      <section className="section-space">
        <h2>收藏的活动 · {favorites.length}</h2>
        <p className="helper">
          收藏按活动保存，详情中可选择全部门店。历史活动也会保留。
        </p>
        <div className="cards-grid three">
          {favorites.map((event) => (
            <EventCollectionCard
              key={event.id}
              group={{ event, venues: event.venues }}
            />
          ))}
        </div>
        {!favorites.length && (
          <Empty>点击活动卡片上的爱心，建立自己的愿望清单。</Empty>
        )}
      </section>
      <p className="notice">
        仅保存在当前浏览器，尚未云同步。活动下架后可能不再显示，但不会擅自删除本地收藏记录。
      </p>
    </>
  );
}
