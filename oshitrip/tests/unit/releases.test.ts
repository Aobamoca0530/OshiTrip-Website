import { describe, expect, it } from "vitest";
import seed from "../../src/data/releases.json";
import events from "../../src/data/catalog.json";
import {
  releasesSchema,
  releaseSchema,
  salesWindowSchema,
  windowStatus,
  japanTimestamp,
} from "../../src/lib/releases";
import { catalogSchema } from "../../src/lib/schema";
import { filterEvents, roundStatus } from "../../src/lib/domain";
const products = releasesSchema.parse(seed);
const now = new Date("2026-10-28T12:00:00+09:00");
const book = products.find((p) => p.id === "bushiroad-20th-anniversary-book")!;
const my = products.find((p) => p.id === "mygo-setensai")!;
const ave = products.find((p) => p.id === "ave-mujica-kami-no-na-wo")!;
describe("official release snapshot relationships", () => {
  it("separates the book preorder cutoff from unannounced live lottery", () => {
    expect(book.release_on).toBe("2027-01-08");
    expect(book.editions[0].price_yen).toBe(1760);
    const kad = book.offers.find((o) => o.retailer.includes("角川"))!;
    expect(kad.preorder.closes_at).toBe("2026-11-15T23:59:00+09:00");
    expect(windowStatus(kad.preorder, now)).toBe("unknown");
    expect(
      windowStatus(
        book.lotteries[0].window,
        new Date("2027-01-08T12:00:00+09:00"),
      ),
    ).toBe("unknown");
    expect(book.lotteries[0].live_dates).toEqual(["2027-06-12", "2027-06-13"]);
  });
  it("does not close product orders or live lotteries when MyGO bonus window ends", () => {
    expect(windowStatus(my.campaigns[0].window, now)).toBe("closed");
    expect(
      my.offers.every((o) => windowStatus(o.preorder, now) === "unknown"),
    ).toBe(true);
    expect(windowStatus(my.lotteries[0].window, now)).toBe("unknown");
    expect(my.campaigns[0].retailers).not.toContain("あみあみ");
    expect(my.offers.some((o) => o.retailer === "あみあみ")).toBe(true);
  });
  it("preserves edition-specific bonuses and special edition restrictions", () => {
    expect(
      ave.offers
        .filter((o) => o.edition_ids.includes("special"))
        .map((o) => o.retailer),
    ).toEqual(["ブシロード オンラインストア"]);
    expect(
      ave.offers.find(
        (o) => o.retailer === "ゲーマーズ" && o.edition_ids.includes("cd"),
      )?.bonus,
    ).toContain("56mm徽章");
    expect(
      my.offers.find(
        (o) => o.retailer === "ゲーマーズ" && o.edition_ids.includes("cd"),
      )?.bonus,
    ).not.toContain("徽章");
  });
  it("keeps 20th live discoverable by Yokohama date and unknown application status", () => {
    const c = catalogSchema.parse(events);
    const matches = filterEvents(
      c.events,
      c.franchises,
      { city: "横滨", start: "2027-06-12", end: "2027-06-12" },
      now,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].event.slug).toBe(book.lotteries[0].event_slug);
    expect(roundStatus(matches[0].venue.rounds[0], now)).toBe("unannounced");
    expect(
      filterEvents(
        c.events,
        c.franchises,
        { city: "横滨", start: "2027-06-14", end: "2027-06-14" },
        now,
      ),
    ).toHaveLength(0);
  });
  it("rejects dangling edition and source references and unverified publication", () => {
    const wrong = structuredClone(book);
    wrong.offers[0].edition_ids = ["missing"];
    expect(releaseSchema.safeParse(wrong).success).toBe(false);
    const source = structuredClone(book);
    source.lotteries[0].source_url = "https://example.com";
    expect(releaseSchema.safeParse(source).success).toBe(false);
    const unchecked = structuredClone(book);
    unchecked.sources[0].checked_on = null;
    expect(releaseSchema.safeParse(unchecked).success).toBe(false);
  });
});
describe("precise independent JST windows", () => {
  const w = {
    opens_on: null,
    opens_at: "2026-11-01T12:00:00+09:00",
    closes_at: "2026-11-15T23:59:00+09:00",
    note: "",
  };
  it("respects opening and deadline boundaries across UTC", () => {
    expect(windowStatus(w, new Date("2026-11-01T02:59:59Z"))).toBe("upcoming");
    expect(windowStatus(w, new Date("2026-11-01T03:00:00Z"))).toBe("open");
    expect(windowStatus(w, new Date("2026-11-15T14:58:59Z"))).toBe("open");
    expect(windowStatus(w, new Date("2026-11-15T14:59:00Z"))).toBe("closed");
    expect(windowStatus(w, new Date("2026-11-15T14:59:01Z"))).toBe("closed");
    expect(japanTimestamp(w.closes_at)).toBe("2026-11-15 23:59");
  });
  it("does not invent an opening hour on a date-only announcement", () => {
    const day = { ...w, opens_on: "2026-11-01", opens_at: null };
    expect(windowStatus(day, new Date("2026-10-31T12:00:00+09:00"))).toBe(
      "upcoming",
    );
    expect(windowStatus(day, new Date("2026-11-01T20:00:00+09:00"))).toBe(
      "unknown",
    );
    expect(windowStatus(day, new Date("2026-11-02T00:00:00+09:00"))).toBe(
      "open",
    );
  });
  it("rejects backwards windows and invalid dates", () => {
    expect(
      salesWindowSchema.safeParse({
        ...w,
        closes_at: "2026-10-01T00:00:00+09:00",
      }).success,
    ).toBe(false);
    expect(
      salesWindowSchema.safeParse({
        ...w,
        opens_on: "2026-02-30",
        opens_at: null,
      }).success,
    ).toBe(false);
  });
});
