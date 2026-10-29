import { afterEach, describe, expect, it, vi } from 'vitest';
import { crawlPublicSource, createBrowserReader } from '../../scripts/crawler/browser.mjs';
import { chromium, type Browser } from '@playwright/test';
vi.mock('@playwright/test', () => ({ chromium: { launch: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

const origin = 'https://www.lovelive-anime.jp';
const index = `${origin}/nijigasaki/topics.php`;
const detail = `${origin}/nijigasaki/detail.php?p=01_6700`;
const source = { id: 'nijigasaki-news', origin, index_url: index, urls: [detail], kind: 'event-source', transport: 'browser', public_fetch_enabled: true, path_patterns: ['^/nijigasaki/(topics|detail)\\.php$'], query_rules: { '/nijigasaki/detail.php': { p: '^01_[0-9]{1,6}$' } } };
const article = `<article><div class="newsbox"><h1>虹ヶ咲 コラボイベント</h1><p>2027年1月30日から2027年2月28日まで、アニメイトで開催。${'これは解析テスト専用の文章です。'.repeat(10)}</p></div></article>`;
function fixture(status = 200, body = article, robotsBody = 'User-agent: *\nAllow: /') {
  let current = '';
  const page = {
    route: vi.fn(), mainFrame: vi.fn(), on: vi.fn(),
    locator: vi.fn(() => ({first:()=>({waitFor:async()=>{}})})),
    goto: vi.fn(async (url: string) => { current = url; const isRobots = url.endsWith('/robots.txt'); return { ok: () => isRobots || status === 200, status: () => isRobots ? 200 : status, allHeaders: async () => ({ 'content-type': isRobots ? 'text/plain' : 'text/html' }), text: async () => robotsBody }; }),
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
  it.each(['headed', 'headless'])('uses the configured %s mode without modifying identity or browser flags', async (mode) => {
    const f = fixture();
    const result = await crawlPublicSource({ ...source, browser_mode: mode }, { fetcher: robots, pause: async () => {}, browserOptions: { channel: 'msedge' } });
    expect(result.status).toBe('success');
    expect(result.browser_mode).toBe(mode);
    expect(f.launch).toHaveBeenCalledWith({ channel: 'msedge', headless: mode === 'headless', timeout: 20000 });
  });
  it('fails closed on an invalid browser mode', async () => {
    const f = fixture();
    const result = await crawlPublicSource({ ...source, browser_mode: 'invalid' }, { fetcher: robots, pause: async () => {} });
    expect(result.status).toBe('blocked');
    expect(f.launch).not.toHaveBeenCalled();
  });
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
    expect(result.robots_status).toBe('rules');
    expect(f.page.close).toHaveBeenCalledTimes(3);
    expect(f.browser.close).toHaveBeenCalledOnce();
  });
  it('stops at a 403 directory and preserves deferred details without retrying', async () => {
    const f = fixture(403, 'NOT FOUND');
    const result = await crawlPublicSource(source, { fetcher: robots, pause: async () => {}, browserOptions: { launch: f.launch } });
    expect(result.status).toBe('failed');
    expect(result.observations).toEqual([]);
    expect(result.deferred_urls).toEqual([detail]);
    expect(result.access_diagnostics?.[0].http_status).toBe(403);
    expect(f.page.goto).toHaveBeenCalledTimes(2);
    expect(f.browser.close).toHaveBeenCalledOnce();
  });
  it('reads robots through the same browser and never navigates to forbidden articles', async () => {
    const f = fixture(200, article, 'User-agent: *\nDisallow: /');
    const result = await crawlPublicSource(source, { fetcher: async () => new Response('User-agent: *\nDisallow: /'), pause: async () => {}, browserOptions: { launch: f.launch } });
    expect(result.observations).toEqual([]);
    expect(f.page.goto).toHaveBeenCalledTimes(1);
    expect(f.page.goto.mock.calls[0][0]).toBe(`${origin}/robots.txt`);
    expect(f.browser.close).toHaveBeenCalledOnce();
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
  it('allows only public portal article APIs and stops their traffic after a 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async()=>new Response('', {status:405})));
    const f = fixture();
    const portal = {...source,id:'gakuen-idolmaster-portal',origin:'https://idolmaster-official.jp',path_patterns:['^/news/01_[0-9]+$']};
    const reader = createBrowserReader(portal);
    await reader.read(portal.origin+'/news/01_20212',{permits:()=>true});
    const handle = f.page.route.mock.calls[0][1];
    const request = async (path:string,method='GET',type='fetch') => {
      const route={request:()=>({url:()=>`https://cmsapi-frontend.idolmaster-official.jp${path}`,redirectedFrom:()=>null,method:()=>method,resourceType:()=>type,frame:f.page.mainFrame}),continue:vi.fn(),abort:vi.fn()};
      await handle(route); return route;
    };
    for(let i=0;i<105;i++) expect((await request('/image.png','GET','image')).abort).toHaveBeenCalledOnce();
    expect((await request('/sitern/api/cmsbase/Token/get')).continue).toHaveBeenCalledOnce();
    expect((await request('/sitern/api/idolmaster/Article/list','OPTIONS','other')).continue).toHaveBeenCalledOnce();
    expect((await request('/sitern/api/idolmaster/Article/list','POST')).abort).toHaveBeenCalledOnce();
    expect((await request('/api/v1_1_0/auths/login/check')).abort).toHaveBeenCalledOnce();
    const response = f.page.on.mock.calls[0][1];
    response({url:()=> 'https://cmsapi-frontend.idolmaster-official.jp/sitern/api/idolmaster/Article/list',status:()=>429});
    expect((await request('/sitern/api/idolmaster/Article/list')).abort).toHaveBeenCalledOnce();
    await reader.close();
  });
});
