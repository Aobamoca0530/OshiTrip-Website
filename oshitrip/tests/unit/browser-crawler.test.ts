import { describe, expect, it, vi } from 'vitest';
import { crawlPublicSource, createBrowserReader } from '../../scripts/crawler/browser.mjs';
import { chromium, type Browser } from '@playwright/test';
vi.mock('@playwright/test', () => ({ chromium: { launch: vi.fn() } }));

const origin = 'https://www.lovelive-anime.jp';
const index = `${origin}/nijigasaki/topics.php`;
const detail = `${origin}/nijigasaki/detail.php?p=01_6700`;
const source = { id: 'nijigasaki-news', origin, index_url: index, urls: [detail], kind: 'event-source', transport: 'browser', public_fetch_enabled: true, path_patterns: ['^/nijigasaki/(topics|detail)\\.php$'], query_rules: { '/nijigasaki/detail.php': { p: '^01_[0-9]{1,6}$' } } };
const article = `<article><div class="newsbox"><h1>虹ヶ咲 コラボイベント</h1><p>2027年1月30日から2027年2月28日まで、アニメイトで開催。${'これは解析テスト専用の文章です。'.repeat(10)}</p></div></article>`;
function fixture(status = 200, body = article) {
  let current = '';
  const page = {
    route: vi.fn(), mainFrame: vi.fn(),
    goto: vi.fn(async (url: string) => { current = url; return { ok: () => status === 200, status: () => status, allHeaders: async () => ({ 'content-type': 'text/html' }) }; }),
    url: () => current,
    content: vi.fn(async () => current === index && status === 200 ? `<a href="${detail}">コラボ</a>` : body),
    close: vi.fn(),
  };
  const browser = { newContext: vi.fn(async () => ({ newPage: async () => page })), close: vi.fn() };
  const launch = vi.mocked(chromium.launch).mockReset().mockResolvedValue(browser as unknown as Browser);
  return { page, browser, launch };
}
const robots = async () => new Response('User-agent: *\nAllow: /');

describe('browser-assisted public collection', () => {
  it('feeds browser DOM through the existing observation parser, without approving it', async () => {
    const f = fixture();
    const result = await crawlPublicSource(source, { fetcher: robots, pause: async () => {}, browserOptions: { launch: f.launch } });
    expect(result.errors).toEqual([]);
    expect(result.status).toBe('success');
    expect(result.transport).toBe('browser');
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].source_url).toBe(detail);
    expect(result.observations[0].body_text).toContain('2027年1月30日');
    expect(result.observations[0]).not.toHaveProperty('activity');
    expect(f.page.close).toHaveBeenCalledTimes(2);
    expect(f.browser.close).toHaveBeenCalledOnce();
  });
  it('stops at a 403 directory and preserves deferred details without retrying', async () => {
    const f = fixture(403, 'NOT FOUND');
    const result = await crawlPublicSource(source, { fetcher: robots, pause: async () => {}, browserOptions: { launch: f.launch } });
    expect(result.status).toBe('failed');
    expect(result.observations).toEqual([]);
    expect(result.deferred_urls).toEqual([detail]);
    expect(result.access_diagnostics?.[0].http_status).toBe(403);
    expect(f.page.goto).toHaveBeenCalledTimes(1);
    expect(f.browser.close).toHaveBeenCalledOnce();
  });
  it('does not launch a browser when robots forbids the source', async () => {
    const f = fixture();
    const result = await crawlPublicSource(source, { fetcher: async () => new Response('User-agent: *\nDisallow: /'), pause: async () => {}, browserOptions: { launch: f.launch } });
    expect(result.observations).toEqual([]);
    expect(f.launch).not.toHaveBeenCalled();
  });
  it('rejects foreign URLs, redirects and third-party resources', async () => {
    const f = fixture();
    const reader = createBrowserReader(source);
    await expect(reader.read('https://evil.test/', { permits: () => true })).rejects.toThrow();
    expect(f.launch).not.toHaveBeenCalled();
    await reader.read(detail, { permits: () => true });
    const handle = f.page.route.mock.calls[0][1];
    for (const [url, redirected, type] of [[detail, true, 'document'], ['https://evil.test/script.js', false, 'script'], [`${origin}/track`, false, 'fetch']] as const) {
      const route = { request: () => ({ url: () => url, redirectedFrom: () => redirected, method: () => 'GET', resourceType: () => type, frame: f.page.mainFrame }), continue: vi.fn(), abort: vi.fn() };
      await handle(route);
      expect(route.abort).toHaveBeenCalledOnce();
      expect(route.continue).not.toHaveBeenCalled();
    }
    await reader.close();
  });
  it('closes the page and browser when parsing fails', async () => {
    const f = fixture(200, '<h1>NOT FOUND</h1>');
    const result = await crawlPublicSource(source, { fetcher: robots, pause: async () => {}, browserOptions: { launch: f.launch } });
    expect(result.status).toBe('failed');
    expect(result.observations).toEqual([]);
    expect(f.browser.close).toHaveBeenCalledOnce();
  });
});
