"use client";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { storeSchema, storesSchema, type Store } from "@/lib/shopping";
import { releaseSchema } from "@/lib/releases";
type Candidate = {
  id: string;
  source_url: string;
  payload: Record<string, unknown>;
  created_at: string;
};
type Run = {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  error: string | null;
};
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败，请检查数据库与权限。";
export function ShoppingAdmin({ db }: { db: SupabaseClient }) {
  const [stores, setStores] = useState<Store[]>([]),
    [store, setStore] = useState<Store | null>(null),
    [storeJson, setStoreJson] = useState("");
  const [queue, setQueue] = useState<Candidate[]>([]),
    [runs, setRuns] = useState<Run[]>([]),
    [candidate, setCandidate] = useState<Candidate | null>(null);
  const [releaseJson, setReleaseJson] = useState(""),
    [revision, setRevision] = useState<string | null>(null),
    [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    try {
      const [s, c, r] = await Promise.all([
        db.from("store_branches").select("*"),
        db
          .from("ingestion_candidates")
          .select("id,source_url,payload,created_at")
          .eq("status", "pending")
          .eq("payload->>kind", "release-source")
          .order("created_at", { ascending: false }),
        db
          .from("ingestion_runs")
          .select("*")
          .eq("adapter", "release-crawler")
          .order("started_at", { ascending: false })
          .limit(10),
      ]);
      for (const x of [s, c, r]) if (x.error) throw new Error(x.error.message);
      setStores(storesSchema.parse(s.data));
      setQueue(c.data || []);
      setRuns(r.data || []);
      setMessage("门店、待审核候选与最近运行记录已加载。");
    } catch (e) {
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function review(c: Candidate) {
    setBusy(true);
    try {
      const r = await db.from("releases").select("document,updated_at");
      if (r.error) throw new Error(r.error.message);
      const matches = (r.data || []).filter((row) =>
        releaseSchema
          .parse(row.document)
          .sources.some((s) => s.url === c.source_url),
      );
      if (matches.length > 1)
        throw new Error(
          "该公告关联多个商品，请逐个在商品管理中核实维护后拒绝此候选，避免批量误改。",
        );
      const row = matches[0];
      const p = row
        ? releaseSchema.parse(row.document)
        : {
            id: crypto.randomUUID(),
            slug: "new-release",
            title: String(c.payload.title || ""),
            release_on: null,
            status: "draft",
            updated_at: new Date().toISOString(),
            franchise_ids: ["bang-dream"],
            summary: "待核实；采集并不代表已确认附券。",
            editions: [
              {
                id: "standard",
                label: "待核实版本",
                sku: "",
                price_yen: null,
                eligibility: "待核实",
              },
            ],
            lotteries: [
              {
                id: "unknown",
                title: "待核实抽选",
                edition_ids: ["standard"],
                event_slug: null,
                live_dates: [],
                venue: null,
                window: {
                  opens_on: null,
                  opens_at: null,
                  closes_at: null,
                  note: "待核实",
                },
                conditions: ["待核实"],
                source_url: c.source_url,
              },
            ],
            offers: [],
            campaigns: [],
            sources: [
              {
                label: "官方来源（待核实）",
                url: c.source_url,
                checked_on: null,
              },
            ],
          };
      const draft = {
        ...p,
        status: "review",
        release_on:
          typeof c.payload.release_on === "string"
            ? c.payload.release_on
            : p.release_on,
        sources: p.sources.map((s) =>
          s.url === c.source_url ? { ...s, checked_on: null } : s,
        ),
      };
      setCandidate(c);
      setRevision(row?.updated_at || null);
      setTargetId(p.id);
      setReleaseJson(JSON.stringify(draft, null, 2));
      setMessage(
        "请对照官网逐项审核。抽选窗口不会从其他商品或轮次自动套用；发布前填写真实核实日期。保存为 review 会暂时从公开页隐藏该商品。",
      );
    } catch (e) {
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel section-space release-editor">
      <h2>门店目录与自动发现审核</h2>
      <p>
        采集任务只写待审核队列，不修改已发布商品、不推断门店库存。部署并配置调度后才会产生新运行记录；来源未获许可时会记录为
        blocked。
      </p>
      <button className="button secondary" disabled={busy} onClick={load}>
        加载门店、候选与运行日志
      </button>
      <details>
        <summary>门店维护（{stores.length} 家）</summary>
        <div className="release-admin-list">
          {stores.map((s) => (
            <button
              key={s.id}
              className="text-button"
              disabled={busy}
              onClick={() => {
                setStore(s);
                setStoreJson(JSON.stringify(s, null, 2));
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
        {store && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const p = storeSchema.parse({
                  ...JSON.parse(storeJson),
                  id: store.id,
                });
                const { updated_at: version, ...fields } = p;
                void version;
                const r = await db
                  .from("store_branches")
                  .update(fields)
                  .eq("id", store.id)
                  .eq("updated_at", store.updated_at)
                  .select("*");
                if (r.error) throw new Error(r.error.message);
                if (r.data.length !== 1)
                  throw new Error("门店已被其他管理员修改，请刷新。");
                const saved = storeSchema.parse(r.data[0]);
                setStore(saved);
                setStoreJson(JSON.stringify(saved, null, 2));
                setStores((prev) =>
                  prev.map((s) => (s.id === saved.id ? saved : s)),
                );
                setMessage("门店资料已保存。");
              } catch (e) {
                setMessage(messageOf(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              门店资料 JSON
              <textarea
                value={storeJson}
                onChange={(e) => setStoreJson(e.target.value)}
                disabled={busy}
              />
            </label>
            <button disabled={busy} className="button secondary">
              保存门店
            </button>
          </form>
        )}
      </details>
      <h3>商品与 Live 公告候选 · {queue.length}</h3>
      {queue.map((c) => (
        <article key={c.id} className="release-offer">
          <a
            className="text-link"
            href={c.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            官方来源 ↗
          </a>
          <p>发现时间：{c.created_at}</p>
          <pre className="candidate-json">
            {JSON.stringify(c.payload, null, 2)}
          </pre>
          <div className="detail-tags">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => review(c)}
            >
              载入商品审核表单
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await db
                    .from("ingestion_candidates")
                    .update({
                      status: "rejected",
                      reviewed_at: new Date().toISOString(),
                    })
                    .eq("id", c.id)
                    .eq("status", "pending")
                    .select("id");
                  if (r.error) throw new Error(r.error.message);
                  if (!r.data.length) throw new Error("候选已处理，请刷新");
                  setQueue((prev) => prev.filter((x) => x.id !== c.id));
                  if (candidate?.id === c.id) setCandidate(null);
                } catch (e) {
                  setMessage(messageOf(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              拒绝此候选
            </button>
          </div>
        </article>
      ))}
      {candidate && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const p = releaseSchema.parse({
                ...JSON.parse(releaseJson),
                id: targetId,
              });
              const r = await db.rpc("apply_release_candidate", {
                candidate_id: candidate.id,
                payload: p,
                expected_updated_at: revision,
              });
              if (r.error) throw new Error(r.error.message);
              setQueue((prev) => prev.filter((c) => c.id !== candidate.id));
              setCandidate(null);
              setMessage(
                p.status === "published"
                  ? "审核完成，商品已发布，刷新公开页面即可看到。"
                  : "审核内容已保存，当前仍未公开发布。",
              );
            } catch (e) {
              setMessage(messageOf(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            审核后的完整商品 JSON
            <textarea
              disabled={busy}
              value={releaseJson}
              onChange={(e) => setReleaseJson(e.target.value)}
            />
          </label>
          <p className="helper">
            保留 status: review 为待审核；全部核实后改为 published。来源的
            checked_on 必须填写实际核实日期。不要把未知字段补成推测结果。
          </p>
          <button className="button primary" disabled={busy}>
            保存审核结果并标记已处理
          </button>
        </form>
      )}
      <details>
        <summary>最近 10 次运行记录</summary>
        {runs.length ? (
          runs.map((r) => (
            <div key={r.id}>
              <p>
                {r.started_at} · {r.status}
              </p>
              <pre className="candidate-json">
                {r.error || "任务完成；候选仍需要审核。"}
              </pre>
            </div>
          ))
        ) : (
          <p>暂无运行记录，不能据此声称已同步。</p>
        )}
      </details>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
