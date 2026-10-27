import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import catalog from "../../src/data/catalog.json";
import releases from "../../src/data/releases.json";
import stores from "../../src/data/stores.json";
import { makeDataBundle, MAX_DATA_BYTES, PUBLIC_DATA_URL } from "../../src/lib/data-bundle";
import { DataSync } from "../../src/lib/data-sync";

const data = { catalog: { ...catalog, events: catalog.events.filter(e => ["published", "cancelled"].includes(e.status)) }, releases: releases.filter(r => r.status === "published"), stores: stores.filter(s => s.status === "published") };
const bundled = makeDataBundle(data, "2026-10-27T00:00:00Z");
const changed = structuredClone(data);
changed.catalog.events[0].title_zh += "（更新测试）";
const next = makeDataBundle(changed, "2026-10-28T00:00:00Z");
const now = () => Date.parse("2026-10-28T12:00:00Z");
const directories: string[] = [];
async function directory() { const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oshitrip-data-")); directories.push(dir); return dir; }
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });
const fetchBundle = (value: unknown) => vi.fn<typeof fetch>().mockImplementation(async () => Response.json(value));

describe("public activity updates", () => {
  it("starts from bundled data without waiting for the network, then saves a complete update for an offline restart", async () => {
    const cacheDir = await directory();
    const fetcher = fetchBundle(next);
    const service = new DataSync({ bundled, cacheDir, fetcher, now });
    expect((await service.snapshot()).revision).toBe(bundled.revision);
    const status = await service.refresh();
    expect(status).toMatchObject({ revision: next.revision, checking: false, result: "updated" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(PUBLIC_DATA_URL);
    expect(JSON.parse(await fs.readFile(path.join(cacheDir, "public-v1.json"), "utf8"))).toEqual(next);
    const offline = new DataSync({ bundled, cacheDir, offline: true, now });
    expect((await offline.snapshot()).data.catalog.events[0].title_zh).toContain("更新测试");
    expect(await offline.refresh()).toMatchObject({ source: "cache", revision: next.revision, result: "unavailable", checking: false });
  });
  it("works on a first launch offline and ignores corrupt caches", async () => {
    const cacheDir = await directory();
    await fs.writeFile(path.join(cacheDir, "public-v1.json"), "broken");
    const service = new DataSync({ bundled, cacheDir, offline: true, now });
    expect((await service.snapshot()).revision).toBe(bundled.revision);
    expect(await service.refresh()).toMatchObject({ source: "bundled", result: "unavailable" });
  });
  it.each([
    ["checksum", { ...next, revision: "0".repeat(64) }],
    ["format", { ...next, formatVersion: 2 }],
    ["schema", { ...next, data: {} }],
    ["older publication", { ...next, publishedAt: "2026-10-26T00:00:00Z" }],
    ["future publication", { ...next, publishedAt: "2027-01-01T00:00:00Z" }],
  ])("keeps working data when rejecting %s", async (_, value) => {
    const cacheDir = await directory();
    const file = path.join(cacheDir, "public-v1.json");
    await fs.writeFile(file, JSON.stringify(bundled));
    const service = new DataSync({ bundled, cacheDir, fetcher: fetchBundle(value), now });
    expect(await service.refresh()).toMatchObject({ revision: bundled.revision, result: "unavailable" });
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(bundled);
  });
  it.each(["http", "network", "declared-size", "stream-size"])("keeps bundled data after %s failure", async kind => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      if (kind === "network") throw new Error("disconnected");
      if (kind === "http") return new Response("error", { status: 503 });
      if (kind === "declared-size") return new Response("{}", { headers: { "content-length": String(MAX_DATA_BYTES + 1) } });
      return new Response(" ".repeat(MAX_DATA_BYTES + 1));
    });
    const service = new DataSync({ bundled, fetcher, now });
    expect(await service.refresh()).toMatchObject({ revision: bundled.revision, result: "unavailable", checking: false });
  });
  it("shares concurrent refreshes and rate limits repeated clicks", async () => {
    const fetcher = fetchBundle(next);
    const service = new DataSync({ bundled, fetcher, now });
    const statuses = await Promise.all([service.refresh(), service.refresh(), service.refresh()]);
    expect(statuses.every(s => s.revision === next.revision && !s.checking)).toBe(true);
    await service.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps the current snapshot if the cache cannot be written", async () => {
    const dir = await directory();
    const cacheDir = path.join(dir, "not-a-directory");
    await fs.writeFile(cacheDir, "occupied");
    const service = new DataSync({ bundled, cacheDir, fetcher: fetchBundle(next), now });
    expect(await service.refresh()).toMatchObject({ revision: bundled.revision, result: "unavailable" });
  });
  it("uses a newer bundled snapshot in preference to an older cache", async () => {
    const cacheDir = await directory();
    await fs.writeFile(path.join(cacheDir, "public-v1.json"), JSON.stringify(bundled));
    const service = new DataSync({ bundled: next, cacheDir, offline: true, now });
    expect((await service.snapshot()).revision).toBe(next.revision);
  });
  it("excludes unapproved records from a valid public bundle", () => {
    const invalid = structuredClone(data);
    invalid.catalog.events[0].status = "draft";
    expect(() => makeDataBundle(invalid, bundled.publishedAt)).toThrow();
  });
});
