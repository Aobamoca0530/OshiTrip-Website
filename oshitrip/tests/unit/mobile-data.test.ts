import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedBundle, initialBundle, refreshBundle, validateBundle } from "../../mobile/data";
afterEach(() => vi.unstubAllGlobals());
describe("mobile public snapshot", () => {
  it("validates the bundled checksum and rejects tampering", async () => {
    await expect(validateBundle(initialBundle)).resolves.toEqual(initialBundle);
    const changed = structuredClone(initialBundle);
    changed.data.catalog.events[0].title_zh += "tampered";
    await expect(validateBundle(changed)).rejects.toThrow("checksum");
  });
  it("keeps the bundled snapshot when storage is unavailable or corrupted", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "{broken" });
    await expect(cachedBundle()).resolves.toEqual(initialBundle);
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); } });
    await expect(cachedBundle()).resolves.toEqual(initialBundle);
  });
  it("reports cache quota failures without losing downloaded data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(initialBundle)));
    vi.stubGlobal("localStorage", { setItem: () => { throw Error("quota"); } });
    await expect(refreshBundle(initialBundle)).resolves.toEqual({ bundle: initialBundle, saved: false });
  });
  it("refuses older data even when its checksum is valid", async () => {
    const old = { ...initialBundle, publishedAt: "2020-01-01T00:00:00Z" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(old)));
    const setItem = vi.fn(); vi.stubGlobal("localStorage", { setItem });
    await expect(refreshBundle(initialBundle)).resolves.toEqual({ bundle: initialBundle, saved: true });
    expect(setItem).not.toHaveBeenCalled();
  });
});
