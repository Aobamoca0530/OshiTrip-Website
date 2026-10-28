import { describe, expect, it } from "vitest";
import seed from "../../src/data/catalog.json";
import products from "../../src/data/releases.json";
import { catalogSchema, eventSchema } from "../../src/lib/schema";
import { releasesSchema } from "../../src/lib/releases";
import { descendants, filterEvents } from "../../src/lib/domain";
import {
  extractImageCandidates,
  extractObservation,
  observationFingerprint,
  discoverLinks,
} from "../../scripts/crawler/core.mjs";
const catalog = catalogSchema.parse(seed);
const url = "https://bang-dream.com/news/2441/";
describe("official media and extended discovery", () => {
  it("validates the complete catalog, image attribution and band references", () => {
    expect(catalog.events.length).toBeGreaterThanOrEqual(16);
    expect(catalog.events.flatMap((e) => e.venues).length).toBeGreaterThanOrEqual(59);
    expect(catalog.events.filter((e) => e.image).length).toBeGreaterThanOrEqual(14);
    const bands = [
      "poppin-party",
      "afterglow",
      "pastel-palettes",
      "roselia",
      "hello-happy-world",
      "morfonica",
      "raise-a-suilen",
      "yumemita",
      "mygo",
      "ave-mujica",
      "millsage",
      "ikka-dumb-rock",
    ];
    const ids = descendants("bang-dream", catalog.franchises);
    for (const band of bands) expect(ids.has(band)).toBe(true);
    expect(
      releasesSchema
        .parse(products)
        .every((p) => p.images?.some((i) => i.kind === "cover")),
    ).toBe(true);
  });
  it("never publishes an unchecked or unattributed activity image", () => {
    const event = catalog.events.find((e) => e.image)!;
    expect(
      eventSchema.safeParse({
        ...event,
        image: { ...event.image, checked_on: null },
      }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        ...event,
        image: { ...event.image, source_url: "https://example.com/unrelated/" },
      }).success,
    ).toBe(false);
    expect(eventSchema.safeParse({ ...event, image: null }).success).toBe(true);
  });
  it("keeps actual band membership and event end dates in expanded discovery", () => {
    const now = new Date("2026-10-28T12:00:00+09:00");
    const result = filterEvents(
      catalog.events,
      catalog.franchises,
      { ip: "mygo", city: "神户", start: "2026-11-14", end: "2026-11-14" },
      now,
    );
    expect(result.map((m) => m.event.id)).toEqual(
      expect.arrayContaining(["mygo-9th-kobe-2026", "ournotes-sweets-2026"]),
    );
    expect(
      filterEvents(catalog.events, catalog.franchises, { ip: "roselia" }, now),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ event: expect.objectContaining({ slug: 'roselia-10th-anniversary-live-tour' }) })]));
    expect(
      filterEvents(
        catalog.events,
        catalog.franchises,
        {},
        new Date("2026-11-02T12:00:00+09:00"),
      ).some((m) => m.event.id === "ave-virtus-store-2026"),
    ).toBe(false);
  });
  it("extracts lazy official images, skips scripts, footer graphics and unsafe hosts", () => {
    const html =
      '<main><p>活動主視覚</p><img src="placeholder.gif" data-src="/wordpress/wp-content/uploads/poster.jpg" alt="公式主視覚"><img src="/wordpress/wp-content/uploads/poster.jpg"><img src="https://evil.test/assets/tracker.png"><img src="data:image/png;base64,x"><footer><img src="/assets/footer.png"></footer></main>';
    expect(extractImageCandidates(html, url)).toEqual([
      {
        url: "https://bang-dream.com/wordpress/wp-content/uploads/poster.jpg",
        alt: "公式主視覚",
        context: "活動主視覚",
      },
    ]);
  });
  it("detects changed image URLs even when article wording stays the same", () => {
    const html =
      "<main><h1>解析テスト用イベント</h1><p>" +
      "開催場所と期間はテスト専用です。".repeat(12) +
      '</p><img src="/assets/a.jpg"></main>';
    const first = extractObservation(html, url, "event-source");
    const next = extractObservation(
      html.replace("a.jpg", "b.jpg"),
      url,
      "event-source",
    );
    expect(first.kind).toBe("event-source");
    expect(first).not.toHaveProperty("start_date");
    expect(observationFingerprint(first)).not.toBe(
      observationFingerprint(next),
    );
  });
  it("ignores a header logo heading and keeps per-retailer evidence separate", () => {
    const html =
      '<header><h1><img alt="Logo"></h1></header><h1>商品資料テスト</h1><p>' +
      "テスト用説明です。".repeat(20) +
      "</p><p>▼アニメイト</p><p>A特典</p><p>▼ゲーマーズ</p><p>B特典</p>";
    const observation = extractObservation(html, url);
    expect(observation.title).toBe("商品資料テスト");
    expect(observation.retailer_mentions).toEqual([
      "▼アニメイト A特典",
      "▼ゲーマーズ B特典",
    ]);
  });
  it("discovers news only inside the configured official path boundary", () => {
    expect(
      discoverLinks(
        '<a href="/news/2441/">活動</a><a href="https://evil.test/news/2/">外部</a><a href="/discographies/1/">CD</a>',
        {
          origin: "https://bang-dream.com",
          index_url: "https://bang-dream.com/news/",
          path_patterns: ["^/news/[0-9]+/$"],
        },
      ),
    ).toEqual([url]);
  });
});
