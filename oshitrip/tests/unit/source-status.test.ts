import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildSourceStatus,
  publicIssues,
  reviewItems,
  sourceStatusIsStale,
} from "../../src/lib/source-status";
import { announcementsSchema } from "../../src/lib/announcements";
import { catalogSchema } from "../../src/lib/schema";
import { storesSchema } from "../../src/lib/shopping";
import { releasesSchema } from "../../src/lib/releases";
import { makeDataBundle } from "../../src/lib/data-bundle";
import { maintenanceStages } from "../../scripts/crawler/workflow.mjs";
import announcements from "../../src/data/announcements.json";
import legacy from "../../../data/public-v3.json";

const stamp = "2026-10-28T01:17:00Z";
const first = announcementsSchema.parse(announcements)[0];
const item = { ...first, source_id: "test" };
const sources = [
  { id: "test", kind: "event-source", origin: "https://example.org" },
];
function build(
  status = "success",
  pages = 1,
  errors: string[] = [],
  deferred_urls: string[] = [],
) {
  return buildSourceStatus({
    report: {
      checked_at: stamp,
      sources: [
        { id: "test", status, pages, discovered: pages, errors, deferred_urls },
      ],
    },
    sources,
    enabled: ["test"],
    announcements: [item],
    observedUrls: pages ? [item.source_url] : [],
  });
}

describe("source status projection", () => {
  it('does not refresh another source timestamp during a scoped collection',()=>{
    const result=buildSourceStatus({report:{checked_at:'2026-10-29T12:00:00Z',sources:[{id:'test',checked_at:stamp,status:'success',pages:1,discovered:1}]},sources,enabled:['test'],announcements:[item],observedUrls:[item.source_url]});
    expect(result.sources[0].last_attempt_at).toBe(stamp);
    expect(result.sources[0].last_success_at).toBe(stamp);
    expect(maintenanceStages({sourceId:'liella-official'})[0][1]).toContain('--source=liella-official');
  });
  it("distinguishes successful empty results, total failures and partial coverage", () => {
    expect(build("success", 0).sources[0].state).toBe("empty");
    expect(build("failed", 0, ["HTTP 403"]).sources[0].state).toBe("failed");
    expect(build("failed", 1, ["HTTP 503"]).sources[0].state).toBe("partial");
    expect(
      build("success", 1, [], ["https://example.org/later"]).sources[0],
    ).toMatchObject({ state: "partial", deferred: 1, last_success_at: null });
    expect(build("blocked", 0, ["robots 未核实"]).sources[0].state).toBe(
      "blocked",
    );
  });
  it("keeps the previous success time after a failed crawl and never freshens it on replay", () => {
    const previous = build();
    const report = {
      checked_at: "2026-10-29T01:17:00Z",
      sources: [
        { id: "test", status: "failed", pages: 0, errors: ["HTTP 403"] },
      ],
    };
    const input = {
      report,
      sources,
      enabled: ["test"],
      announcements: [item],
      observedUrls: [],
      previous,
    };
    const failed = buildSourceStatus(input);
    expect(failed.sources[0]).toMatchObject({
      last_attempt_at: report.checked_at,
      last_success_at: stamp,
      retained: 1,
    });
    expect(failed.unread_announcement_ids).toEqual([item.id]);
    expect(buildSourceStatus({ ...input, previous: failed })).toEqual(failed);
    expect(() =>
      buildSourceStatus({
        ...input,
        previous: failed,
        report: { ...report, checked_at: stamp },
      }),
    ).toThrow(/早于/);
  });
  it("does not invent a successful timestamp when bootstrapping from a failure", () => {
    expect(build("failed", 0).sources[0].last_success_at).toBeNull();
  });
  it("does not count an absent report or disabled source as a successful empty result", () => {
    const input = {
      report: { checked_at: stamp, sources: [] },
      sources,
      announcements: [],
      observedUrls: [],
    };
    expect(
      buildSourceStatus({ ...input, enabled: ["test"] }).sources[0],
    ).toMatchObject({ state: "unknown", pages: null, last_attempt_at: null });
    expect(buildSourceStatus({ ...input, enabled: [] }).sources[0].state).toBe(
      "disabled",
    );
  });
  it("exports bounded diagnostic categories without leaking raw messages or credentials", () => {
    const issues = publicIssues([
      "HTTP 403 token=secret",
      "HTTP 403 body private",
      "C:/private/user API_KEY=private",
      "robots timeout",
    ]);
    expect(issues).toHaveLength(3);
    expect(JSON.stringify(issues)).not.toMatch(/secret|private|API_KEY|C:\//);
    expect(issues[0]).toContain("原因尚待确认");
  });
  it("marks older daily snapshots stale without changing the historical result", () => {
    const status = build();
    expect(sourceStatusIsStale(status, "2026-10-28T12:00:00Z")).toBe(false);
    expect(sourceStatusIsStale(status, "2026-10-30T00:00:00Z")).toBe(true);
    expect(status.sources[0].state).toBe("success");
  });
  it("counts incomplete activity evidence even when translation review was approved", () => {
    const status = build("failed", 0);
    const pending = {
      ...item,
      activity: {
        ...item.activity!,
        state: "needs_review" as const,
        source_hash: item.content_hash,
        reason: "日期未确定；已对照原文翻译并复核",
      },
    };
    expect(reviewItems([pending], status)).toMatchObject([
      { stage: "review", missing: true },
    ]);
    const ready = {
      ...pending,
      activity: { ...pending.activity, state: "ready" as const },
    };
    expect(reviewItems([ready], status)).toEqual([]);
    // Announcement hash covers title/images too; it is not a body hash.
    expect(
      reviewItems([{ ...ready, content_hash: "f".repeat(64) }], status),
    ).toEqual([]);
    expect(
      reviewItems(
        [
          {
            ...ready,
            activity: { ...ready.activity, state: "translation_pending" },
          },
        ],
        status,
      )[0].stage,
    ).toBe("translation");
  });
  it("prepares the projection before the shared bundle and all validation stages", () => {
    expect(
      maintenanceStages()
        .slice(0, 5)
        .map((row) => row[0]),
    ).toEqual(["collect", "check-browser-collection", "prepare-source-status", "prepare-ticket-products", "prepare-public-data"]);
  });
  it("preserves the v3 parsed-schema checksum for older clients, while v4 includes status", () => {
    const data = {
      catalog: catalogSchema.parse(legacy.data.catalog),
      releases: releasesSchema.parse(legacy.data.releases),
      stores: storesSchema.parse(legacy.data.stores),
      announcements: announcementsSchema.parse(legacy.data.announcements),
    };
    expect(legacy.formatVersion).toBe(3);
    expect(
      createHash("sha256").update(JSON.stringify(data)).digest("hex"),
    ).toBe(legacy.revision);
    expect(legacy.data).not.toHaveProperty("monitoring");
    const v4 = makeDataBundle({ ...data, monitoring: build() }, stamp);
    expect(v4.formatVersion).toBe(4);
    expect(v4.data.monitoring.sources[0].state).toBe("success");
  });
});
