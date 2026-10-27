"use client";
import { ImageCandidateReview } from "./image-candidate-review";
import { imageCandidateSchema } from "@/lib/image-candidates";
import { ShoppingAdmin } from "./shopping-admin";

import { useCallback, useEffect, useState } from "react";
import { createDatabase } from "@/lib/supabase";
import {
  catalogSchema,
  eventSchema,
  franchiseSchema,
  categories,
  methods,
  type Catalog,
  type OshiEvent,
  type Round,
  type Venue,
} from "@/lib/schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ReleaseAdmin } from "./release-admin";

const blankRound = (): Round => ({
  id: crypto.randomUUID(),
  label: "报名轮次",
  method: "尚未公布",
  kind: "unannounced",
  opens_at: null,
  closes_at: null,
  days_before: null,
  open_time: null,
  cutoff_days_before: null,
  cutoff_time: null,
  url: null,
  note: "",
});
const blankVenue = (): Venue => ({
  id: crypto.randomUUID(),
  city: "",
  name: "",
  address: null,
  start_date: "",
  end_date: "",
  rounds: [],
});
const blankEvent = (): OshiEvent => ({
  id: crypto.randomUUID(),
  slug: "",
  title_ja: "",
  title_zh: "",
  summary: "",
  category: "联动咖啡厅",
  fees: null,
  conditions: [],
  status: "draft",
  verified_at: null,
  updated_at: new Date().toISOString(),
  franchise_ids: [],
  venues: [blankVenue()],
  sources: [
    {
      id: crypto.randomUUID(),
      label: "官方活动公告",
      url: "",
      checked_at: null,
    },
  ],
});
const localTime = (s: string | null) =>
  s ? new Date(Date.parse(s) + 9 * 3600000).toISOString().slice(0, 16) : "";
const isoTime = (s: string) => (s ? `${s}:00+09:00` : null);
function failure(e: unknown) {
  return e instanceof Error
    ? e.message
    : typeof e === "object" && e && "message" in e
      ? String(e.message)
      : "操作失败，请检查网络和数据库配置。";
}
type Candidate = {
  id: string;
  source_url: string;
  status: string;
  payload: unknown;
  error: string | null;
  created_at: string;
};
export function Admin() {
  const [db] = useState(() => createDatabase(true));
  const [auth, setAuth] = useState<"loading" | "login" | "denied" | "admin">(
    "loading",
  );
  const [catalog, setCatalog] = useState<Catalog>({
    events: [],
    franchises: [],
  });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<OshiEvent | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user) {
      setAuth("login");
      setCatalog({ events: [], franchises: [] });
      setSelected(null);
      return;
    }
    const admin = await db.rpc("is_admin");
    if (admin.error || !admin.data) {
      setAuth("denied");
      setSelected(null);
      return;
    }
    setAuth("admin");
    const result = await db.rpc("read_catalog");
    if (result.error) throw result.error;
    const parsed = catalogSchema.parse(result.data);
    setCatalog(parsed);
    const queue = await db
      .from("ingestion_candidates")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (queue.error) throw queue.error;
    setCandidates(
      (queue.data || []).filter((c) => c.payload?.kind !== "release-source"),
    );
    return parsed;
  }, [db]);
  useEffect(() => {
    let disposed = false;
    const run = () => {
      if (!disposed) void load().catch((e) => setMessage(failure(e)));
    };
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(() => {
      setTimeout(run, 0);
    });
    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, [db, load]);
  const logout = async () => {
    const { error } = await db.auth.signOut();
    if (error) setMessage(error.message);
    else {
      setSelected(null);
      setAuth("login");
    }
  };
  if (auth === "loading")
    return <p role="status">正在验证管理员身份…{message}</p>;
  if (auth !== "admin")
    return (
      <section className="panel admin-login">
        <h2>管理员登录</h2>
        <p className="helper">
          使用 Supabase 中创建并授权的管理员账号。普通用户无需登录。
        </p>
        {auth === "denied" ? (
          <>
            <p className="notice error">
              当前账号没有管理员权限。请由项目所有者在数据库授权。
            </p>
            <button className="button secondary" onClick={logout}>
              退出账号
            </button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              const result = await db.auth.signInWithPassword({
                email,
                password,
              });
              setPassword("");
              if (result.error)
                setMessage("登录失败，请检查账号、密码或网络。");
              else await load().catch((e) => setMessage(failure(e)));
              setBusy(false);
            }}
          >
            <label>
              邮箱
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              密码
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={busy} className="button primary full">
              {busy ? "登录中…" : "登录"}
            </button>
          </form>
        )}
        {message && (
          <p role="alert" className="notice error">
            {message}
          </p>
        )}
      </section>
    );
  return (
    <>
      <div className="admin-toolbar">
        <span>已通过 Supabase 身份和管理员权限验证</span>
        <div>
          <button
            className="button secondary small"
            onClick={() => {
              setSelected(blankEvent());
              setMessage("");
            }}
          >
            新增活动
          </button>{" "}
          <button className="text-button" onClick={logout}>
            退出登录
          </button>
        </div>
      </div>
      <ReleaseAdmin db={db} />
      <ShoppingAdmin db={db} />
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="admin-layout">
        <aside className="panel admin-list">
          <h2>活动记录</h2>
          {catalog.events.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                setSelected(e);
                setMessage("");
              }}
            >
              {e.title_zh}
              <br />
              <span className="helper">
                {e.status} · {e.updated_at.slice(0, 10)}
              </span>
            </button>
          ))}
          {!catalog.events.length && (
            <p className="helper">暂无记录。可运行种子 SQL，或手工新增。</p>
          )}
        </aside>
        {selected ? (
          <EventEditor
            key={selected.id + selected.updated_at}
            event={selected}
            catalog={catalog}
            db={db}
            isNew={!catalog.events.some((e) => e.id === selected.id)}
            onSaved={async (id) => {
              const next = await load();
              setSelected(next?.events.find((e) => e.id === id) || null);
              setMessage("已写入数据库。已发布记录可在活动列表查看。");
            }}
          />
        ) : (
          <div className="panel">
            <h2>维护真实活动资料</h2>
            <p>
              选择活动或点击“新增活动”。发布前请核实官方来源、门店日期和参加规则。
            </p>
            <p className="helper">
              所有字段写入在一个数据库事务中完成；同时编辑发生冲突时会拒绝覆盖。
            </p>
          </div>
        )}
      </div>
      <section className="panel section-space">
        <h2>新增 IP / 子系列</h2>
        <form
          className="form-row"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const result = franchiseSchema.safeParse({
              id: fd.get("id"),
              name: fd.get("name"),
              parent_id: fd.get("parent") || null,
            });
            if (!result.success) {
              setMessage(result.error.issues[0].message);
              return;
            }
            const saved = await db.from("franchises").insert(result.data);
            if (saved.error) setMessage(saved.error.message);
            else {
              form.reset();
              await load();
              setMessage("IP 已添加");
            }
          }}
        >
          <label>
            唯一 ID
            <input
              required
              name="id"
              placeholder="例如：new-series"
              pattern="[a-z0-9-]+"
            />
          </label>
          <label>
            IP 名称
            <input required name="name" />
          </label>
          <label>
            上级系列
            <select name="parent">
              <option value="">无（顶级 IP）</option>
              {catalog.franchises.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary">添加 IP</button>
        </form>
      </section>
      <section className="panel section-space review-list">
        <h2>发现候选 · 待审核 {candidates.length}</h2>
        <p>
          活动候选只可人工核实后复制为草稿。商品公告候选请在上方独立审核区处理。
        </p>
        {candidates.map((c) => (
          <article key={c.id}>
            <a href={c.source_url} target="_blank" rel="noopener noreferrer">
              查看候选官方来源 ↗
            </a>
            <ImageCandidateReview payload={c.payload} />
            <details>
              <summary>查看完整采集证据</summary>
              <pre>{JSON.stringify(c.payload, null, 2)}</pre>
            </details>
            {c.error && <p className="notice error">{c.error}</p>}
            <div className="actions">
              <button
                className="button secondary small"
                onClick={() => {
                  const parsed = eventSchema.safeParse(c.payload);
                  if (!parsed.success) {
                    const evidence = c.payload as {
                      kind?: string;
                      title?: string;
                    };
                    if (evidence.kind === "event-source") {
                      const draft = blankEvent();
                      draft.title_ja = String(evidence.title || "").slice(
                        0,
                        500,
                      );
                      draft.sources[0].url = c.source_url;
                      const images = imageCandidateSchema.safeParse(c.payload);
                      if (images.success) {
                        draft.gallery = images.data.images
                          .slice(0, 40)
                          .map((x) => ({
                            url: x.url,
                            alt: x.alt || "待核实官方图片",
                            source_url: c.source_url,
                            checked_on: null,
                          }));
                        draft.translated_rules = images.data.image_reviews
                          .flatMap((r) =>
                            r.status === "needs_review" &&
                            r.sha256 &&
                            !r.reading?.unreadable &&
                            draft.gallery?.some((a) => a.url === r.url)
                              ? (r.reading?.rules || [])
                                  .filter((x) => !x.uncertain)
                                  .map((x) => ({
                                    id: crypto.randomUUID(),
                                    kind: x.kind,
                                    title: x.title,
                                    text_zh: x.text_zh,
                                    evidence_ja: x.evidence_ja,
                                    source_url: c.source_url,
                                    image_url: r.url,
                                    image_sha256: r.sha256,
                                    checked_on: null,
                                  }))
                              : [],
                          )
                          .slice(0, 60);
                      }
                      setSelected(draft);
                      setMessage(
                        "已建立待核实草稿，图片与可辨识译文已放入编辑区（核实日期为空）。请逐图对照日文、数量、组别与时间，选定主图并补全门店信息；不确定译文保留在候选中，不能直接发布。",
                      );
                      return;
                    }
                    setMessage(
                      "候选字段尚不完整，请通过新增活动表单核实录入。",
                    );
                    return;
                  }
                  const e = parsed.data;
                  setSelected({
                    ...e,
                    id: crypto.randomUUID(),
                    slug: `${e.slug}-review`,
                    status: "draft",
                    verified_at: null,
                    sources: e.sources.map((s) => ({
                      ...s,
                      id: crypto.randomUUID(),
                      checked_at: null,
                    })),
                    venues: e.venues.map((v) => ({
                      ...v,
                      id: crypto.randomUUID(),
                      rounds: v.rounds.map((r) => ({
                        ...r,
                        id: crypto.randomUUID(),
                      })),
                    })),
                  });
                  setMessage(
                    "候选已复制到编辑表单，尚未保存。请先核实并保存，再标记候选已处理。",
                  );
                }}
              >
                复制为待核实草稿
              </button>
              {(["reviewed", "rejected"] as const).map((status) => (
                <button
                  key={status}
                  className="text-button"
                  onClick={async () => {
                    const r = await db
                      .from("ingestion_candidates")
                      .update({ status, reviewed_at: new Date().toISOString() })
                      .eq("id", c.id);
                    if (r.error) setMessage(r.error.message);
                    else await load();
                  }}
                >
                  {status === "reviewed" ? "标记已处理" : "拒绝候选"}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
function EventEditor({
  event,
  catalog,
  db,
  isNew,
  onSaved,
}: {
  event: OshiEvent;
  catalog: Catalog;
  db: SupabaseClient;
  isNew: boolean;
  onSaved: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(event);
  const [benefitJson, setBenefitJson] = useState(
    JSON.stringify(event.benefits || [], null, 2),
  );
  const [galleryJson, setGalleryJson] = useState(
    JSON.stringify(event.gallery || [], null, 2),
  );
  const [rulesJson, setRulesJson] = useState(
    JSON.stringify(event.translated_rules || [], null, 2),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const field = <K extends keyof OshiEvent>(key: K, value: OshiEvent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const venue = (id: string, patch: Partial<Venue>) =>
    field(
      "venues",
      draft.venues.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    );
  const round = (v: Venue, id: string, patch: Partial<Round>) =>
    venue(v.id, {
      rounds: v.rounds.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  return (
    <form
      className="panel admin-form"
      onSubmit={async (e) => {
        e.preventDefault();
        let evidence;
        try {
          evidence = {
            benefits: JSON.parse(benefitJson),
            gallery: JSON.parse(galleryJson),
            translated_rules: JSON.parse(rulesJson),
          };
        } catch {
          setMessage("特典或图库 JSON 格式错误，尚未保存。");
          return;
        }
        const result = eventSchema.safeParse({ ...draft, ...evidence });
        if (!result.success) {
          setMessage(
            result.error.issues
              .map((i) => `${i.path.join(".")}：${i.message}`)
              .join("；"),
          );
          return;
        }
        setBusy(true);
        setMessage("");
        try {
          const saved = await db.rpc("save_event", {
            document: result.data,
            expected_updated_at: isNew ? null : event.updated_at,
          });
          if (saved.error) throw saved.error;
          await onSaved(saved.data);
        } catch (e) {
          setMessage(failure(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{isNew ? "新增真实活动" : "编辑活动"}</h2>
      <p className="helper">
        最后修改：{isNew ? "尚未保存" : event.updated_at}
        。时间字段均按日本时间填写。遇到 CONFLICT
        请重新选择左侧活动载入最新版本。
      </p>
      <div className="form-row">
        {(["title_ja", "title_zh", "slug"] as const).map((key, i) => (
          <label key={key}>
            {["日文原名", "中文名称", "网址标识 slug"][i]}
            <input
              required
              value={draft[key]}
              onChange={(e) => field(key, e.target.value)}
            />
          </label>
        ))}
        <label>
          活动分类
          <select
            value={draft.category}
            onChange={(e) =>
              field("category", e.target.value as OshiEvent["category"])
            }
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          发布状态
          <select
            value={draft.status}
            onChange={(e) =>
              field("status", e.target.value as OshiEvent["status"])
            }
          >
            <option value="draft">草稿</option>
            <option value="review">待审核</option>
            <option value="published">已发布</option>
            <option value="cancelled">已取消（保留公告）</option>
            <option value="archived">已下架</option>
          </select>
        </label>
        <label>
          最后核实时间（JST）
          <input
            type="datetime-local"
            value={localTime(draft.verified_at)}
            onChange={(e) => field("verified_at", isoTime(e.target.value))}
          />
        </label>
      </div>
      <fieldset>
        <legend>关联 IP（可多选）</legend>
        <div className="ip-choices">
          {catalog.franchises.map((f) => (
            <label className="checkbox" key={f.id}>
              <input
                type="checkbox"
                checked={draft.franchise_ids.includes(f.id)}
                onChange={(e) =>
                  field(
                    "franchise_ids",
                    e.target.checked
                      ? [...draft.franchise_ids, f.id]
                      : draft.franchise_ids.filter((id) => id !== f.id),
                  )
                }
              />
              {f.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        活动简介
        <textarea
          value={draft.summary}
          onChange={(e) => field("summary", e.target.value)}
        />
      </label>
      <label>
        费用（未知请留空）
        <textarea
          value={draft.fees || ""}
          onChange={(e) => field("fees", e.target.value || null)}
        />
      </label>
      <label>
        参加条件（每行一条）
        <textarea
          value={draft.conditions.join("\n")}
          onChange={(e) => field("conditions", e.target.value.split("\n"))}
        />
      </label>
      <section>
        <h2>活动图</h2>
        <p className="helper">
          填写官方页面上的主视觉
          URL，保留完整画面。没有确认的活动图时请留空；不要使用网站通用封面或无关商品图。
        </p>
        <label>
          官方图片 URL（HTTPS）
          <input
            type="url"
            value={draft.image?.url || ""}
            onChange={(e) =>
              field(
                "image",
                e.target.value
                  ? {
                      url: e.target.value,
                      alt: draft.image?.alt || draft.title_zh,
                      source_url:
                        draft.image?.source_url || draft.sources[0]?.url || "",
                      checked_on: null,
                    }
                  : null,
              )
            }
          />
        </label>
        {draft.image && (
          <div className="form-row">
            <label>
              图片说明
              <input
                value={draft.image.alt}
                onChange={(e) =>
                  field("image", { ...draft.image!, alt: e.target.value })
                }
              />
            </label>
            <label>
              图片出处（须与官方来源一致）
              <input
                type="url"
                value={draft.image.source_url}
                onChange={(e) =>
                  field("image", {
                    ...draft.image!,
                    source_url: e.target.value,
                    checked_on: null,
                  })
                }
              />
            </label>
            <label>
              图片核实日期
              <input
                type="date"
                value={draft.image.checked_on || ""}
                onChange={(e) =>
                  field("image", {
                    ...draft.image!,
                    checked_on: e.target.value || null,
                  })
                }
              />
            </label>
          </div>
        )}
      </section>
      <section>
        <h2>官方来源</h2>
        <details>
          <summary>编辑中文规则、特典和商品图库</summary>
          <label>
            中文规则 JSON
            <textarea
              rows={12}
              value={rulesJson}
              onChange={(e) => setRulesJson(e.target.value)}
            />
          </label>
          <p className="helper">
            仅录入核实后的资料；未知金额使用
            null。每条规则须填写适用门店、来源和核实日期。保存时会验证来源及门店引用。
          </p>
          <label>
            特典规则 JSON
            <textarea
              rows={14}
              value={benefitJson}
              onChange={(e) => setBenefitJson(e.target.value)}
            />
          </label>
          <label>
            商品与特典图库 JSON
            <textarea
              rows={10}
              value={galleryJson}
              onChange={(e) => setGalleryJson(e.target.value)}
            />
          </label>
        </details>
        {draft.sources.map((s, i) => (
          <fieldset key={s.id}>
            <legend>来源 {i + 1}</legend>
            <div className="form-row">
              <label>
                来源名称
                <input
                  required
                  value={s.label}
                  onChange={(e) =>
                    field(
                      "sources",
                      draft.sources.map((x) =>
                        x.id === s.id ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                官方 URL
                <input
                  type="url"
                  required
                  value={s.url}
                  onChange={(e) =>
                    field(
                      "sources",
                      draft.sources.map((x) =>
                        x.id === s.id ? { ...x, url: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label>
                实际核实时间（JST）
                <input
                  type="datetime-local"
                  value={localTime(s.checked_at)}
                  onChange={(e) =>
                    field(
                      "sources",
                      draft.sources.map((x) =>
                        x.id === s.id
                          ? { ...x, checked_at: isoTime(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  field(
                    "sources",
                    draft.sources.filter((x) => x.id !== s.id),
                  )
                }
              >
                删除来源
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          className="button secondary small"
          onClick={() =>
            field("sources", [
              ...draft.sources,
              { id: crypto.randomUUID(), label: "", url: "", checked_at: null },
            ])
          }
        >
          添加来源
        </button>
      </section>
      <section>
        <h2>门店与场次</h2>
        {draft.venues.map((v, i) => (
          <div className="admin-venue" key={v.id}>
            <h3>门店 {i + 1}</h3>
            <div className="form-row">
              {(
                ["city", "name", "address", "start_date", "end_date"] as const
              ).map((key, j) => (
                <label key={key}>
                  {
                    [
                      "城市",
                      "门店日文名",
                      "地址（未知留空）",
                      "举办开始日",
                      "举办结束日",
                    ][j]
                  }
                  <input
                    required={key !== "address"}
                    type={key.endsWith("date") ? "date" : "text"}
                    value={v[key] || ""}
                    onChange={(e) =>
                      venue(v.id, {
                        [key]:
                          key === "address"
                            ? e.target.value || null
                            : e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            {v.rounds.map((r) => (
              <div className="admin-round" key={r.id}>
                <div className="form-row">
                  <label>
                    报名轮次名称
                    <input
                      required
                      value={r.label}
                      onChange={(e) =>
                        round(v, r.id, { label: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    参加方式
                    <select
                      value={r.method}
                      onChange={(e) =>
                        round(v, r.id, {
                          method: e.target.value as Round["method"],
                        })
                      }
                    >
                      {methods.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    规则类型
                    <select
                      value={r.kind}
                      onChange={(e) =>
                        round(v, r.id, {
                          kind: e.target.value as Round["kind"],
                        })
                      }
                    >
                      <option value="unannounced">规则尚未公布</option>
                      <option value="unknown">尚未核实</option>
                      <option value="none">无需预约</option>
                      <option value="fixed">固定报名轮次</option>
                      <option value="rolling">按到店日滚动</option>
                    </select>
                  </label>
                  <label>
                    官方预约 / App URL
                    <input
                      type="url"
                      value={r.url || ""}
                      onChange={(e) =>
                        round(v, r.id, { url: e.target.value || null })
                      }
                    />
                  </label>
                  {r.kind === "fixed" && (
                    <>
                      <label>
                        报名开始（JST）
                        <input
                          type="datetime-local"
                          value={localTime(r.opens_at)}
                          onChange={(e) =>
                            round(v, r.id, {
                              opens_at: isoTime(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        报名截止（JST）
                        <input
                          type="datetime-local"
                          value={localTime(r.closes_at)}
                          onChange={(e) =>
                            round(v, r.id, {
                              closes_at: isoTime(e.target.value),
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  {r.kind === "rolling" && (
                    <>
                      <label>
                        提前多少天开放
                        <input
                          type="number"
                          min="0"
                          max="365"
                          required
                          value={r.days_before ?? ""}
                          onChange={(e) =>
                            round(v, r.id, {
                              days_before:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        开放时刻（不明留空）
                        <input
                          type="time"
                          value={r.open_time || ""}
                          onChange={(e) =>
                            round(v, r.id, {
                              open_time: e.target.value || null,
                            })
                          }
                        />
                      </label>
                      <label>
                        提前多少天截止
                        <input
                          type="number"
                          min="0"
                          max="365"
                          required
                          value={r.cutoff_days_before ?? ""}
                          onChange={(e) =>
                            round(v, r.id, {
                              cutoff_days_before:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        截止时刻（JST）
                        <input
                          type="time"
                          required
                          value={r.cutoff_time || ""}
                          onChange={(e) =>
                            round(v, r.id, {
                              cutoff_time: e.target.value || null,
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
                <label>
                  规则补充说明
                  <textarea
                    value={r.note}
                    onChange={(e) => round(v, r.id, { note: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    venue(v.id, {
                      rounds: v.rounds.filter((x) => x.id !== r.id),
                    })
                  }
                >
                  删除此报名轮次
                </button>
              </div>
            ))}
            <div className="admin-toolbar">
              <button
                type="button"
                className="button secondary small"
                onClick={() =>
                  venue(v.id, { rounds: [...v.rounds, blankRound()] })
                }
              >
                添加报名轮次
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  field(
                    "venues",
                    draft.venues.filter((x) => x.id !== v.id),
                  )
                }
              >
                删除此门店
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="button secondary"
          onClick={() => field("venues", [...draft.venues, blankVenue()])}
        >
          添加门店 / 场次
        </button>
      </section>
      {message && (
        <p role="alert" className="notice error">
          {message}
        </p>
      )}
      <button disabled={busy} className="button primary">
        {busy ? "保存中…" : "保存到数据库"}
      </button>
    </form>
  );
}
