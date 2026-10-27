import { describe, expect, it } from "vitest";
import { classifyImage, mergeAnnouncements } from "../../scripts/crawler/public-news.mjs";
import { extractObservation, extractImageCandidates, crawlSource } from "../../scripts/crawler/core.mjs";
import { createHash } from "node:crypto";
import legacy from "../../../data/public-v1.json";
import { catalogSchema } from "../../src/lib/schema";
import { releasesSchema } from "../../src/lib/releases";
import { storesSchema } from "../../src/lib/shopping";

const url = "https://bushiroad-creative.com/topics/123/";
const img = (name: string) => `https://bushiroad-creative.com/wordpress/wp-content/uploads/2026/${name}.jpg`;
const html = `<h1 class="p-block-b-b__title">テスト POP UP SHOP</h1><article class="c-post blog-container"><h2>販売グッズ</h2><p>${"開催情報の確認用の文章です。".repeat(12)}</p><img src="${img('goods')}" alt="商品一覧"><h2>購入特典</h2><img src="${img('bonus')}" alt="特典カード"></article><aside><img src="${img('unrelated')}" alt="別の作品の広告"></aside>`;
describe("public announcements and merchandise", () => {
  it("preserves the exact v1 checksum consumed by existing 1.1 clients", () => {
    const parsed = { catalog: catalogSchema.parse(legacy.data.catalog), releases: releasesSchema.parse(legacy.data.releases), stores: storesSchema.parse(legacy.data.stores) };
    expect(legacy.formatVersion).toBe(1);
    expect(createHash('sha256').update(JSON.stringify(parsed)).digest('hex')).toBe(legacy.revision);
    expect(legacy.data).not.toHaveProperty('announcements');
  });
  it("isolates the official article and keeps merchandise separately from bonuses", () => {
    const images = extractImageCandidates(html, url);
    expect(images.map(i => i.url)).toEqual([img('goods'), img('bonus')]);
    expect(images.map(classifyImage)).toEqual(["merchandise", "bonus"]);
  });
  it("isolates Starlight article content from the site header and related pictures", () => {
    const address = 'https://revuestarlight.com/news/11241/';
    const markup = `<header><h1>サイトロゴ</h1></header><h1 class="ttl serif">九九組の日</h1><div class="sw-Detail_Contents news-Detail_Contents"><div><p>${'公開商品情報です。'.repeat(20)}</p><img src="https://revuestarlight.com/wordpress/wp-content/uploads/goods.jpg" alt="グッズ"></div></div><img src="https://revuestarlight.com/wordpress/wp-content/uploads/other.jpg">`;
    const parsed = extractObservation(markup, address, 'event-source');
    expect(parsed.title).toBe('九九組の日');
    expect(parsed.images.map(i => i.url)).toEqual(['https://revuestarlight.com/wordpress/wp-content/uploads/goods.jpg']);
    expect(() => extractObservation(markup.replace('news-Detail_Contents', 'changed-layout'), address)).toThrow();
    const short = '<h1 class="ttl serif">新作舞台上演決定！</h1><div class="news-Detail_Contents"><p>少女☆歌劇 レヴュースタァライトの新作舞台が来年初夏に上演決定いたしました。公演詳細は続報をお待ちください。</p></div>';
    expect(extractObservation(short, address).title).toBe('新作舞台上演決定！');
  });
  it.each([403, 404])("permits explicitly configured unavailable robots (%i) while still rejecting a forbidden article", async status => {
    const source = { origin: 'https://bang-dream.com', public_fetch_enabled: true, robots_unavailable_statuses: [403, 404], urls: ['https://bang-dream.com/news/1/'], path_patterns: ['^/news/1/$'] };
    const calls: string[] = [];
    const result = await crawlSource(source, { pause: async () => {}, fetcher: async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url);
      return new Response('', { status: url.endsWith('robots.txt') ? status : 403 });
    } });
    expect(calls).toHaveLength(2);
    expect(result.robots_status).toBe(`unavailable-${status}`);
    expect(result.status).toBe('failed');
    expect(result.observations).toEqual([]);
  });
  it.each([429, 500])("does not continue when robots is rate limited or unreachable (%i)", async status => {
    let calls = 0;
    const source = { origin: 'https://bang-dream.com', public_fetch_enabled: true, robots_unavailable_statuses: [403, 404], urls: ['https://bang-dream.com/news/1/'], path_patterns: ['^/news/1/$'] };
    const result = await crawlSource(source, { fetcher: async () => { calls++; return new Response('', { status }); } });
    expect(result.status).toBe('blocked');
    expect(calls).toBe(1);
  });
  it("leaves ambiguous image categories unknown", () => {
    expect(classifyImage({ url: img('combined'), alt: "商品と特典", context: "" })).toBe("unknown");
    expect(classifyImage({ url: img('plain'), alt: "", context: "" })).toBe("unknown");
    expect(classifyImage({ url: img('menu'), alt: "メニュー", context: "特典" })).toBe("menu");
  });
  it("deduplicates by source, detects image changes, preserves failed sources and never invents travel dates", () => {
    const observation = extractObservation(html, url, "event-source");
    const source = { id: "creative" };
    const catalog = { events: [{ id: "exact-event", sources: [{ url }] }, { id: "different-event", sources: [{ url: url + "other" }] }] };
    const first = mergeAnnouncements([], [{ source, observation }], catalog, "2026-10-28T00:00:00Z");
    expect(first[0].related_event_ids).toEqual(["exact-event"]);
    expect(first[0]).not.toHaveProperty("start_date");
    expect(first[0]).not.toHaveProperty("verified_at");
    const same = mergeAnnouncements(first, [{ source, observation }], catalog, "2026-10-29T00:00:00Z");
    expect(same).toHaveLength(1);
    expect(same[0].changed_at).toBe(first[0].changed_at);
    const changed = mergeAnnouncements(same, [{ source, observation: { ...observation, images: [] } }], catalog, "2026-10-30T00:00:00Z");
    expect(changed[0].content_hash).not.toBe(first[0].content_hash);
    expect(mergeAnnouncements(changed, [], catalog, "2026-10-31T00:00:00Z")).toEqual(changed);
  });
  it("explicit public fetching still stops when robots denies access", async () => {
    const source = { origin: "https://bushiroad-creative.com", public_fetch_enabled: true, permission: "unreviewed", urls: [url], path_patterns: ["^/topics/123/$"] };
    const result = await crawlSource(source, { fetcher: async () => new Response("User-agent: *\nDisallow: /", { headers: { "content-type": "text/plain" } }), pause: async () => {} });
    expect(result.observations).toEqual([]);
    expect(result.status).toBe("failed");
  });
});
