import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {Announcement} from '../../src/lib/announcements';
const announcements:Announcement[]=JSON.parse(readFileSync(new URL('../../src/data/announcements.json',import.meta.url),'utf8'));

test('new projects and host cities are available on desktop and mobile',async({page})=>{
  await page.goto('/');
  await expect(page.locator('option[value="hasunosora"]').first()).toHaveText(/莲之空/);
  await expect(page.locator('option[value="gakuen-idolmaster"]').first()).toHaveText(/学园偶像大师/);
  const series=page.locator('fieldset.ip-group').filter({has:page.locator('legend',{hasText:'Love Live!'})});
  await expect(series).toHaveCount(1);
  for(const name of ["μ's",'Aqours','Liella!','莲之空女学院学园偶像俱乐部','人生不易部！'])await expect(series.getByRole('button',{name,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/μ.*缪斯/})).toHaveCount(0);
  const values=await page.locator('select[name="ip"] option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));
  expect(values.slice(values.indexOf('lovelive'),values.indexOf('lovelive')+7)).toEqual(['lovelive','muse','aqours','nijigasaki','liella','hasunosora','ikizulive']);
  await expect(page.locator('option').filter({hasText:/^金泽$/}).first()).toHaveCount(1);
  await page.goto('/events');
  await page.getByLabel('旅行城市').selectOption({label:'沼津'});
  await expect(page.getByLabel('旅行城市')).toHaveValue('沼津');
  await page.goto('/news');
  await expect(page.getByRole('link',{name:'人生不易部 ↗',exact:true})).toHaveAttribute('href','https://www.lovelive-anime.jp/lovehigh/news/');
  await expect(page.getByRole('link',{name:'学园偶像大师厂牌新闻 ↗',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('Aqours concert galleries retain official image links',async({page})=>{
  const article=announcements.find(item=>item.source_url.endsWith('p=Wanted_Ghost'));
  expect(article).toBeDefined();
  expect(article!.images.length).toBeGreaterThan(0);
  // Keep this UI check deterministic; upstream availability is recorded by collection.
  await page.route(url=>url.hostname==='www.lovelive-anime.jp' && url.pathname.endsWith('/image.php'),route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==','base64')}));
  await page.goto('/news');
  await page.getByLabel('搜索官方公告').fill(article!.title);
  await expect(page.locator('.news-card')).toHaveCount(1);
  await page.getByText(/^查看商品及活动图片（/).click();
  const img=page.locator('.news-card img').first();
  await expect(img).toBeVisible();
  expect(article!.images.map(image=>image.url)).toContain(await img.getAttribute('src'));
  await expect(page.getByRole('link',{name:'图片官方出处 ↗'}).first()).toHaveAttribute('href',article!.source_url);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
