import { describe, it, expect } from "vitest";
import products from "../../src/data/releases.json";
import branches from "../../src/data/stores.json";
import { releasesSchema } from "../../src/lib/releases";
import {
  tripProducts,
  storeOptions,
  storesSchema,
  windowOverlaps,
  deadlineInTrip,
  mapUrl,
} from "../../src/lib/shopping";
import type { Trip } from "../../src/lib/schema";
const ps = releasesSchema.parse(products),
  stores = storesSchema.parse(branches);
const my = ps.find((p) => p.id === "mygo-setensai")!,
  ave = ps.find((p) => p.id === "ave-mujica-kami-no-na-wo")!,
  yume = ps.find((p) => p.id === "yumemita-seizon-no-arasuji")!;
const trip: Trip = {
  start: "2026-11-09",
  end: "2026-11-23",
  stays: [
    { id: "nagoya", city: "名古屋", start: "2026-11-09", end: "2026-11-10" },
    { id: "osaka", city: "大阪", start: "2026-11-11", end: "2026-11-23" },
  ],
  plans: [],
  venue_ids: [],
};
describe("trip shopping and honest branch directory", () => {
  it("uses individual city stays and release day inclusively", () => {
    const result = storeOptions(my, stores, "cd", trip);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.store.city === "大阪")).toBe(true);
    expect(result[0].visits).toEqual([
      { start: "2026-11-11", end: "2026-11-23" },
    ]);
  });
  it("does not borrow normal edition channels for online-only special editions", () => {
    expect(storeOptions(ave, stores, "special", trip)).toHaveLength(0);
    expect(storeOptions(ave, stores, "cd", trip).length).toBeGreaterThan(0);
  });
  it("keeps old products with ongoing lotteries and separates preorder-only book", () => {
    const matched = tripProducts(ps, trip);
    expect(matched.find((m) => m.product.id === yume.id)).toBeDefined();
    const book = matched.find(
      (m) => m.product.id === "bushiroad-20th-anniversary-book",
    )!;
    expect(book.preorderOnly).toBe(true);
    expect(storeOptions(book.product, stores, "book", trip)).toHaveLength(0);
    expect(matched.map((m) => m.product.release_on)).toEqual(
      matched.map((m) => m.product.release_on).sort(),
    );
  });
  it("does not consider unknown bounds open and respects midnight deadline", () => {
    const w = { opens_on: null, opens_at: null, closes_at: null, note: "" };
    expect(windowOverlaps(w, trip.start, trip.end)).toBe(false);
    const end = {
      ...w,
      closes_at: "2026-11-09T00:00:00+09:00",
      opens_at: "2026-11-01T12:00:00+09:00",
    };
    expect(windowOverlaps(end, trip.start, trip.end)).toBe(false);
    expect(deadlineInTrip(end, trip.start, trip.end)).toBe(true);
  });
  it("clips visits at last applicable lottery date, rejects closed lotteries and invalid trips", () => {
    const p = structuredClone(yume);
    p.lotteries = [p.lotteries[0]];
    const options = storeOptions(p, stores, "cd", {
      ...trip,
      stays: [{ id: "a", city: "大阪", start: trip.start, end: trip.end }],
    });
    expect(options[0].visits[0].end).toBe("2026-11-09");
    expect(
      tripProducts([p], { ...trip, start: "2026-11-10", stays: [] }),
    ).toHaveLength(0);
    expect(
      storeOptions(my, stores, "cd", { ...trip, end: "2026-11-01" }),
    ).toHaveLength(0);
  });
  it("only published verified branches and safe map queries are offered", () => {
    expect(stores).toHaveLength(10);
    expect(
      storesSchema.safeParse([{ ...stores[0], checked_on: null }]).success,
    ).toBe(false);
    expect(
      storeOptions(my, [{ ...stores[0], status: "archived" }], "cd"),
    ).toHaveLength(0);
    expect(new URL(mapUrl(stores[0])).searchParams.get("query")).toContain(
      stores[0].address,
    );
  });
});
