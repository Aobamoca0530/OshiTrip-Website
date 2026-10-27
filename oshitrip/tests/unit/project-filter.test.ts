import { describe, it, expect } from "vitest";
import config from "../../scripts/crawler/project-keywords.json";
import { createProjectFilter, relevantAnnouncement } from "../../scripts/crawler/project-filter.mjs";
import { discoverLinks, crawlSource } from "../../scripts/crawler/core.mjs";

const filter = createProjectFilter(config);
describe("public crawler project whitelist", () => {
  it.each([
    "ＢａｎＧ　Ｄｒｅａｍ！ STORE", "バンドリ！ コラボ", "MyGO!!!!! POP UP", "Ave Mujica 新商品",
    "OurNotes コラボ", "Poppin’Party カフェ", "Pastel＊Palettes グッズ", "ラブライブ！虹ヶ咲フェア",
    "LoveLive! POP UP", "ニジガク☆ポリス", "少女☆歌劇 レヴュースタァライト", "Revue Starlight cafe",
  ])("retains supported names despite punctuation and width differences: %s", title => {
    expect(filter("bushiroad-creative", title)).toBe(true);
    expect(filter("sweets-paradise", title)).toBe(true);
  });
  it.each(["STPR Collaboration Cafe", "ブルーロック グッズ", "283PRODUCTION POP UP SHOP", "恋する暴君", "ブシロード 商品と特典", "SWEETS PARADISE コラボ", "afterglowing festival", "Love cafe", "LIVE cafe"])("rejects unrelated titles and broad generic terms: %s", title => {
    expect(filter("bushiroad-creative", title)).toBe(false);
    expect(filter("sweets-paradise", title)).toBe(false);
  });
  it("retains joint announcements mentioning a followed project and preserves the separate BanG Dream activity filter", () => {
    expect(filter("bushiroad-creative", "AGF2026 少女☆歌劇 と ZERO RISE 出展")).toBe(true);
    expect(relevantAnnouncement("bang-dream-news", "特別展示が決定", filter)).toBe(true);
    expect(relevantAnnouncement("bang-dream-news", "MyGO!!!!! デジタルリリース", filter)).toBe(false);
  });
  it("filters duplicate directory links by their non-empty title before the page budget is spent", async () => {
    const source = { id: "sweets-paradise", origin: "https://bang-dream.com", index_url: "https://bang-dream.com/news/", path_patterns: ["^/news/(?:[0-9]+/)?$"], urls: [], public_fetch_enabled: true };
    const directory = '<a href="/news/1/"><img src="/x.jpg"></a><a href="/news/1/">STPR cafe</a><a href="/news/2/"><img alt="バンドリ コラボ" src="/y.jpg"></a>';
    const accept = ({ title }: { title: string }) => filter(source.id, title);
    expect(discoverLinks(directory, source, accept)).toEqual(["https://bang-dream.com/news/2/"]);
    const fetched: string[] = [];
    const result = await crawlSource(source, { limit: 1, acceptDiscoveredLink: accept, pause: async () => {}, fetcher: async (input: RequestInfo | URL) => {
      const url = String(input);
      fetched.push(url);
      return new Response(url.endsWith('robots.txt') ? 'User-agent: *\nDisallow: /private/' : url.endsWith('/news/') ? directory : '<h1>バンドリ コラボ</h1><p>' + '開催の公開情報。'.repeat(30) + '</p>', { headers: { 'content-type': 'text/html' } });
    } });
    expect(result.observations).toHaveLength(1);
    expect(fetched).not.toContain("https://bang-dream.com/news/1/");
  });
  it("still rejects unrelated article titles even if a directory label matched", () => {
    expect(relevantAnnouncement("sweets-paradise", "STPR 新店舗", filter)).toBe(false);
  });
  it("fails closed for an empty or invalid whitelist", () => {
    expect(() => createProjectFilter({ ...config, projects: [] })).toThrow();
    expect(() => createProjectFilter({ ...config, projects: [{ id: 'x', label: 'x', keywords: ['!!!'] }] })).toThrow();
  });
});
