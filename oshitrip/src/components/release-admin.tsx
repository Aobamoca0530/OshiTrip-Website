"use client";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { releaseSchema, releasesSchema, type Release } from "@/lib/releases";
const emptyWindow = {
  opens_on: null,
  opens_at: null,
  closes_at: null,
  note: "待核实",
};
export function ReleaseAdmin({ db }: { db: SupabaseClient }) {
  const [items, setItems] = useState<Release[]>([]);
  const [selected, setSelected] = useState<Release | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [json, setJson] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function select(p: Release, revision: string | null) {
    setSelected(p);
    setRevision(revision);
    setJson(JSON.stringify(p, null, 2));
    setMessage("");
  }
  async function load() {
    setBusy(true);
    try {
      const r = await db
        .from("releases")
        .select("document,updated_at")
        .order("updated_at", { ascending: false });
      if (r.error) throw new Error(r.error.message);
      setItems(
        releasesSchema.parse(
          r.data.map((r) => ({ ...r.document, updated_at: r.updated_at })),
        ),
      );
      setMessage("商品目录已读取。编辑前点击对应商品加载最新版本。");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "读取失败，请确认已执行002迁移。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel section-space release-editor">
      <h2>Live 抽选与商品管理</h2>
      <p className="helper">
        使用当前管理员会话。基本字段可直接填写；版本、店铺、抽选与来源使用结构化
        JSON 编辑，保存时校验格式及版本引用。未知日期填
        null，不要用发售日代替。支持草稿、待审核、发布与下架。
      </p>
      <div className="detail-tags">
        <button disabled={busy} className="button secondary" onClick={load}>
          加载 / 刷新商品
        </button>
        <button
          disabled={busy}
          className="button secondary"
          onClick={() =>
            select(
              {
                id: crypto.randomUUID(),
                slug: "",
                title: "",
                franchise_ids: [],
                release_on: null,
                summary: "",
                status: "draft",
                updated_at: new Date().toISOString(),
                editions: [
                  {
                    id: "standard",
                    label: "通常版",
                    sku: "",
                    price_yen: null,
                    eligibility: "待核实",
                  },
                ],
                lotteries: [
                  {
                    id: "first",
                    title: "最速先行",
                    edition_ids: ["standard"],
                    event_slug: null,
                    live_dates: [],
                    venue: null,
                    window: emptyWindow,
                    conditions: ["待核实"],
                    source_url: "https://",
                  },
                ],
                offers: [],
                campaigns: [],
                sources: [
                  { label: "官方公告", url: "https://", checked_on: null },
                ],
              },
              null,
            )
          }
        >
          新增商品
        </button>
      </div>
      <div className="release-admin-list">
        {items.map((p) => (
          <button
            className="text-button"
            key={p.id}
            disabled={busy}
            onClick={() => select(p, p.updated_at)}
          >
            {p.title}（{p.status}）
          </button>
        ))}
      </div>
      {selected && (
        <form
          className="admin-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const parsed = releaseSchema.parse({
                ...JSON.parse(json),
                id: selected.id,
                title: selected.title,
                slug: selected.slug,
                release_on: selected.release_on,
                status: selected.status,
              });
              const result = await db.rpc("save_release", {
                payload: parsed,
                expected_updated_at: revision,
              });
              if (result.error) throw new Error(result.error.message);
              select({ ...parsed, updated_at: result.data }, result.data);
              setItems((prev) => [
                ...prev.filter((p) => p.id !== parsed.id),
                { ...parsed, updated_at: result.data },
              ]);
              setMessage(
                "已保存到数据库。公众页面只展示 published 商品；发生并发冲突时请刷新后重新编辑。",
              );
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "保存失败。");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-row">
            <label>
              商品名称
              <input
                disabled={busy}
                required
                value={selected.title}
                onChange={(e) =>
                  setSelected({ ...selected, title: e.target.value })
                }
              />
            </label>
            <label>
              网址 slug
              <input
                disabled={busy}
                required
                pattern="[a-z0-9-]+"
                value={selected.slug}
                onChange={(e) =>
                  setSelected({ ...selected, slug: e.target.value })
                }
              />
            </label>
            <label>
              发售日期
              <input
                disabled={busy}
                type="date"
                value={selected.release_on || ""}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    release_on: e.target.value || null,
                  })
                }
              />
            </label>
            <label>
              发布状态
              <select
                disabled={busy}
                value={selected.status}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    status: e.target.value as Release["status"],
                  })
                }
              >
                <option value="draft">草稿</option>
                <option value="review">待审核</option>
                <option value="published">已发布</option>
                <option value="archived">已下架</option>
              </select>
            </label>
          </div>
          <label>
            版本、抽选、店铺及来源 JSON
            <textarea
              disabled={busy}
              spellCheck={false}
              value={json}
              onChange={(e) => setJson(e.target.value)}
            />
          </label>
          <p className="helper">
            上方基本字段优先于 JSON 中的同名字段。sources.checked_on
            是实际核实日期；opens_at / closes_at 使用带时区的时间，例如
            2026-11-15T23:59:00+09:00。event_slug 可关联已有活动，未公布场次填
            null。
          </p>
          <button disabled={busy} className="button primary">
            {busy ? "处理中…" : "保存商品到数据库"}
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
