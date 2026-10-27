import { describe, it, expect, vi } from "vitest";
import {
  candidateSchema,
  discoverToReview,
  fingerprint,
  type SourceAdapter,
} from "../../src/lib/ingestion";
const sample = {
  source_url: "https://www.sweets-paradise.jp/collaboration/ournotes",
  title_ja: "BanG Dream! Our Notes × SWEETS PARADISE",
  franchise_ids: ["our-notes"],
  venues: [{ city: null, name: null, start_date: null, end_date: null }],
  method: null,
  opens_at: null,
  closes_at: null,
  conditions: [],
};
const makeSink = () => ({
  start: vi.fn(async () => "run"),
  enqueue: vi.fn(async () => {}),
  finish: vi.fn(async () => {}),
});
const adapter: SourceAdapter = {
  name: "unit-test-only",
  policy: {
    permission: "approved",
    terms_url: "https://example.org/terms",
    robots_checked_at: "2026-10-25",
    authorization_note: "isolated test fixture",
  },
  discover: async () => [sample],
};
describe("discovery never auto-publishes", () => {
  it("keeps unknown fields null and fingerprint deterministic", () => {
    expect(candidateSchema.parse(sample).venues[0].city).toBeNull();
    expect(fingerprint(sample)).toBe(fingerprint(sample));
  });
  it("unreviewed adapter makes zero requests", async () => {
    const sink = makeSink();
    const discover = vi.fn(async () => []);
    await discoverToReview(
      {
        ...adapter,
        discover,
        policy: { ...adapter.policy, permission: "unreviewed" },
      },
      sink,
    );
    expect(discover).not.toHaveBeenCalled();
    expect(sink.finish).toHaveBeenCalledWith(
      "run",
      "blocked",
      expect.any(String),
    );
  });
  it("approved output goes to review only", async () => {
    const sink = makeSink();
    await discoverToReview(adapter, sink);
    expect(sink.enqueue).toHaveBeenCalledWith(sample, expect.any(String));
    expect(sink.finish).toHaveBeenCalledWith("run", "success");
  });
  it("invalid extraction produces a failure log without enqueueing", async () => {
    const sink = makeSink();
    await discoverToReview(
      {
        ...adapter,
        discover: async () => [{ ...sample, source_url: "javascript:bad" }],
      },
      sink,
    );
    expect(sink.enqueue).not.toHaveBeenCalled();
    expect(sink.finish).toHaveBeenCalledWith(
      "run",
      "failed",
      expect.any(String),
    );
  });
});
