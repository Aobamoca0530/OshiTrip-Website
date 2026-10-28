import { allowedUrl, crawlSource } from './core.mjs';
import { accessDiagnostic } from './access-diagnostics.mjs';

// Disposable, ordinary Chromium. No user profile, stealth flags or access retries.
export function createBrowserReader(source, { channel = process.env.CRAWLER_BROWSER_CHANNEL } = {}) {
  let browser;
  let context;
  let launchError;
  return {
    /** @param {string} url @param {{permits?: (path: string) => boolean}} policy */
    async read(url, { permits = () => false } = {}) {
      if (!allowedUrl(url, source) || !permits(new URL(url).pathname + new URL(url).search)) throw new Error('浏览器 URL 不在批准范围或 robots 禁止');
      if (launchError) throw launchError;
      if (!browser) {
        try {
          if (channel && !['chrome', 'msedge'].includes(channel)) throw new Error('不支持的浏览器 channel');
          const { chromium } = await import('@playwright/test');
          browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}), timeout: 20000 });
          context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
        } catch (error) { launchError = error; throw error; }
      }
      const page = await context.newPage();
      let requests = 0;
      try {
        await page.route('**/*', async route => {
          const request = route.request();
          const target = new URL(request.url());
          const mainDocument = request.resourceType() === 'document' && request.frame() === page.mainFrame();
          // No redirects, frames, third-party scripts, images or background API traffic.
          const permitted = ++requests <= 60 && !request.redirectedFrom() && request.method() === 'GET'
            && target.origin === source.origin && !target.username && !target.password
            && permits(target.pathname + target.search)
            && (mainDocument ? request.url() === url : ['script', 'stylesheet'].includes(request.resourceType()));
          if (permitted) await route.continue(); else await route.abort();
        });
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (!response || page.url() !== url) throw new Error('浏览器返回空响应或跳转页面');
        const headers = new Headers(await response.allHeaders());
        if (!response.ok()) {
          const diagnostic = accessDiagnostic({ status: response.status(), headers }, (await page.content()).slice(0, 32768));
          throw Object.assign(new Error(`HTTP ${response.status()}；${diagnostic.conclusion}`), { httpStatus: response.status(), diagnostic });
        }
        if (!headers.get('content-type')?.includes('text/html')) throw new Error('响应不是 HTML');
        if (Number(headers.get('content-length')) > 1500000) throw new Error('页面超过大小限制');
        const html = await page.content();
        if (Buffer.byteLength(html, 'utf8') > 1500000) throw new Error('页面超过大小限制');
        if (source.id === 'nijigasaki-news' && new URL(url).pathname.endsWith('/topics.php') && !/href=["'][^"']*detail\.php\?p=01_\d+/i.test(html)) throw new Error('虹咲目录结构变化或返回错误页，保留原资料');
        return html;
      } finally { await page.close(); }
    },
    async close() { if (browser) await browser.close(); },
  };
}

export async function crawlPublicSource(source, options = {}) {
  if (!source.transport || source.transport === 'http') return { ...await crawlSource(source, options), transport: 'http' };
  if (source.transport !== 'browser') throw new Error(`Unknown crawler transport: ${source.transport}`);
  const reader = createBrowserReader(source, options.browserOptions);
  try { return { ...await crawlSource(source, { ...options, readPage: reader.read }), transport: 'browser' }; }
  finally { await reader.close(); }
}
