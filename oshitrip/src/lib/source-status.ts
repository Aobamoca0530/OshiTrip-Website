import { z } from "zod";
import type { Announcement } from "./announcements";

const date = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
const publicUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
  );
});
export const sourceStateLabels = {
  success: "采集完成",
  partial: "部分完成",
  empty: "未发现候选",
  failed: "读取失败",
  blocked: "采集已停止",
  disabled: "未启用",
  unknown: "暂无报告",
};
export const sourceStatusSchema = z.object({
  checked_at: date.nullable(),
  sources: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        name: z.string().min(1).max(100),
        url: publicUrl,
        state: z.enum([
          "success",
          "partial",
          "empty",
          "failed",
          "blocked",
          "disabled",
          "unknown",
        ]),
        last_attempt_at: date.nullable(),
        last_success_at: date.nullable(),
        pages: count.nullable(),
        discovered: count.nullable(),
        deferred: count.nullable(),
        retained: count,
        issues: z.array(z.string().max(200)).max(10),
      }),
    )
    .max(50),
  unread_announcement_ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(500),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export const emptySourceStatus: SourceStatus = {
  checked_at: null,
  sources: [],
  unread_announcement_ids: [],
};

const names: Record<string, string> = {
  "bang-dream-live": "BanG Dream! Live / Event",
  "bang-dream-news": "BanG Dream! 新闻",
  "bushiroad-creative": "Bushiroad Creative",
  "nijigasaki-news": "虹咲官网新闻",
  "starlight-news": "少女歌剧新闻",
  "starlight-events": "少女歌剧 Live / Event",
  "sweets-paradise": "SWEETS PARADISE",
  "team-e-nijigasaki": "虹咲 POP UP · TEAM Entertainment",
  "hasunosora-official": "莲之空 · 新闻与 Live",
  "liella-official": "Liella! · 新闻与 Live",
  "aqours-official": "Aqours · 新闻与 Live",
  "muse-official": "μ's · 新闻与演出",
  "ikizulive-official": "人生不易部 · 新闻与 Live",
  "lovelive-series-live": "Love Live! 跨企划演出",
  "gakuen-idolmaster-live": "学园偶像大师 · 官方巡演",
  "gakuen-idolmaster-news": "学园偶像大师 · 厂牌新闻",
  "gakuen-idolmaster-portal": "学园偶像大师 · 综合门户新闻",
};

// Only known diagnostic categories leave the worker. Never forward raw errors,
// response bodies, headers, provider configuration, or assistant-queue proposals.
export function publicIssues(errors: string[]) {
  return [
    ...new Set(
      errors.map((error) => {
        const http = error.match(/\bHTTP ([1-5]\d{2})\b/)?.[1];
        if (http) return `HTTP ${http}：本次未能读取页面，原因尚待确认。`;
        if (/robots/i.test(error)) return "访问规则未通过核实，已停止采集。";
        if (/许可|批准范围/.test(error))
          return "来源访问范围尚未确认，已停止采集。";
        if (/timeout|timed out|超时/i.test(error))
          return "读取超时，保留已有资料。";
        return "读取或解析失败，详细诊断保留在维护报告中。";
      }),
    ),
  ].slice(0, 10);
}

const reportSchema = z.object({
  checked_at: date,
  sources: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      pages: count.optional(),
      discovered: count.optional(),
      deferred_urls: z.array(z.string()).optional(),
      errors: z.array(z.string()).default([]),
    }),
  ),
});

export function buildSourceStatus(input: {
  report: unknown;
  sources: {
    id: string;
    origin: string;
    index_url?: string | null;
    kind?: string;
  }[];
  enabled: string[];
  announcements: Announcement[];
  observedUrls: string[];
  previous?: SourceStatus;
}): SourceStatus {
  const report = reportSchema.parse(input.report);
  const old = input.previous || emptySourceStatus;
  // Replays retain the crawl timestamp; out-of-order reports cannot roll it back.
  if (
    old.checked_at &&
    Date.parse(old.checked_at) > Date.parse(report.checked_at)
  )
    throw new Error("来源报告早于已保存的状态，不能覆盖较新的采集记录。");
  const seen = new Set(input.observedUrls);
  const sources = input.sources
    .filter((s) => input.enabled.includes(s.id) || s.kind === "event-source")
    .map((source) => {
      const row = report.sources.find((s) => s.id === source.id);
      const previous = old.sources.find((s) => s.id === source.id);
      const active = input.enabled.includes(source.id);
      const pages = row?.pages ?? null;
      const discovered = row?.discovered ?? null;
      const deferred = row ? (row.deferred_urls?.length ?? 0) : null;
      let state: SourceStatus["sources"][number]["state"] = "unknown";
      if (!active) state = "disabled";
      else if (row) {
        if (row.status === "success" && !row.errors.length) {
          state = deferred
            ? "partial"
            : pages === 0 && discovered === 0
              ? "empty"
              : "success";
        } else if (pages && pages > 0) state = "partial";
        else state = row.status === "blocked" ? "blocked" : "failed";
      }
      const complete = active && (state === "success" || state === "empty");
      return {
        id: source.id,
        name: names[source.id] || source.id,
        url: source.index_url || source.origin,
        state,
        last_attempt_at:
          active && row
            ? report.checked_at
            : (previous?.last_attempt_at ?? null),
        last_success_at: complete
          ? report.checked_at
          : (previous?.last_success_at ?? null),
        pages: active ? pages : null,
        discovered: active ? discovered : null,
        deferred: active ? deferred : null,
        retained: input.announcements.filter(
          (a) => a.source_id === source.id && !seen.has(a.source_url),
        ).length,
        issues: active && row ? publicIssues(row.errors) : [],
      };
    });
  return sourceStatusSchema.parse({
    checked_at: report.checked_at,
    sources,
    unread_announcement_ids: input.announcements
      .filter((a) => !seen.has(a.source_url))
      .map((a) => a.id),
  });
}

export function sourceStatusIsStale(status: SourceStatus, now: string) {
  return (
    !status.checked_at ||
    Date.parse(now) - Date.parse(status.checked_at) > 36 * 3600 * 1000
  );
}

export function reviewItems(items: Announcement[], status: SourceStatus) {
  const unread = new Set(status.unread_announcement_ids);
  return (
    items
      // The collector validates the body fingerprint before setting activity.state.
      // announcement.content_hash also includes title/images and is not comparable
      // to activity.source_hash (body only).
      .filter((item) => item.activity?.state !== "ready")
      .map((item) => {
        return {
          item,
          stage:
            !item.activity || item.activity.state === "translation_pending"
              ? ("translation" as const)
              : ("review" as const),
          missing: unread.has(item.id),
          reason: item.activity?.reason || "等待对照官方原文翻译与审核。",
        };
      })
      .sort(
        (a, b) =>
          Number(b.missing) - Number(a.missing) ||
          b.item.changed_at.localeCompare(a.item.changed_at),
      )
  );
}
