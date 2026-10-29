import { test, expect } from '@playwright/test';
import catalog from '../../src/data/catalog.json' with { type: 'json' };
import announcements from '../../src/data/announcements.json' with { type: 'json' };

test('reviewed news appears in discovery with all official images and branch dates', async ({page}) => {
  const source='https://www.sweets-paradise.jp/collaboration/ournotes';
  const event=catalog.events.find(event=>event.sources.some(s=>s.url===source))!;
  const row=announcements.find(row=>row.source_url===source)!;
  expect(row.activity.state).toBe('ready');
  expect(row.related_event_ids).toContain(event.id);
  // UI checks use a stable image response, not a claim of upstream availability.
  await page.route('https://**/*', route => route.request().resourceType()==='image'
    ? route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140"><rect width="200" height="140" fill="#ddd"/></svg>'}) : route.continue());
  await page.goto('/events?ip=our-notes&city=东京&start=2026-11-05&end=2026-11-05');
  const card=page.getByTestId('event-card').filter({hasText:event.title_zh});
  await expect(card).toHaveCount(1);
  await card.getByRole('link',{name:event.title_zh,exact:true}).click();
  await expect(page.locator('#venues .venue-row')).toHaveCount(9);
  await expect(page.locator('#benefits')).toContainText('收录图片不代表图中文字已逐项核实');
  await expect(page.locator('#benefits .event-gallery .official-image')).toHaveCount(new Set(row.images.map(i=>i.url)).size);
  for (const href of await page.locator('#benefits .event-gallery figcaption a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))) expect(href).toBe(source);
  expect(await page.locator('#benefits .event-gallery img').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')))).toEqual(event.gallery!.map(i=>i.url));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`test-results/discovery-promotion-${test.info().project.name}.png`,fullPage:false});
  const fresh=catalog.events.find(event=>event.sources.some(s=>s.url==='https://bushiroad-creative.com/topics/103670/'))!;
  await page.goto('/events?city=名古屋&start=2026-11-10&end=2026-11-10');
  await page.getByTestId('event-card').filter({hasText:fresh.title_zh}).getByRole('link',{name:fresh.title_zh,exact:true}).click();
  await expect(page.locator('#benefits .event-gallery .official-image')).toHaveCount(23);
  await expect(page.locator('#venues')).toContainText('ジーストア名古屋');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
