import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { readFileSync } from "node:fs";
import seed from "../../src/data/catalog.json";
import { catalogSchema, eventSchema } from "../../src/lib/schema";
import products from "../../src/data/releases.json";
import { releasesSchema } from "../../src/lib/releases";
const adminId = "11111111-1111-4111-8111-111111111111";
const ordinaryId = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
async function role(name: "anon" | "authenticated", id = "") {
  await db.exec(`set local role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
}
function draftDocument() {
  const e = eventSchema.parse(seed.events[0]);
  e.id = "test-private-draft";
  e.slug = "test-private-draft";
  e.status = "draft";
  e.venues = e.venues.map((v) => ({
    ...v,
    id: `test-${v.id}`,
    rounds: v.rounds.map((r) => ({ ...r, id: `test-${r.id}` })),
  }));
  e.sources = e.sources.map((s) => ({ ...s, id: `test-${s.id}` }));
  return e;
}
describe("actual PostgreSQL migration, RPC transactions and RLS (local PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to anon,authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; insert into auth.users values('${adminId}'),('${ordinaryId}');`,
    );
    await db.exec(readFileSync("supabase/setup-new-project.sql", "utf8"));
    await db.query("insert into public.admin_users(user_id) values($1)", [
      adminId,
    ]);
    await db.exec("begin");
    await role("authenticated", adminId);
    await db.query("select public.save_event($1::jsonb,null)", [
      JSON.stringify(draftDocument()),
    ]);
    await db.exec("commit");
  }, 60000);
  beforeEach(async () => {
    await db.exec("begin");
  });
  afterEach(async () => {
    await db.exec("rollback");
  });
  afterAll(async () => {
    await db?.close();
  });
  it("anonymous reader gets valid public catalog without draft children", async () => {
    await role("anon");
    const result = await db.query<{ data: unknown }>(
      "select public.read_catalog() as data",
    );
    const c = catalogSchema.parse(result.rows[0].data);
    expect(c.events).toHaveLength(seed.events.length);
    expect(
      c.events.find((e) => e.id === seed.events[0].id)?.venues,
    ).toHaveLength(9);
    expect(
      (await db.query("select * from public.event_venues")).rows,
    ).toHaveLength(seed.events.reduce((n, e) => n + e.venues.length, 0));
    expect(
      (await db.query("select * from public.reservation_rounds")).rows,
    ).toHaveLength(
      seed.events.reduce(
        (n, e) => n + e.venues.reduce((m, v) => m + v.rounds.length, 0),
        0,
      ),
    );
    expect(
      (await db.query("select * from public.event_sources")).rows,
    ).toHaveLength(seed.events.flatMap((e) => e.sources).length);
  });
  it("persists and validates event benefits, gallery and official venue links atomically", async () => {
    await role("authenticated", adminId);
    const rows = await db.query<{ data: unknown }>(
      "select public.read_catalog() as data",
    );
    const e = catalogSchema
      .parse(rows.rows[0].data)
      .events.find((e) => e.id === "nijigasaki-loft-2026")!;
    const changed = {
      ...e,
      benefits: e.benefits!.map((b) => ({
        ...b,
        title: b.title + "（已复核）",
      })),
    };
    await db.query("select public.save_event($1::jsonb,$2::timestamptz)", [
      JSON.stringify(changed),
      e.updated_at,
    ]);
    const reread = await db.query<{ data: unknown }>(
      "select public.read_catalog() as data",
    );
    const saved = catalogSchema
      .parse(reread.rows[0].data)
      .events.find((x) => x.id === e.id)!;
    expect(saved.benefits![0].title).toContain("已复核");
    expect(saved.gallery).toEqual(e.gallery);
    expect(saved.venues[0].official_url).toBe(e.venues[0].official_url);
  });
  it("anonymous user cannot insert events", async () => {
    await role("anon");
    await expect(
      db.query(
        "insert into public.events(id,slug,title_ja,title_zh,category) values('x','x','x','x','其他联动')",
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("stores translated rules and rejects unchecked or detached image evidence", async () => {
    await role("authenticated", adminId);
    const e = catalogSchema
      .parse(seed)
      .events.find((e) => e.id === "ournotes-sweets-2026")!;
    const changed = structuredClone(e);
    changed.translated_rules![0].title += "（已复核）";
    await db.query("select public.save_event($1::jsonb,$2::timestamptz)", [
      JSON.stringify(changed),
      e.updated_at,
    ]);
    const row = await db.query<{ translated_rules: unknown }>(
      "select translated_rules from public.events where id=$1",
      [e.id],
    );
    expect(row.rows[0].translated_rules).toEqual(changed.translated_rules);
    for (const invalid of ["unchecked", "missing-hash", "wrong-image"]) {
      await db.exec("savepoint invalid_rule");
      const bad = structuredClone(changed),
        rule = bad.translated_rules!.find((r) => r.image_url)!;
      if (invalid === "unchecked") rule.checked_on = null;
      if (invalid === "missing-hash") rule.image_sha256 = null;
      if (invalid === "wrong-image")
        rule.image_url = "https://example.org/unrelated.jpg";
      await expect(
        db.query("select public.save_event($1::jsonb,$2::timestamptz)", [
          JSON.stringify(bad),
          e.updated_at,
        ]),
      ).rejects.toThrow(/rule|Rule/);
      await db.exec("rollback to invalid_rule");
    }
  });
  it("activity image saves with its source, can be removed, and rejects unverified publication", async () => {
    await role("authenticated", adminId);
    const e = catalogSchema.parse(seed).events.find((e) => e.image)!;
    await db.exec("savepoint unchecked_image");
    await expect(
      db.query("select public.save_event($1::jsonb,$2::timestamptz)", [
        JSON.stringify({ ...e, image: { ...e.image, checked_on: null } }),
        e.updated_at,
      ]),
    ).rejects.toThrow(/Verified image required/);
    await db.exec("rollback to unchecked_image");
    await db.query("select public.save_event($1::jsonb,$2::timestamptz)", [
      JSON.stringify(e),
      e.updated_at,
    ]);
    const saved = await db.query<{ image: unknown; updated_at: string }>(
      "select image,updated_at from public.events where id=$1",
      [e.id],
    );
    expect(saved.rows[0].image).toEqual(e.image);
    await db.query("select public.save_event($1::jsonb,$2::timestamptz)", [
      JSON.stringify({ ...e, image: null }),
      saved.rows[0].updated_at,
    ]);
    expect(
      (
        await db.query<{ image: unknown }>(
          "select image from public.events where id=$1",
          [e.id],
        )
      ).rows[0].image,
    ).toBeNull();
  });
  it("anonymous user cannot call save RPC", async () => {
    await role("anon");
    await expect(
      db.query("select public.save_event($1::jsonb,null)", [
        JSON.stringify(seed.events[0]),
      ]),
    ).rejects.toThrow(/permission denied/);
  });
  it("ordinary authenticated user cannot write through RPC", async () => {
    await role("authenticated", ordinaryId);
    await expect(
      db.query("select public.save_event($1::jsonb,null)", [
        JSON.stringify(seed.events[0]),
      ]),
    ).rejects.toThrow(/Administrator required/);
  });
  it("ordinary user cannot promote themselves to admin", async () => {
    await role("authenticated", ordinaryId);
    await expect(
      db.query("insert into public.admin_users(user_id) values($1)", [
        ordinaryId,
      ]),
    ).rejects.toThrow(/permission denied/);
  });
  it("ordinary user direct update changes zero rows", async () => {
    await role("authenticated", ordinaryId);
    const r = await db.query(
      "update public.events set title_zh='forbidden' returning id",
    );
    expect(r.rows).toHaveLength(0);
  });
  it("ordinary reader cannot see unpublished data or ingestion queue", async () => {
    await role("authenticated", ordinaryId);
    expect(
      (await db.query("select * from public.events where status='draft'")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.ingestion_candidates")).rows,
    ).toHaveLength(0);
  });
  it("admin can read draft and atomically update official aggregate", async () => {
    await role("authenticated", adminId);
    expect(
      (await db.query("select * from public.events where status='draft'")).rows,
    ).toHaveLength(1);
    const e = {
      ...seed.events[0],
      summary: "Updated in isolated test transaction",
    };
    await db.query("select public.save_event($1::jsonb,$2::timestamptz)", [
      JSON.stringify(e),
      e.updated_at,
    ]);
    const r = await db.query<{ data: unknown }>(
      "select public.read_catalog() as data",
    );
    const actual = catalogSchema
      .parse(r.rows[0].data)
      .events.find((x) => x.id === e.id)!;
    expect(actual.summary).toBe(e.summary);
    expect(actual.venues).toHaveLength(9);
    expect(actual.updated_at).not.toBe(e.updated_at);
  });
  it("rejects stale edits", async () => {
    await role("authenticated", adminId);
    await expect(
      db.query("select public.save_event($1::jsonb,$2::timestamptz)", [
        JSON.stringify(seed.events[0]),
        "2026-10-01T00:00:00Z",
      ]),
    ).rejects.toThrow(/CONFLICT/);
  });
  it("rejects an invalid venue and rolls back the whole aggregate", async () => {
    await role("authenticated", adminId);
    await db.exec("savepoint invalid_edit");
    const e = structuredClone(seed.events[0]);
    e.venues[0].end_date = "2026-10-01";
    await expect(
      db.query("select public.save_event($1::jsonb,$2::timestamptz)", [
        JSON.stringify(e),
        e.updated_at,
      ]),
    ).rejects.toThrow(/check constraint/);
    await db.exec("rollback to invalid_edit");
    expect(
      (
        await db.query("select * from public.event_venues where event_id=$1", [
          e.id,
        ])
      ).rows,
    ).toHaveLength(9);
  });
  it("admin can cancel and unpublish; public view respects each state", async () => {
    await role("authenticated", adminId);
    await db.query("update public.events set status='cancelled' where id=$1", [
      seed.events[0].id,
    ]);
    await role("anon");
    expect((await db.query("select * from public.events")).rows).toHaveLength(
      seed.events.length,
    );
    await role("authenticated", adminId);
    await db.query("update public.events set status='archived' where id=$1", [
      seed.events[0].id,
    ]);
    await role("anon");
    expect(
      (
        await db.query("select * from public.event_sources where event_id=$1", [
          seed.events[0].id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
  it("anonymous public release catalog validates and hides admin drafts", async () => {
    await role("authenticated", adminId);
    const draft = {
      ...products[0],
      id: "private-product",
      slug: "private-product",
      status: "draft",
    };
    await db.query("select public.save_release($1::jsonb,null)", [
      JSON.stringify(draft),
    ]);
    await role("anon");
    const result = await db.query<{ document: unknown }>(
      "select document from public.releases",
    );
    expect(
      releasesSchema.parse(result.rows.map((r) => r.document)),
    ).toHaveLength(products.length);
  });
  it("anonymous cannot write releases", async () => {
    await role("anon");
    await expect(
      db.query("select public.save_release($1::jsonb,null)", [
        JSON.stringify(products[0]),
      ]),
    ).rejects.toThrow(/permission denied/);
  });
  it("store directory hides drafts and rejects ordinary-user changes", async () => {
    await role("authenticated", adminId);
    await db.query(
      "update public.store_branches set status='draft' where id='animate-umeda'",
    );
    await role("anon");
    expect(
      (await db.query("select * from public.store_branches")).rows,
    ).toHaveLength(9);
    await role("authenticated", ordinaryId);
    expect(
      (
        await db.query(
          "update public.store_branches set address='wrong' returning id",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("review acceptance atomically changes the release and consumes its candidate once", async () => {
    await role("authenticated", adminId);
    const p = { ...products[0], title: "核实后的纪念书" };
    const source = p.sources[0].url;
    const row = await db.query<{ id: string }>(
      "insert into public.ingestion_candidates(source_url,fingerprint,payload) values($1,'review-test',$2::jsonb) returning id",
      [source, JSON.stringify({ kind: "release-source" })],
    );
    const id = row.rows[0].id;
    await db.exec("savepoint conflict_review");
    await expect(
      db.query(
        "select public.apply_release_candidate($1,$2::jsonb,$3::timestamptz)",
        [id, JSON.stringify(p), "2020-01-01T00:00:00Z"],
      ),
    ).rejects.toThrow(/Conflict/);
    await db.exec("rollback to conflict_review");
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.ingestion_candidates where id=$1",
          [id],
        )
      ).rows[0].status,
    ).toBe("pending");
    await db.query(
      "select public.apply_release_candidate($1,$2::jsonb,$3::timestamptz)",
      [id, JSON.stringify(p), p.updated_at],
    );
    expect(
      (
        await db.query<{ status: string }>(
          "select status from public.ingestion_candidates where id=$1",
          [id],
        )
      ).rows[0].status,
    ).toBe("reviewed");
    await db.exec("savepoint duplicate_review");
    await expect(
      db.query(
        "select public.apply_release_candidate($1,$2::jsonb,$3::timestamptz)",
        [id, JSON.stringify(p), p.updated_at],
      ),
    ).rejects.toThrow(/already handled/);
    await db.exec("rollback to duplicate_review");
    await role("anon");
    expect(
      (
        await db.query<{ title: string }>(
          "select document->>'title' title from public.releases where id=$1",
          [p.id],
        )
      ).rows[0].title,
    ).toBe(p.title);
  });
  it("ordinary authenticated user cannot edit or expose private releases", async () => {
    await role("authenticated", adminId);
    await db.query("select public.save_release($1::jsonb,null)", [
      JSON.stringify({
        ...products[0],
        id: "private-product",
        slug: "private-product",
        status: "draft",
      }),
    ]);
    await role("authenticated", ordinaryId);
    expect(
      (await db.query("select * from public.releases where status='draft'"))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "update public.releases set status='archived' where id=$1 returning id",
          [products[0].id],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.save_release($1::jsonb,null)", [
        JSON.stringify(products[0]),
      ]),
    ).rejects.toThrow(/Administrator required/);
  });
  it("admin edits are atomic, reject stale revisions, and support unpublishing", async () => {
    await role("authenticated", adminId);
    const edit = {
      ...products[0],
      status: "archived",
      title: "管理员维护后的商品",
    };
    await db.query("select public.save_release($1::jsonb,$2::timestamptz)", [
      JSON.stringify(edit),
      products[0].updated_at,
    ]);
    await db.exec("savepoint stale_release");
    await expect(
      db.query("select public.save_release($1::jsonb,$2::timestamptz)", [
        JSON.stringify(products[0]),
        products[0].updated_at,
      ]),
    ).rejects.toThrow(/Conflict/);
    await db.exec("rollback to stale_release");
    expect(
      (
        await db.query<{ title: string }>(
          "select document->>'title' as title from public.releases where id=$1",
          [edit.id],
        )
      ).rows[0].title,
    ).toBe(edit.title);
    await role("anon");
    expect(
      (await db.query("select * from public.releases where id=$1", [edit.id]))
        .rows,
    ).toHaveLength(0);
  });
});
