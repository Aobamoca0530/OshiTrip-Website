import { describe, it, expect, vi } from "vitest";
import seed from "../../src/data/catalog.json";
import sources from "../../scripts/crawler/sources.json";
import { catalogSchema, eventSchema } from "../../src/lib/schema";
import {
  filterEvents,
  reservationWindow,
  venueBenefits,
  roundStatus,
} from "../../src/lib/domain";
import {
  allowedUrl,
  discoverLinks,
  extractObservation,
  crawlSource,
  observationFingerprint,
} from "../../scripts/crawler/core.mjs";
const catalog = catalogSchema.parse(seed);
const now = new Date("2026-10-28T12:00:00+09:00");
const get = (id: string) => catalog.events.find((e) => e.id === id)!;
const source = sources.find((s) => s.id === "nijigasaki-news")!;
const url = "https://www.lovelive-anime.jp/nijigasaki/detail.php?p=01_6703";
describe("Nijigasaki discovery, scoped benefits and official evidence", () => {
  it("never matches Loft's closed New Year dates or the expired Volks popup", () => {
    for (const date of ["2026-12-31", "2027-01-01"])
      expect(
        filterEvents(
          catalog.events,
          catalog.franchises,
          {
            ip: "nijigasaki",
            city: "大阪",
            start: date,
            end: date,
            category: "快闪店",
          },
          now,
        ),
      ).toEqual([]);
    expect(
      filterEvents(
        catalog.events,
        catalog.franchises,
        {
          ip: "nijigasaki",
          city: "大阪",
          start: "2027-01-02",
          end: "2027-01-02",
          benefits: true,
        },
        now,
      ).map((m) => m.venue.id),
    ).toEqual(["niji-loft-namba-jan"]);
    expect(
      filterEvents(
        catalog.events,
        catalog.franchises,
        { ip: "nijigasaki" },
        now,
      ).some((m) => m.event.id === "nijigasaki-volks-2026"),
    ).toBe(false);
  });
  it("uses the corrected opening and previous-day JST cutoff only for the first four HEP dates", () => {
    const hep = get("lovelive-hep-navio-2026"),
      r = hep.venues[0].rounds[0];
    expect(reservationWindow(r, "2026-11-05")).toMatchObject({
      opens: "2026-10-27T20:00:00+09:00",
      closes: "2026-11-04T23:59:00+09:00",
    });
    expect(
      roundStatus(r, new Date("2026-11-04T23:59:00+09:00"), "2026-11-05"),
    ).toBe("closed");
    expect(reservationWindow(r).closes).toBeNull();
    const matches = filterEvents(
      [hep],
      catalog.franchises,
      { start: "2026-11-09", end: "2026-11-09" },
      now,
    );
    expect(matches.map((m) => m.venue.id)).toEqual(["niji-hep-later"]);
    expect(matches[0].venue.rounds[0].opens_at).toBeNull();
  });
  it("separates full-cafe merchandise bonuses from Stand drink gifts", () => {
    const e = get("lovelive-gigo-card-phase6-2026");
    expect(
      venueBenefits(e, e.venues[0], "2026-10-28", "2026-10-28"),
    ).toHaveLength(2);
    for (const v of e.venues.slice(1))
      expect(venueBenefits(e, v).map((b) => b.id)).toEqual([
        "niji-gigo-coaster",
      ]);
    expect(e.venues.some((v) => v.name.includes("岡山"))).toBe(false);
    expect(venueBenefits(e, e.venues[0], "2026-11-09", "2026-11-09")).toEqual(
      [],
    );
  });
  it("preserves unknown thresholds and three-drink purchase rules", () => {
    const sweet = get("nijigasaki-sweet-collection-2027");
    expect(sweet.benefits![0].threshold_yen).toBeNull();
    expect(sweet.venues.some((v) => v.name.includes("三宮"))).toBe(false);
    const drink = get("nijigasaki-kitchen-7th-2026").benefits![0];
    expect(drink.threshold_quantity).toBe(3);
    expect(drink.threshold_yen).toBeNull();
    expect(drink.rule).toContain("至少含 1 杯");
    expect(
      filterEvents(
        [get("lovelive-hep-navio-2026")],
        catalog.franchises,
        { benefits: true },
        now,
      ),
    ).toEqual([]);
  });
  it("rejects published benefits without evidence or belonging to another venue", () => {
    const e = get("nijigasaki-loft-2026");
    for (const patch of [
      { checked_on: null },
      { source_url: "https://example.com/" },
      { venue_ids: ["unrelated-store"] },
    ])
      expect(
        eventSchema.safeParse({
          ...e,
          benefits: [{ ...e.benefits![0], ...patch }],
        }).success,
      ).toBe(false);
  });
  it("restricts PHP query parameters and discovers only real detail links", () => {
    expect(allowedUrl(url, source)).toBe(true);
    for (const u of [
      url + "&p=01_3",
      url + "&redirect=https://evil.test/",
      url + "#x",
      url.replace("01_6703", "../../secret"),
      url.replace("www.lovelive-anime.jp", "evil.test"),
      "https://www.lovelive-anime.jp/nijigasaki/detail.php",
    ])
      expect(allowedUrl(u, source)).toBe(false);
    expect(
      discoverLinks(
        '<a href="detail.php?p=01_6703">活動</a><a href="topics.php">目次</a><a href="detail.php?p=01_6703&amp;x=1">extra</a>',
        source,
      ),
    ).toEqual([url]);
  });
  it("extracts the actual article, gift evidence and PHP images without nav/share content", () => {
    const html =
      '<header><h1>ニュース</h1></header><article><h5>サイトメニュー</h5></article><article><div class="newsbox"><h5>テスト用公式活動</h5><p>' +
      "開催期間の説明です。".repeat(20) +
      '</p><p>3,000円（税込）ごとに特典をプレゼント。レシート合算不可。</p><img src="module/image.php?img_path=/lovelive/jp/news/2026/10/15/1002/aaa/bbb.jpeg"><a href="https://x.com/LoveLive_staff">公式SNS</a><a href="https://twitter.com/intent/tweet">share</a></div></article><footer><img src="/assets/unrelated.jpg"></footer>';
    const o = extractObservation(html, url, "event-source");
    expect(o.title).toBe("テスト用公式活動");
    expect(o.images).toHaveLength(1);
    expect(o.images[0].url).toContain("/nijigasaki/module/image.php?img_path=");
    expect(o.benefit_mentions[0]).toContain("合算不可");
    expect(o.social_links).toEqual(["https://x.com/LoveLive_staff"]);
    expect(o).not.toHaveProperty("threshold_yen");
    expect(observationFingerprint(o)).not.toBe(
      observationFingerprint(
        extractObservation(
          html.replace("bbb.jpeg", "ccc.jpeg"),
          url,
          "event-source",
        ),
      ),
    );
    expect(() => extractObservation("<h1>403 Forbidden</h1>", url)).toThrow();
  });
  it("does not send requests when automated access has not been cleared", async () => {
    const fetcher = vi.fn();
    expect((await crawlSource(source, { fetcher })).status).toBe("blocked");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
