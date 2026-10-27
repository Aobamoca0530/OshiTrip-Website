import { z } from "zod";
import { dateSchema, tripSchema, urlSchema, type Trip } from "./schema";
import type { Release, SalesWindow } from "./releases";

export const storeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    retailer_id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    city: z.string().min(1),
    address: z.string().min(1),
    official_url: urlSchema,
    phone: z
      .string()
      .regex(/^[+\d -]+$/)
      .nullable(),
    stock_url: urlSchema.nullable(),
    stock_note: z.string().min(1),
    stock_source_url: urlSchema.nullable(),
    checked_on: dateSchema.nullable(),
    status: z.enum(["draft", "published", "archived"]),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .refine(
    (s) => s.status !== "published" || s.checked_on !== null,
    "公开门店前需要核实日期",
  );
export const storesSchema = z
  .array(storeSchema)
  .refine(
    (s) => new Set(s.map((x) => x.id)).size === s.length,
    "门店 ID 不可重复",
  );
export type Store = z.infer<typeof storeSchema>;
const midnight = (day: string) => Date.parse(`${day}T00:00:00+09:00`);
const nextDay = (day: string) => midnight(day) + 86400000;
const maxDay = (...days: string[]) => days.sort().at(-1)!;
// Date-only openings cannot confirm the first day's hours, so overlap starts on the following day.
export function windowOverlaps(w: SalesWindow, start: string, end: string) {
  const opens = w.opens_at
    ? Date.parse(w.opens_at)
    : w.opens_on
      ? nextDay(w.opens_on)
      : null;
  return (
    opens !== null &&
    w.closes_at !== null &&
    opens < nextDay(end) &&
    Date.parse(w.closes_at) > midnight(start)
  );
}
export function deadlineInTrip(w: SalesWindow, start: string, end: string) {
  return Boolean(
    w.closes_at &&
    Date.parse(w.closes_at) >= midnight(start) &&
    Date.parse(w.closes_at) < nextDay(end),
  );
}
export function liveRelevant(l: Release["lotteries"][number], start: string) {
  return (
    (!l.live_dates.length || l.live_dates.some((d) => d >= start)) &&
    (!l.window.closes_at || Date.parse(l.window.closes_at) > midnight(start))
  );
}
export type ShoppingMatch = {
  product: Release;
  lotteries: Release["lotteries"];
  reasons: string[];
  preorderOnly: boolean;
};
export function tripProducts(
  products: Release[],
  trip: Trip,
  lookbackDays = 30,
): ShoppingMatch[] {
  if (!tripSchema.safeParse(trip).success || !trip.start || !trip.end)
    return [];
  const earliest =
    lookbackDays < 0
      ? -Infinity
      : midnight(trip.start) - lookbackDays * 86400000;
  return products
    .flatMap((product) => {
      if (product.status !== "published") return [];
      const lotteries = product.lotteries.filter((l) =>
        liveRelevant(l, trip.start),
      );
      if (!lotteries.length) return [];
      const reasons: string[] = [];
      const issued = product.release_on && product.release_on <= trip.end;
      if (
        product.release_on &&
        issued &&
        midnight(product.release_on) >= earliest
      )
        reasons.push(
          product.release_on >= trip.start
            ? "旅行期间发售"
            : lookbackDays < 0
              ? "旅行前已发售"
              : `行前${lookbackDays}天内发售`,
        );
      if (lotteries.some((l) => windowOverlaps(l.window, trip.start, trip.end)))
        reasons.push("已公布抽选时间与旅行重合");
      if (lotteries.some((l) => deadlineInTrip(l.window, trip.start, trip.end)))
        reasons.push("抽选截止落在旅行期间");
      if (
        product.offers.some((o) =>
          deadlineInTrip(o.preorder, trip.start, trip.end),
        )
      )
        reasons.push("店铺预约截止落在旅行期间");
      if (
        !issued &&
        product.offers.some((o) =>
          windowOverlaps(o.preorder, trip.start, trip.end),
        )
      )
        reasons.push("已公布商品预约时间与旅行重合");
      return reasons.length
        ? [{ product, lotteries, reasons, preorderOnly: !issued }]
        : [];
    })
    .sort((a, b) =>
      (a.product.release_on || "9999").localeCompare(
        b.product.release_on || "9999",
      ),
    );
}
export function storeOptions(
  product: Release,
  stores: Store[],
  editionId: string,
  trip?: Trip,
) {
  const editionExists = product.editions.some((e) => e.id === editionId);
  if (
    !editionExists ||
    (trip && (!tripSchema.safeParse(trip).success || !trip.start || !trip.end))
  )
    return [];
  const lotteries = product.lotteries.filter(
    (l) =>
      l.edition_ids.includes(editionId) &&
      (!trip || liveRelevant(l, trip.start)),
  );
  if (!lotteries.length) return [];
  return stores
    .filter((s) => s.status === "published")
    .flatMap((store) => {
      const offers = product.offers.filter(
        (o) =>
          o.retailer_id === store.retailer_id &&
          o.edition_ids.includes(editionId),
      );
      if (!offers.length) return [];
      if (!trip) return [{ store, offers, visits: [] }];
      const visits = trip.stays
        .filter((s) => s.city === store.city)
        .flatMap((stay) => {
          if (!product.release_on || product.release_on > stay.end) return [];
          const start = maxDay(stay.start, product.release_on);
          const eligible = lotteries.filter((l) => liveRelevant(l, start));
          if (!eligible.length) return [];
          const lastDays = eligible.map((l) => {
            const deadlineDay = l.window.closes_at
              ? new Date(Date.parse(l.window.closes_at) - 1 + 9 * 3600000)
                  .toISOString()
                  .slice(0, 10)
              : stay.end;
            const liveDay = l.live_dates.length
              ? [...l.live_dates].sort().at(-1)!
              : stay.end;
            return [stay.end, deadlineDay, liveDay].sort()[0];
          });
          return [{ start, end: lastDays.sort().at(-1)! }];
        });
      return visits.length ? [{ store, offers, visits }] : [];
    });
}
export const mapUrl = (store: Store) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.address}`)}`;
