import {test,expect} from '@playwright/test';

test('new projects and host cities are available on desktop and mobile',async({page})=>{
  await page.goto('/');
  await expect(page.locator('option[value="hasunosora"]').first()).toHaveText(/莲之空/);
  await expect(page.locator('option[value="gakuen-idolmaster"]').first()).toHaveText('学园偶像大师');
  await expect(page.locator('option').filter({hasText:/^金泽$/}).first()).toHaveCount(1);
  await page.goto('/events');
  await page.getByLabel('旅行城市').selectOption({label:'沼津'});
  await expect(page.getByLabel('旅行城市')).toHaveValue('沼津');
  await page.goto('/news');
  await expect(page.getByRole('link',{name:'人生不易部 ↗',exact:true})).toHaveAttribute('href','https://www.lovelive-anime.jp/lovehigh/news/');
  await expect(page.getByRole('link',{name:'学园偶像大师厂牌新闻 ↗',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
