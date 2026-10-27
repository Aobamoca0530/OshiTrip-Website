import { describe, it, expect } from "vitest";
import seed from "../../src/data/catalog.json";
import { catalogSchema, eventSchema } from "../../src/lib/schema";
import { filterEvents, groupMatches } from "../../src/lib/domain";
const catalog = catalogSchema.parse(seed);
const sweets = catalog.events.find((e) => e.id === "ournotes-sweets-2026")!;
describe("event collections and image-backed rules", () => {
  it("groups nine venues once and only includes matching city/date venues", () => {
    const all = groupMatches(
      sweets.venues.map((venue) => ({ event: sweets, venue })),
    );
    expect(all).toHaveLength(1);
    expect(all[0].venues).toHaveLength(9);
    const matches = filterEvents(
      [sweets],
      catalog.franchises,
      { city: "京都", start: "2026-11-23", end: "2026-11-23" },
      new Date("2026-10-28"),
    );
    expect(groupMatches(matches)[0].venues.map((v) => v.city)).toEqual([
      "京都",
    ]);
    expect(
      groupMatches(
        filterEvents(
          [sweets],
          catalog.franchises,
          { city: "京都", start: "2026-11-24" },
          new Date("2026-10-28"),
        ),
      ),
    ).toEqual([]);
  });
  it("preserves separate sessions and removes duplicate matches", () => {
    const matches = sweets.venues.map((venue) => ({ event: sweets, venue }));
    expect(groupMatches([...matches, matches[0]])[0].venues).toHaveLength(9);
  });
  it("requires source, review date, associated image and content fingerprint for publication", () => {
    const base = structuredClone(sweets),
      r = base.translated_rules!.find((r) => r.image_url)!;
    r.checked_on = null;
    expect(eventSchema.safeParse(base).success).toBe(false);
    r.checked_on = "2026-10-28";
    r.image_sha256 = null;
    expect(eventSchema.safeParse(base).success).toBe(false);
    r.image_sha256 = "a".repeat(64);
    r.image_url = "https://example.com/wrong.jpg";
    expect(eventSchema.safeParse(base).success).toBe(false);
  });
  it("separates food total, refill limits, hot drink groups, coaster groups and product inclusion", () => {
    const rules = sweets.translated_rules!;
    expect(rules.find((r) => r.id === "sweets-ordering")!.text_zh).toContain(
      "餐食与甜点合计最多 5 份",
    );
    expect(rules.find((r) => r.id === "sweets-ordering")!.text_zh).toContain(
      "每轮加点每人最多 5 杯",
    );
    expect(rules.find((r) => r.id === "sweets-drink")!.text_zh).toContain(
      "A 组 10 款",
    );
    expect(rules.find((r) => r.id === "sweets-coaster")!.text_zh).toContain(
      "A 组共 12 款",
    );
    expect(
      sweets.benefits!.find((b) => b.id === "sweets-pasta-sticker")!.rule,
    ).toContain("不是全店满额赠品");
  });
});
