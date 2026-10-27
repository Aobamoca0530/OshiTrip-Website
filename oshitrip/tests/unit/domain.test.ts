import { describe, expect, it } from "vitest";
import seed from "../../src/data/catalog.json";
import {
  catalogSchema,
  eventSchema,
  tripSchema,
  type Round,
} from "../../src/lib/schema";
import {
  descendants,
  filterEvents,
  overlaps,
  reservationWindow,
  roundStatus,
  shiftDate,
  tokyoDate,
  tripMatches,
  venueStatus,
} from "../../src/lib/domain";
const all = catalogSchema.parse(seed);
// Keep the original cafe/anniversary boundary regression fixture stable.
const c = { ...all, events: all.events.slice(0, 2) };
const now = new Date("2026-10-25T12:00:00+09:00");
const find = (filters: Parameters<typeof filterEvents>[2]) =>
  filterEvents(c.events, c.franchises, filters, now);
const rolling = c.events[0].venues[0].rounds[0];
const fixed: Round = {
  ...rolling,
  kind: "fixed",
  opens_at: "2026-10-25T12:00:00+09:00",
  closes_at: "2026-10-26T20:00:00+09:00",
};
describe("real official snapshot and combined venue filters", () => {
  it("contains two verified events and preserves the nine cafe venues", () => {
    expect(c.events).toHaveLength(2);
    expect(c.events[0].venues).toHaveLength(9);
    expect(
      c.events[0].sources.some((s) =>
        s.url.startsWith("https://www.sweets-paradise.jp/"),
      ),
    ).toBe(true);
  });
  it("Osaka Nov 13–23 matches Umeda", () =>
    expect(
      find({ city: "大阪", start: "2026-11-13", end: "2026-11-23" }).map(
        (x) => x.venue.name,
      ),
    ).toEqual(["梅田店"]));
  it("Kyoto end date inclusive", () =>
    expect(
      find({ city: "京都", start: "2026-11-23", end: "2026-11-23" }),
    ).toHaveLength(1));
  it("Kyoto after end does not match", () =>
    expect(find({ city: "京都", start: "2026-11-24" })).toHaveLength(0));
  it("Kobe before start does not match", () =>
    expect(
      find({ city: "神户", start: "2026-11-01", end: "2026-11-09" }),
    ).toHaveLength(0));
  it("Kobe Nov 14 matches", () =>
    expect(find({ city: "神户", start: "2026-11-14" })).toHaveLength(1));
  it("Kobe start date inclusive", () =>
    expect(find({ city: "神户", start: "2026-11-10" })).toHaveLength(1));
  it("keeps venue-specific dates", () => {
    expect(find({ city: "广岛" })[0].venue.end_date).toBe("2026-11-19");
    expect(find({ city: "仙台" })[0].venue.start_date).toBe("2026-11-17");
  });
  it("combines all criteria on the same venue", () =>
    expect(
      find({
        ip: "our-notes",
        city: "大阪",
        category: "联动咖啡厅",
        start: "2026-11-13",
        end: "2026-11-23",
        method: "官方 App 预约",
        status: "open",
      }),
    ).toHaveLength(1));
  it("rejects wrong IP, category, city and method", () => {
    for (const f of [
      { ip: "nijigasaki" },
      { ip: "roselia" },
      { category: "快闪店" },
      { city: "福冈" },
      { method: "当日整理券" },
    ])
      expect(find(f)).toHaveLength(0);
  });
  it("parent includes subseries, not siblings", () => {
    expect(find({ ip: "bang-dream" })).toHaveLength(11);
    expect(descendants("mygo", c.franchises).has("our-notes")).toBe(false);
  });
  it("hides ended events by current Tokyo date unless history requested", () => {
    expect(
      filterEvents(
        c.events,
        c.franchises,
        { ip: "our-notes" },
        new Date("2026-11-30T00:00:00+09:00"),
      ),
    ).toHaveLength(0);
    expect(
      filterEvents(
        c.events,
        c.franchises,
        { history: true, ip: "our-notes" },
        new Date("2026-11-30T00:00:00+09:00"),
      ),
    ).toHaveLength(9);
  });
  it("rejects reversed and invalid date ranges", () => {
    expect(find({ start: "2026-11-20", end: "2026-11-01" })).toHaveLength(0);
    expect(find({ start: "garbage", status: "open" })).toHaveLength(0);
  });
  it("excludes draft and archived data", () => {
    expect(
      filterEvents(
        [{ ...c.events[0], status: "draft" }],
        c.franchises,
        {},
        now,
      ),
    ).toHaveLength(0);
  });
  it("sorts by venue start and calculated deadlines", () => {
    expect(find({})[0].venue.start_date).toBe("2026-11-02");
    expect(
      find({ sort: "deadline", start: "2026-11-02", end: "2026-11-29" })[0]
        .venue.start_date,
    ).toBe("2026-11-02");
  });
});
describe("Japan time and independent booking rules", () => {
  it("uses Tokyo day across UTC boundary", () =>
    expect(tokyoDate(new Date("2026-10-24T15:00:00Z"))).toBe("2026-10-25"));
  it("shifts dates across year and leap boundaries", () => {
    expect(shiftDate("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftDate("2024-03-01", -1)).toBe("2024-02-29");
  });
  it("does not invent rolling event-wide deadline", () =>
    expect(reservationWindow(rolling)).toEqual({
      opens: null,
      closes: null,
      openDate: null,
    }));
  it("calculates five-week rule and previous-day 20:00 deadline", () =>
    expect(reservationWindow(rolling, "2026-11-14")).toEqual({
      opens: null,
      openDate: "2026-10-10",
      closes: "2026-11-13T20:00:00+09:00",
    }));
  it("unknown without visit date or on opening day with unknown hour", () => {
    expect(roundStatus(rolling, now)).toBe("unknown");
    expect(
      roundStatus(rolling, new Date("2026-10-10T23:59:00+09:00"), "2026-11-14"),
    ).toBe("unknown");
  });
  it("rolling upcoming, open, exact cutoff and same-day closed", () => {
    expect(
      roundStatus(rolling, new Date("2026-10-09T23:59:00+09:00"), "2026-11-14"),
    ).toBe("upcoming");
    expect(
      roundStatus(rolling, new Date("2026-11-13T19:59:59+09:00"), "2026-11-14"),
    ).toBe("open");
    expect(
      roundStatus(rolling, new Date("2026-11-13T20:00:00+09:00"), "2026-11-14"),
    ).toBe("closed");
    expect(
      roundStatus(rolling, new Date("2026-11-14T00:00:00+09:00"), "2026-11-14"),
    ).toBe("closed");
  });
  it("fixed round exact opening and cutoff", () => {
    expect(roundStatus(fixed, new Date("2026-10-25T11:59:59+09:00"))).toBe(
      "upcoming",
    );
    expect(roundStatus(fixed, now)).toBe("open");
    expect(roundStatus(fixed, new Date("2026-10-26T20:00:00+09:00"))).toBe(
      "closed",
    );
  });
  it("keeps missing fixed timestamps unknown", () =>
    expect(roundStatus({ ...fixed, opens_at: null }, now)).toBe("unknown"));
  it("supports no reservation and unannounced independently", () => {
    expect(roundStatus({ ...fixed, kind: "none" }, now)).toBe("none");
    expect(roundStatus({ ...fixed, kind: "unannounced" }, now)).toBe(
      "unannounced",
    );
  });
  it("cancellation overrides booking state", () =>
    expect(
      venueStatus(
        { ...c.events[0], status: "cancelled" },
        c.events[0].venues[0],
        now,
        "2026-11-14",
      ),
    ).toBe("cancelled"));
  it("additional future round takes precedence over a closed one", () => {
    const venue = {
      ...c.events[0].venues[0],
      rounds: [
        { ...fixed, closes_at: "2026-10-24T20:00:00+09:00" },
        { ...fixed, opens_at: "2026-10-26T12:00:00+09:00" },
      ],
    };
    expect(venueStatus(c.events[0], venue, now)).toBe("upcoming");
  });
});
describe("trip and input validation", () => {
  const trip = {
    start: "2026-11-01",
    end: "2026-11-23",
    stays: [
      { id: "1", city: "名古屋", start: "2026-11-13", end: "2026-11-13" },
      { id: "2", city: "神户", start: "2026-11-14", end: "2026-11-15" },
      { id: "3", city: "大阪", start: "2026-11-16", end: "2026-11-23" },
    ],
    plans: [],
    venue_ids: [],
  };
  it("matches city-specific stays", () =>
    expect(
      tripMatches(c.events, c.franchises, trip, now).map((m) => m.venue.city),
    ).toEqual(["名古屋", "神户", "大阪"]));
  it("does not use whole trip range for Kobe", () =>
    expect(
      tripMatches(
        c.events,
        c.franchises,
        {
          ...trip,
          stays: [
            { id: "1", city: "神户", start: "2026-11-01", end: "2026-11-09" },
          ],
        },
        now,
      ),
    ).toHaveLength(0));
  it("deduplicates repeated city stays", () =>
    expect(
      tripMatches(
        c.events,
        c.franchises,
        { ...trip, stays: [trip.stays[0], trip.stays[0]] },
        now,
      ),
    ).toHaveLength(1));
  it("rejects city stay outside trip bounds", () =>
    expect(tripSchema.safeParse({ ...trip, end: "2026-11-14" }).success).toBe(
      false,
    ));
  it("rejects impossible calendar dates and unsafe links", () => {
    expect(
      eventSchema.safeParse({
        ...c.events[0],
        sources: [{ ...c.events[0].sources[0], url: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
    expect(tripSchema.safeParse({ ...trip, start: "2026-02-30" }).success).toBe(
      false,
    );
  });
  it("requires checked official source before publishing", () =>
    expect(
      eventSchema.safeParse({
        ...c.events[0],
        sources: c.events[0].sources.map((s) => ({ ...s, checked_at: null })),
      }).success,
    ).toBe(false));
  it("treats overlap boundaries inclusively", () => {
    expect(
      overlaps("2026-11-02", "2026-11-23", "2026-11-23", "2026-11-23"),
    ).toBe(true);
    expect(
      overlaps("2026-11-02", "2026-11-23", "2026-11-24", "2026-11-24"),
    ).toBe(false);
  });
});
