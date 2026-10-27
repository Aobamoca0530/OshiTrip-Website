import type { Franchise, OshiEvent, Round, Trip, Venue } from "./schema";
import { dateSchema } from "./schema";

export const statusLabels = {
  none: "无需预约",
  unannounced: "规则尚未公布",
  upcoming: "尚未开始报名",
  open: "报名时间范围内",
  closed: "当前轮次已截止",
  unknown: "状态无法确认",
  cancelled: "活动已取消",
} as const;
export type BookingStatus = keyof typeof statusLabels;
export function tokyoDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function overlaps(start: string, end: string, from: string, to: string) {
  return start <= end && from <= to && start <= to && end >= from;
}
export function reservationWindow(
  r: Round,
  visit?: string,
): { opens: string | null; closes: string | null; openDate: string | null } {
  if (r.kind !== "rolling")
    return {
      opens: r.opens_at,
      closes:
        r.closes_at ||
        (r.kind === "fixed" &&
        visit &&
        r.cutoff_days_before !== null &&
        r.cutoff_time
          ? `${shiftDate(visit, -r.cutoff_days_before)}T${r.cutoff_time}:00+09:00`
          : null),
      openDate: null,
    };
  if (
    !visit ||
    r.days_before === null ||
    r.cutoff_days_before === null ||
    !r.cutoff_time
  )
    return { opens: null, closes: null, openDate: null };
  const openDate = shiftDate(visit, -r.days_before);
  return {
    openDate,
    opens: r.open_time ? `${openDate}T${r.open_time}:00+09:00` : null,
    closes: `${shiftDate(visit, -r.cutoff_days_before)}T${r.cutoff_time}:00+09:00`,
  };
}
export function roundStatus(
  r: Round,
  now: Date,
  visit?: string,
): BookingStatus {
  if (visit && !dateSchema.safeParse(visit).success) return "unknown";
  if (r.kind === "none") return "none";
  if (r.kind === "unannounced") return "unannounced";
  if (r.kind === "unknown" || (r.kind === "rolling" && !visit))
    return "unknown";
  const w = reservationWindow(r, visit);
  if (w.closes && now.getTime() >= Date.parse(w.closes)) return "closed";
  if (w.opens && now.getTime() < Date.parse(w.opens)) return "upcoming";
  if (w.openDate && !w.opens) {
    if (tokyoDate(now) < w.openDate) return "upcoming";
    if (tokyoDate(now) === w.openDate) return "unknown"; // Official opening hour was not given.
    if (w.closes) return "open";
  }
  return w.opens && w.closes ? "open" : "unknown";
}
export function venueStatus(
  event: OshiEvent,
  venue: Venue,
  now: Date,
  visit?: string,
): BookingStatus {
  if (event.status === "cancelled") return "cancelled";
  if (visit && !overlaps(venue.start_date, venue.end_date, visit, visit))
    return "unknown";
  const statuses = venue.rounds.map((r) => roundStatus(r, now, visit));
  for (const s of [
    "open",
    "upcoming",
    "unknown",
    "unannounced",
    "none",
    "closed",
  ] as const)
    if (statuses.includes(s)) return s;
  return "unknown";
}
export function descendants(id: string, franchises: Franchise[]): Set<string> {
  const ids = new Set([id]);
  for (let i = 0; i < franchises.length; i++)
    for (const f of franchises)
      if (f.parent_id && ids.has(f.parent_id)) ids.add(f.id);
  return ids;
}
export interface Filters {
  ip?: string;
  city?: string;
  category?: string;
  start?: string;
  end?: string;
  method?: string;
  status?: string;
  history?: boolean;
  benefits?: boolean;
  sort?: string;
}
export interface Match {
  event: OshiEvent;
  venue: Venue;
}
export interface EventCollection {
  event: OshiEvent;
  venues: Venue[];
}
// Group only AFTER per-venue filtering: never reintroduce an excluded branch.
export function groupMatches(matches: Match[]): EventCollection[] {
  const groups = new Map<string, EventCollection>();
  for (const { event, venue } of matches) {
    const group = groups.get(event.id) || { event, venues: [] };
    if (!group.venues.some((v) => v.id === venue.id)) group.venues.push(venue);
    groups.set(event.id, group);
  }
  return [...groups.values()];
}
export function venueBenefits(
  event: OshiEvent,
  venue: Venue,
  from?: string,
  to?: string,
) {
  const start = from && from > venue.start_date ? from : venue.start_date;
  const end = to && to < venue.end_date ? to : venue.end_date;
  return (event.benefits || []).filter(
    (b) =>
      b.channel !== "通販" &&
      (!b.venue_ids.length || b.venue_ids.includes(venue.id)) &&
      overlaps(
        b.starts_on || venue.start_date,
        b.ends_on || venue.end_date,
        start,
        end,
      ),
  );
}
export function filterEvents(
  events: OshiEvent[],
  franchises: Franchise[],
  f: Filters,
  now = new Date(),
): Match[] {
  if (
    (f.start && !dateSchema.safeParse(f.start).success) ||
    (f.end && !dateSchema.safeParse(f.end).success)
  )
    return [];
  const allowed = f.ip ? descendants(f.ip, franchises) : null;
  const from = f.start || f.end;
  const to = f.end || f.start;
  const result = events.flatMap((event) => {
    if (
      !["published", "cancelled"].includes(event.status) ||
      (allowed && !event.franchise_ids.some((id) => allowed.has(id))) ||
      (f.category && event.category !== f.category)
    )
      return [];
    return event.venues
      .filter(
        (v) =>
          (!f.city || v.city === f.city) &&
          (f.history || v.end_date >= tokyoDate(now)) &&
          (!from || !to || overlaps(v.start_date, v.end_date, from, to)) &&
          (!f.benefits || venueBenefits(event, v, from, to).length > 0) &&
          (!f.method || v.rounds.some((r) => r.method === f.method)) &&
          (!f.status ||
            venueStatus(
              event,
              v,
              now,
              from ? (from > v.start_date ? from : v.start_date) : undefined,
            ) === f.status),
      )
      .map((venue) => ({ event, venue }));
  });
  const deadline = (m: Match) => {
    const visit = from
      ? from > m.venue.start_date
        ? from
        : m.venue.start_date
      : undefined;
    const deadlines = m.venue.rounds
      .map((r) => reservationWindow(r, visit).closes)
      .filter((s): s is string => !!s)
      .map(Date.parse);
    return deadlines.length ? Math.min(...deadlines) : Infinity;
  };
  return result.sort((a, b) =>
    f.sort === "deadline"
      ? deadline(a) - deadline(b) ||
        a.venue.start_date.localeCompare(b.venue.start_date)
      : a.venue.start_date.localeCompare(b.venue.start_date),
  );
}
export function tripMatches(
  events: OshiEvent[],
  franchises: Franchise[],
  trip: Trip,
  now = new Date(),
): Match[] {
  const map = new Map<string, Match>();
  for (const stay of trip.stays)
    for (const match of filterEvents(
      events,
      franchises,
      { city: stay.city, start: stay.start, end: stay.end, history: true },
      now,
    )) {
      if (match.event.status !== "cancelled") map.set(match.venue.id, match);
    }
  return [...map.values()];
}
