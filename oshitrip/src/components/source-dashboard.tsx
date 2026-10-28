"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileSearch,
  TriangleAlert,
} from "lucide-react";
import type { Announcement } from "@/lib/announcements";
import {
  reviewItems,
  sourceStateLabels,
  sourceStatusIsStale,
  type SourceStatus,
} from "@/lib/source-status";

function time(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "暂无记录";
}
const needsAttention = (state: string) =>
  ["failed", "blocked", "partial", "unknown"].includes(state);

export function SourceDashboard({
  status,
  items,
  now,
}: {
  status: SourceStatus;
  items: Announcement[];
  now: string;
}) {
  const [tab, setTab] = useState("sources");
  const [source, setSource] = useState("all");
  const [stage, setStage] = useState("all");
  const [query, setQuery] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [limit, setLimit] = useState(15);
  const pending = reviewItems(items, status);
  const attention = status.sources.filter((s) => needsAttention(s.state));
  const stale = sourceStatusIsStale(status, now);
  const sources = status.sources.filter(
    (s) => !attentionOnly || needsAttention(s.state),
  );
  const filtered = pending.filter(
    (row) =>
      (source === "all" || row.item.source_id === source) &&
      (stage === "all" ||
        (stage === "missing" ? row.missing : row.stage === stage)) &&
      `${row.item.title} ${row.item.activity?.title_zh || ""} ${row.reason}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const sourceName = (id: string) =>
    status.sources.find((s) => s.id === id)?.name || id;
  function showQueue(id = "all") {
    setSource(id);
    setStage("all");
    setQuery("");
    setLimit(15);
    setTab("review");
  }
  function clearFilters() {
    setSource("all");
    setStage("all");
    setQuery("");
    setLimit(15);
  }

  return (
    <div className="source-dashboard">
      <div className="page-heading">
        <Link href="/admin" className="text-link">
          活动管理 /
        </Link>
        <span className="eyebrow">SOURCE &amp; REVIEW</span>
        <h1>来源状态与待审核</h1>
        <p>看清消息从哪里来，还有哪些信息需要确认。</p>
      </div>
      <section
        className={`source-snapshot ${stale ? "is-stale" : ""}`}
        aria-label="报告时间"
      >
        <Clock3 size={22} aria-hidden="true" />
        <div>
          <strong>
            采集快照 · {time(status.checked_at)}
            {status.checked_at ? "（日本时间）" : ""}
          </strong>
          <p>
            {!status.checked_at
              ? "尚无采集报告，不能据此判断来源是否正常。"
              : stale
                ? "这份报告已超过 36 小时，当前来源状态尚未确认。请检查维护任务是否正常运行。"
                : "以下为这次采集的结果，不代表官网此刻的状态。"}
          </p>
          <small>
            刷新活动数据会下载已发布快照，不会立即抓取官网。全部来源失败或校验失败时不发布新资料，这里会继续显示上次快照。
          </small>
        </div>
      </section>
      <div className="source-metrics" aria-label="维护概览">
        <div>
          <Activity size={20} aria-hidden="true" />
          <strong>
            {status.sources.filter((s) => s.state !== "disabled").length}
          </strong>
          <span>已接入来源</span>
        </div>
        <div>
          <TriangleAlert size={20} aria-hidden="true" />
          <strong>{attention.length}</strong>
          <span>本轮需关注来源</span>
        </div>
        <div>
          <FileSearch size={20} aria-hidden="true" />
          <strong>{pending.length}</strong>
          <span>待翻译 / 待复核公告</span>
        </div>
        <div>
          <Clock3 size={20} aria-hidden="true" />
          <strong>
            {status.sources.reduce((n, s) => n + (s.deferred ?? 0), 0)}
          </strong>
          <span>本轮未处理候选链接</span>
        </div>
      </div>
      <div
        className="collection-tabs source-tabs"
        role="group"
        aria-label="面板切换"
      >
        <button
          className={`chip ${tab === "sources" ? "selected" : ""}`}
          aria-pressed={tab === "sources"}
          onClick={() => setTab("sources")}
        >
          来源状态
        </button>
        <button
          className={`chip ${tab === "review" ? "selected" : ""}`}
          aria-pressed={tab === "review"}
          onClick={() => setTab("review")}
        >
          待审核 · {pending.length}
        </button>
      </div>

      {tab === "sources" ? (
        <section aria-label="来源状态">
          <div className="source-section-heading">
            <div>
              <h2>每个来源，都有迹可循</h2>
              <p className="helper">
                发现数包含已知链接，不等于新公告数；读取成功也不代表审核通过。
              </p>
            </div>
            <label className="source-checkbox">
              <input
                type="checkbox"
                checked={attentionOnly}
                onChange={(e) => setAttentionOnly(e.target.checked)}
              />
              只看需关注来源
            </label>
          </div>
          <div className="source-grid">
            {sources.map((s) => (
              <article
                className="panel source-card"
                key={s.id}
                data-state={s.state}
              >
                <div className="source-card-top">
                  <span className={`source-state state-${s.state}`}>
                    {sourceStateLabels[s.state]}
                  </span>
                  <span className="helper">{new URL(s.url).hostname}</span>
                </div>
                <h3>{s.name}</h3>
                <dl className="source-times">
                  <div>
                    <dt>最近尝试</dt>
                    <dd>{time(s.last_attempt_at)}</dd>
                  </div>
                  <div>
                    <dt>最近完整成功</dt>
                    <dd>{time(s.last_success_at)}</dd>
                  </div>
                </dl>
                <div className="source-counts">
                  <span>
                    <b>{s.discovered ?? "—"}</b>发现链接
                  </span>
                  <span>
                    <b>{s.pages ?? "—"}</b>读到正文
                  </span>
                  <span>
                    <b>{s.deferred ?? "—"}</b>尚未处理
                  </span>
                </div>
                {s.state === "empty" && (
                  <p className="source-note">
                    本轮读取成功，未发现候选链接；不代表官网没有活动。
                  </p>
                )}
                {s.state === "success" && (
                  <p className="source-note">
                    已完成本轮选定范围的读取，不代表已覆盖全部历史公告。
                  </p>
                )}
                {s.state === "partial" && (
                  <p className="source-note">
                    部分页面未处理或读取失败，尚未完成本轮范围。
                  </p>
                )}
                {s.state === "unknown" && (
                  <p className="source-note">
                    来源已配置，但这份报告没有它的采集结果。
                  </p>
                )}
                {s.state === "disabled" && (
                  <p className="source-note">
                    未接入当前公共采集任务，不能据此宣称自动更新。
                  </p>
                )}
                {s.issues.length > 0 && (
                  <ul className="source-issues">
                    {s.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
                {s.retained > 0 && (
                  <p className="helper">
                    保留 {s.retained}{" "}
                    条本轮未读到正文的已有公告，原核实时间保持不变。
                  </p>
                )}
                <div className="source-card-actions">
                  <a
                    className="text-link"
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    官方来源 <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                  <button className="text-link" onClick={() => showQueue(s.id)}>
                    查看待审核（
                    {pending.filter((r) => r.item.source_id === s.id).length}）
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!sources.length && (
            <p className="panel">
              {attentionOnly
                ? "这份报告中没有需关注的来源。"
                : "尚无来源状态记录，请先运行现有维护流程。"}
            </p>
          )}
          <p className="helper source-footnote">
            X 目前仅提供官方账号入口，尚未自动同步帖子，因此不计入已接入来源。
          </p>
        </section>
      ) : (
        <section aria-label="待审核公告">
          <div className="source-section-heading">
            <div>
              <h2>把不确定的信息留在这里</h2>
              <p className="helper">
                统计当前保留公告中的未完成事项；已翻译摘要不等于日期与参与规则已核实。
              </p>
            </div>
          </div>
          <div className="panel review-filters">
            <label>
              搜索待审核公告
              <input
                value={query}
                placeholder="搜索活动名称或待办原因"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(15);
                }}
              />
            </label>
            <label>
              公告来源
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setLimit(15);
                }}
              >
                <option value="all">全部来源</option>
                {[
                  ...new Set([
                    ...status.sources.map((s) => s.id),
                    ...pending.map((r) => r.item.source_id),
                  ]),
                ].map((id) => (
                  <option key={id} value={id}>
                    {sourceName(id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              处理阶段
              <select
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  setLimit(15);
                }}
              >
                <option value="all">全部待办</option>
                <option value="translation">待翻译</option>
                <option value="review">待复核 / 信息未确定</option>
                <option value="missing">本轮缺少正文</option>
              </select>
            </label>
            <button className="button secondary" onClick={clearFilters}>
              清除筛选
            </button>
          </div>
          <p role="status" className="helper">
            找到 {filtered.length} 条待办 · 显示{" "}
            {Math.min(limit, filtered.length)} 条
          </p>
          <div className="source-review-list">
            {filtered
              .slice(0, limit)
              .map(({ item, stage: itemStage, missing, reason }) => (
                <article className="panel review-card" key={item.id}>
                  <div className="review-card-labels">
                    <span className="source-state state-partial">
                      {itemStage === "translation"
                        ? "待翻译"
                        : "待复核 / 信息未确定"}
                    </span>
                    {missing && (
                      <span className="source-state state-failed">
                        本轮缺少正文
                      </span>
                    )}
                    <span className="helper">{sourceName(item.source_id)}</span>
                  </div>
                  <h3>{item.activity?.title_zh || item.title}</h3>
                  {item.activity?.title_zh && (
                    <p className="helper" lang="ja">
                      {item.title}
                    </p>
                  )}
                  <p className="review-reason">
                    <strong>待办原因：</strong>
                    {reason}
                  </p>
                  {missing && (
                    <p className="source-note">
                      本轮未取得该公告正文；可能是来源失败、尚未处理或未覆盖。需重新取得原文后继续核实。
                    </p>
                  )}
                  <p className="helper">
                    最近取得正文：{time(item.last_seen_at)}（日本时间）
                  </p>
                  {!!item.image_readings?.length && (
                    <p className="helper">
                      另有 {item.image_readings.length}{" "}
                      份图片译文需对照原图核实，不用于确认活动日期。
                    </p>
                  )}
                  <details>
                    <summary>查看现有摘要与原文依据</summary>
                    <p>{item.activity?.summary_zh || "尚无中文摘要。"}</p>
                    {item.activity?.rules.map((rule, i) => (
                      <div className="booking-rule" key={i}>
                        <strong>{rule.title}</strong>
                        <p>{rule.text_zh}</p>
                        <blockquote lang="ja">{rule.evidence_ja}</blockquote>
                      </div>
                    ))}
                    {!item.activity?.rules.length && (
                      <p className="helper">尚无已提取的参与规则依据。</p>
                    )}
                  </details>
                  <a
                    className="text-link"
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    对照官方原文 <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </article>
              ))}
          </div>
          {!filtered.length && (
            <div className="panel review-empty">
              <CheckCircle2 aria-hidden="true" />
              <h3>
                {pending.length
                  ? "没有符合筛选条件的待办"
                  : "当前保留公告没有待审核事项"}
              </h3>
              <p>
                {pending.length
                  ? "试试其他来源、阶段或关键词。"
                  : "这不代表所有官方活动都已收录，请同时检查来源状态。"}
              </p>
              {pending.length > 0 && (
                <button className="button secondary" onClick={clearFilters}>
                  清除筛选
                </button>
              )}
            </div>
          )}
          {filtered.length > limit && (
            <button
              className="button secondary"
              onClick={() => setLimit(limit + 15)}
            >
              加载更多待办
            </button>
          )}
          <aside className="source-review-help panel">
            <h3>如何继续审核</h3>
            <p>
              对照官方原文核实日期、场地与参加规则，再通过现有维护流程处理。此面板只展示公共状态，不能直接通过审核。
            </p>
            <p className="helper">
              已核实的记录仍需通过正文指纹、原句证据及发布前校验。信息缺失时继续保留待办。
            </p>
            <a
              className="text-link"
              href="https://github.com/Aobamoca0530/OshiTrip-Website/blob/main/oshitrip/docs/official-news-workflow.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看维护流程 ↗
            </a>
          </aside>
        </section>
      )}
    </div>
  );
}
