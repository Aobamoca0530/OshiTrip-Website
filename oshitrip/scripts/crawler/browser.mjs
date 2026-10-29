import { allowedUrl, crawlSource, fetchLimited, robotsAllows } from './core.mjs';
import { accessDiagnostic } from './access-diagnostics.mjs';

// Disposable, ordinary Chromium. No user profile, stealth flags or access retries.
export function createBrowserReader(source, { channel = process.env.CRAWLER_BROWSER_CHANNEL, mode = source.browser_mode || 'headless' } = {}) {
  let browser;
  let context;
  let launchError;
  let apiPolicy;
  const reader = {
    mode,
    /** @param {string} url @param {{permits?: (path: string) => boolean, content?: 'html' | 'text'}} policy */
    async read(url, { permits = () => false, content = 'html' } = {}) {
      const isRobots = content === 'text' && url === `${source.origin}/robots.txt`;
      const maxBytes = isRobots ? 100000 : 1500000;
      if ((!isRobots && !allowedUrl(url, source)) || !permits(new URL(url).pathname + new URL(url).search)) throw new Error('浏览器 URL 不在批准范围或 robots 禁止');
      if (launchError) throw launchError;
      if (source.id === 'gakuen-idolmaster-portal' && !apiPolicy) {
        try {
          apiPolicy = await fetchLimited('https://cmsapi-frontend.idolmaster-official.jp/robots.txt', { content: 'text', maxBytes: 100000 });
          if (!/^\s*user-agent\s*:/im.test(apiPolicy)) throw new Error('公共新闻接口 robots 无法识别');
        } catch (error) {
          if ([404,405].includes(error.httpStatus)) apiPolicy = 'User-agent: *\n';
          else throw error;
        }
      }
      if (!browser) {
        try {
          if (channel && !['chrome', 'msedge'].includes(channel)) throw new Error('不支持的浏览器 channel');
          if (!['headed', 'headless'].includes(mode)) throw new Error('不支持的浏览器运行模式');
          const { chromium } = await import('@playwright/test');
          browser = await chromium.launch({ headless: mode === 'headless', ...(channel ? { channel } : {}), timeout: 20000 });
          context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
        } catch (error) { launchError = error; throw error; }
      }
      const page = await context.newPage();
      let requests = 0;
      let apiError;
      try {
        if (source.id === 'gakuen-idolmaster-portal') page.on('response', response => {
          if (source.id === 'gakuen-idolmaster-portal' && response.url().startsWith('https://cmsapi-frontend.idolmaster-official.jp/') && [401,403,429].includes(response.status())) apiError = Object.assign(new Error(`HTTP ${response.status()}：公共新闻接口停止访问`), { httpStatus: response.status() });
        });
        await page.route('**/*', async route => {
          const request = route.request();
          const target = new URL(request.url());
          const mainDocument = request.resourceType() === 'document' && request.frame() === page.mainFrame();
          // No redirects, frames or third-party scripts. Only the portal's public
          // article API is allowed alongside ordinary same-origin page assets.
          const publicNewsApi = source.id === 'gakuen-idolmaster-portal' && apiPolicy
            && target.origin === 'https://cmsapi-frontend.idolmaster-official.jp'
            && /^\/sitern\/api\/(?:cmsbase\/(?:Token|SiteCommon)\/get|idolmaster\/Article\/(?:list|get))$/.test(target.pathname)
            && robotsAllows(apiPolicy, target.pathname + target.search)
            && (['fetch','xhr'].includes(request.resourceType()) || request.method() === 'OPTIONS');
          const permitted = !apiError && !request.redirectedFrom() && (request.method() === 'GET' || (publicNewsApi && request.method() === 'OPTIONS'))
            && !target.username && !target.password
            && (publicNewsApi || (target.origin === source.origin && permits(target.pathname + target.search)
            && (mainDocument ? request.url() === url : ['script', 'stylesheet'].includes(request.resourceType()))));
          // Blocked images/analytics must not consume the allowed request budget.
          if (permitted && ++requests <= 100) await route.continue(); else await route.abort();
        });
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (!response || page.url() !== url) throw new Error('浏览器返回空响应或跳转页面');
        const headers = new Headers(await response.allHeaders());
        if (!response.ok()) {
          const diagnostic = accessDiagnostic({ status: response.status(), headers }, (await page.content()).slice(0, 32768));
          throw Object.assign(new Error(`HTTP ${response.status()}；${diagnostic.conclusion}`), { httpStatus: response.status(), diagnostic });
        }
        if (!headers.get('content-type')?.includes(isRobots ? 'text/plain' : 'text/html')) throw new Error(isRobots ? 'robots 响应不是纯文本' : '响应不是 HTML');
        if (Number(headers.get('content-length')) > maxBytes) throw new Error('页面超过大小限制');
        if (source.id === 'gakuen-idolmaster-portal' && !isRobots) {
          try {
            await page.locator(new URL(url).pathname === '/news' ? 'a[href^="/news/01_"]' : '[data-theme="news_detail"] [class*="style_inner_content__"]').first().waitFor({ timeout: 12000 });
          } catch { throw apiError || new Error('官方动态新闻正文或目录未就绪，保留原资料'); }
          if (apiError) throw apiError;
        }
        const html = isRobots ? await response.text() : await page.content();
        if (Buffer.byteLength(html, 'utf8') > maxBytes) throw new Error('页面超过大小限制');
        if (source.id === 'nijigasaki-news' && new URL(url).pathname.endsWith('/topics.php') && !/href=["'][^"']*detail\.php\?p=01_\d+/i.test(html)) throw new Error('虹咲目录结构变化或返回错误页，保留原资料');
        return html;
      } finally { await page.close(); }
    },
    async readRobots(url) { return reader.read(url, { content: 'text', permits: () => true }); },
    async close() { if (browser) await browser.close(); },
  };
  return reader;
}

export async function crawlPublicSource(source, options = {}) {
  if (!source.transport || source.transport === 'http') return { ...await crawlSource(source, options), transport: 'http', browser_mode: undefined };
  if (source.transport !== 'browser') throw new Error(`Unknown crawler transport: ${source.transport}`);
  const reader = createBrowserReader(source, options.browserOptions);
  try { return { ...await crawlSource(source, { ...options, readPage: reader.read, readRobots: reader.readRobots }), transport: 'browser', browser_mode: reader.mode }; }
  finally { await reader.close(); }
}
