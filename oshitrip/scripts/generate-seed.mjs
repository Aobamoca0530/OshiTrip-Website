import { readFileSync, writeFileSync } from "node:fs";
const catalog = JSON.parse(readFileSync("src/data/catalog.json", "utf8"));
const quote = (value) =>
  value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const insert = (table, row) =>
  `insert into public.${table} (${Object.keys(row).join(",")}) values (${Object.values(
    row,
  )
    .map((v) =>
      quote(typeof v === "object" && v !== null ? JSON.stringify(v) : v),
    )
    .join(",")}) on conflict do nothing;`;
const lines = [
  "-- Manually verified official snapshots. See each source date. Run after migrations 001 through 007.",
  "begin;",
];
// Parents must precede their children.
for (const f of [
  ...catalog.franchises.filter((f) => !f.parent_id),
  ...catalog.franchises.filter((f) => f.parent_id),
])
  lines.push(insert("franchises", f));
for (const { franchise_ids, venues, sources, ...event } of catalog.events) {
  lines.push(insert("events", event));
  for (const id of franchise_ids)
    lines.push(
      insert("event_franchises", { event_id: event.id, franchise_id: id }),
    );
  for (const { rounds, ...venue } of venues) {
    lines.push(insert("event_venues", { ...venue, event_id: event.id }));
    for (const r of rounds)
      lines.push(insert("reservation_rounds", { ...r, venue_id: venue.id }));
  }
  for (const source of sources)
    lines.push(insert("event_sources", { ...source, event_id: event.id }));
}
lines.push("commit;");
writeFileSync("supabase/seed.sql", lines.join("\n") + "\n");
const releases = JSON.parse(readFileSync("src/data/releases.json", "utf8"));
writeFileSync(
  "supabase/releases-seed.sql",
  [
    "-- Run after 002_releases.sql. Does not overwrite existing editorial changes.",
    "begin;",
    ...releases.map((p) =>
      insert("releases", {
        id: p.id,
        slug: p.slug,
        status: p.status,
        document: p,
        updated_at: p.updated_at,
      }),
    ),
    "commit;",
  ].join("\n") + "\n",
);

const stores = JSON.parse(readFileSync("src/data/stores.json", "utf8"));
writeFileSync(
  "supabase/stores-seed.sql",
  [
    "-- Run after 003_stores.sql.",
    "begin;",
    ...stores.map((s) => insert("store_branches", s)),
    "commit;",
  ].join("\n") + "\n",
);
