import { describe, it, expect, vi } from "vitest";
import {
  extractObservation,
  observationFingerprint,
  allowedUrl,
  discoverLinks,
  robotsAllows,
  fetchLimited,
  crawlSource,
} from "../../scripts/crawler/core.mjs";
const html =
  "<main><h1>テストCD（解析テスト専用）</h1><table><tr><th>発売日</th><td>2026年11月4日</td></tr></table><p>BRMM-11101</p><p>初回生産分限定封入特典</p><p>2027年単独ライブ 最速先行抽選申込券</p><p>受付期間：2026年10月11日 21:00 ～ 11月9日 23:59</p><p>▼アニメイト(通販含む)</p><p>テスト用の説明です。実在商品の正式データではありません。</p></main>";
const source = {
  origin: "https://bang-dream.com",
  index_url: "https://bang-dream.com/discographies/",
  path_patterns: ["^/discographies/(?:[0-9]+/)?$"],
  urls: ["https://bang-dream.com/discographies/4215/"],
  permission: "approved",
  authorization_note: "Test authorization fixture only",
  terms_checked_on: "2026-10-28",
};
describe("bounded review-only release crawler", () => {
  it("reads configured directory pages in order and reports anything beyond the detail budget", async () => {
    const paged = {
      ...source,
      public_fetch_enabled: true,
      index_urls: ["https://bang-dream.com/discographies/page/2/"],
      path_patterns: [...source.path_patterns, "^/discographies/page/2/$"],
    };
    const fetcher: typeof fetch = async (url) =>
      new Response(
        String(url).endsWith("robots.txt")
          ? "User-agent: *\n"
          : String(url).endsWith("/page/2/")
            ? '<a href="/discographies/33/">more</a>'
            : String(url).endsWith("/discographies/")
              ? '<a href="/discographies/22/">new</a>'
              : html,
        { headers: { "content-type": "text/html" } },
      );
    const result = await crawlSource(paged, {
      fetcher,
      pause: async () => {},
      limit: 2,
    });
    expect(
      result.observations.map((o: { source_url: string }) => o.source_url),
    ).toEqual([
      "https://bang-dream.com/discographies/4215/",
      "https://bang-dream.com/discographies/22/",
    ]);
    expect(result.deferred_urls).toEqual(["https://bang-dream.com/discographies/33/"]);
    expect(result.discovered).toBe(3);
  });
  it("extracts facts and raw evidence without inventing lottery-to-edition links or stock", () => {
    const o = extractObservation(html, source.urls[0]);
    expect(o.release_on).toBe("2026-11-04");
    expect(o.skus).toEqual(["BRMM-11101"]);
    expect(o.lottery_mentions[0]).toContain("申込券");
    expect(o).not.toHaveProperty("stock");
    expect(o).not.toHaveProperty("closes_at");
    expect(o).not.toHaveProperty("status");
  });
  it("normalizes whitespace, drops scripts and distinguishes content changes", () => {
    const o = extractObservation(html, source.urls[0]);
    expect(
      observationFingerprint(
        extractObservation(html + "<script>attack()</script>", source.urls[0]),
      ),
    ).toBe(observationFingerprint(o));
    expect(
      observationFingerprint(
        extractObservation(html.replace("11月4日", "11月5日"), source.urls[0]),
      ),
    ).not.toBe(observationFingerprint(o));
  });
  it("rejects bad structure and impossible dates", () => {
    expect(() =>
      extractObservation("<h1>Access denied</h1>", source.urls[0]),
    ).toThrow();
    expect(() =>
      extractObservation(html.replace("11月4日", "2月30日"), source.urls[0]),
    ).toThrow();
  });
  it("restricts origins, paths, credentials, query strings and discovered links", () => {
    for (const url of [
      "http://bang-dream.com/discographies/1/",
      "https://evil.test/discographies/1/",
      "https://bang-dream.com@evil.test/",
      "https://bang-dream.com/wordpress/wp-admin/",
      "https://bang-dream.com/discographies/1/?secret=x",
    ])
      expect(allowedUrl(url, source)).toBe(false);
    expect(
      discoverLinks(
        '<a href="/discographies/22/">CD</a><a href="https://evil.test/a">x</a><a href="/discographies/22/">duplicate</a>',
        source,
      ),
    ).toEqual(["https://bang-dream.com/discographies/22/"]);
  });
  it("honors robots specificity, wildcards, end anchors and bot-specific groups", () => {
    const r =
      "User-agent: *\nDisallow: /private/\nAllow: /private/ok\nDisallow: /*.pdf$\n";
    expect(robotsAllows(r, "/private/x")).toBe(false);
    expect(robotsAllows(r, "/private/ok")).toBe(true);
    expect(robotsAllows(r, "/a.pdf")).toBe(false);
    expect(
      robotsAllows(
        r + "User-agent: OshiTripBot\nDisallow: /\n",
        "/discographies/",
      ),
    ).toBe(false);
  });
  it("never makes requests for unapproved sources", async () => {
    const fetcher = vi.fn();
    const r = await crawlSource(
      { ...source, permission: "unreviewed" },
      { fetcher },
    );
    expect(r.status).toBe("blocked");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("stops on robots failures and does not follow redirects", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 403 }));
    expect((await crawlSource(source, { fetcher })).status).toBe("blocked");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      fetchLimited(source.urls[0], {
        fetcher: async () => new Response("", { status: 302 }),
      }),
    ).rejects.toThrow("HTTP 302");
  });
  it("enforces byte limits even when content length is missing", async () => {
    await expect(
      fetchLimited(source.urls[0], {
        maxBytes: 10,
        fetcher: async () =>
          new Response(html, { headers: { "content-type": "text/html" } }),
      }),
    ).rejects.toThrow("大小限制");
  });
  it("stops the source after rate limiting and reports unread pages", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL) =>
        new Response(
          String(input).endsWith("robots.txt")
            ? "User-agent: *\nDisallow: /private/"
            : String(input).endsWith("/discographies/")
              ? '<a href="/discographies/99/">new</a>'
              : String(input).endsWith("/99/")
                ? "denied"
                : html,
          {
            status: String(input).endsWith("/99/") ? 429 : 200,
            headers: { "content-type": "text/html" },
          },
        ),
    );
    const pause = vi.fn();
    const r = await crawlSource(source, { fetcher, pause });
    expect(r.status).toBe("failed");
    expect(r.observations).toHaveLength(0);
    expect(r.errors[0]).toContain("429");
    expect(r.deferred_urls).toEqual(source.urls);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(r.access_diagnostics?.[0].error_page_kind).toBe('rate_limited');
    expect(pause).toHaveBeenCalledWith(2000);
  });
  it('stops after a forbidden index instead of requesting every detail', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => new Response(String(url).endsWith('robots.txt') ? 'User-agent: *\nAllow: /' : 'NOT FOUND', { status: String(url).endsWith('robots.txt') ? 200 : 403 }));
    const result = await crawlSource(source, { fetcher, pause: vi.fn() });
    expect(result.status).toBe('failed');
    expect(result.observations).toEqual([]);
    expect(result.deferred_urls).toEqual(source.urls);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
