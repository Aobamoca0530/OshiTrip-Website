import { test, expect } from "@playwright/test";
import fs from 'node:fs';
const releaseFixtures=JSON.parse(fs.readFileSync('src/data/releases.json','utf8')) as {status:string;release_on:string|null}[];
const publishedProducts=releaseFixtures.filter(p=>p.status==='published');
test("shopping table places lottery dates last and matches branches after release within city stays", async ({
  page,
}) => {
  await page.goto("/trip");
  await page.getByLabel("旅行开始日期", { exact: true }).fill("2026-11-09");
  await page.getByLabel("旅行结束日期", { exact: true }).fill("2026-11-23");
  await page.getByRole("button", { name: "添加城市" }).click();
  await page
    .getByRole("combobox", { name: "城市", exact: true })
    .selectOption("名古屋");
  await page.getByLabel("抵达日期").fill("2026-11-09");
  await page.getByLabel("离开日期").fill("2026-11-10");
  const row = page
    .getByTestId("trip-shopping")
    .getByTestId("release-card")
    .filter({ hasText: "世点彩" });
  await row.getByText("线下门店与查询入口", { exact: true }).click();
  await expect(row.getByTestId("store-card")).toHaveCount(0);
  await page.getByLabel("离开日期").fill("2026-11-12");
  await expect(row.getByTestId("store-card")).toHaveCount(2);
  await expect(row.getByTestId("store-card").first()).toContainText(
    "2026-11-11 — 2026-11-12",
  );
  await expect(
    row.getByRole("link", { name: "地图导航" }).first(),
  ).toHaveAttribute("href", /^https:\/\/www.google.com\/maps\/search\//);
  await expect(row.getByTestId("store-card").first()).toContainText(
    "库存未核实",
  );
  await expect(page.getByRole("columnheader").last()).toContainText("抽选开始");
  await page.getByRole("button", { name: "保存旅行计划" }).click();
  await page.reload();
  await expect(page.getByLabel("离开日期")).toHaveValue("2026-11-12");
  await row.getByText("线下门店与查询入口", { exact: true }).click();
  await expect(row.getByTestId("store-card")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-28T12:00:00+09:00") });
});
test("20th book: search, separate retailer deadline, official links and linked Live", async ({
  page,
}) => {
  await page.goto("/releases");
  await page.getByLabel("商品 / Live 关键词").fill("20周年");
  await expect(page.getByTestId("release-card")).toHaveCount(1);
  await page.getByRole("link", { name: "查看版本、特典与预约日期" }).click();
  await expect(page.locator("h1")).toContainText("アニバーサリーブック");
  await expect(page.getByTestId("lottery-section")).toContainText(
    "申请详情后日公开",
  );
  await expect(page.getByTestId("lottery-section")).not.toContainText(
    "2026-11-15",
  );
  await page
    .getByRole("combobox", { name: "店铺", exact: true })
    .selectOption("カドスト（角川商店）");
  await expect(page.getByTestId("retailer-offer")).toHaveCount(1);
  await expect(page.getByTestId("retailer-offer")).toContainText(
    "2026-11-15 23:59",
  );
  await expect(
    page.getByRole("link", { name: "前往店铺商品页" }),
  ).toHaveAttribute(
    "href",
    "https://store.kadokawa.co.jp/shop/g/gca1920076016004/",
  );
  await page
    .getByRole("link", { name: "查看 Live 场次、收藏或加入旅行备选" })
    .click();
  await expect(page.locator("h1")).toHaveText("武士道20周年纪念 Live");
  await expect(
    page.getByText("横浜アリーナ DAY1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "收藏活动", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "取消收藏活动" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "附券商品、店铺预约与特典", exact: false })
    .click();
  await expect(page.locator("h1")).toContainText("アニバーサリーブック");
});
test("retailer and edition combinations never borrow another edition's bonus", async ({
  page,
}) => {
  await page.goto("/releases/ave-mujica-kami-no-na-wo");
  await page
    .getByRole("combobox", { name: "商品版本", exact: true })
    .selectOption("special");
  await expect(page.getByTestId("retailer-offer")).toHaveCount(1);
  await expect(page.getByTestId("retailer-offer")).toContainText(
    "ブシロード オンラインストア",
  );
  await page
    .getByRole("combobox", { name: "店铺", exact: true })
    .selectOption("ゲーマーズ");
  await expect(page.getByTestId("retailer-offer")).toHaveCount(0);
  await expect(
    page.getByText("该版本没有此店的已核实记录", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "商品版本", exact: true })
    .selectOption("cd");
  await expect(page.getByTestId("retailer-offer")).toContainText(
    "56mm徽章＋L判照片",
  );
  await page.goto("/releases/mygo-setensai");
  await expect(page.getByTestId("campaign-section")).toContainText(
    "2026-10-11 23:59",
  );
  await expect(page.getByTestId("lottery-section")).not.toContainText(
    "2026-10-11",
  );
  await page
    .getByRole("combobox", { name: "商品版本", exact: true })
    .selectOption("cd");
  await page
    .getByRole("combobox", { name: "店铺", exact: true })
    .selectOption("ゲーマーズ");
  await expect(page.getByTestId("retailer-offer")).not.toContainText("徽章");
});
test("release filters combine and unknown lotteries are never presented as open", async ({
  page,
}) => {
  await page.goto("/releases");
  await page.clock.runFor(30001);
  await expect(page.getByTestId("release-card")).toHaveCount(publishedProducts.length);
  await page.getByLabel("仅看今日及以后发售").check();
  await expect(page.getByTestId("release-card")).toHaveCount(publishedProducts.filter(p=>p.release_on && p.release_on>='2026-10-28').length);
  await page.getByRole("combobox", { name: "关联企划" }).selectOption("mygo");
  await expect(page.getByTestId("release-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Live 抽选状态" })
    .selectOption("open");
  await expect(page.getByTestId("release-card")).toHaveCount(0);
  await expect(page.getByText("没有匹配的商品")).toBeVisible();
  await page.getByRole("button", { name: "清空筛选" }).click();
  await expect(page.getByTestId("release-card")).toHaveCount(publishedProducts.length);
});

test('Liella vouchers and historical Live applications are grouped by IP with distinct Day1/Day2',async({page})=>{
  await page.route(url=>url.hostname==='www.lovelive-anime.jp' && url.pathname.endsWith('/image.php'),route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#ddd"/></svg>'}));
  await page.goto('/releases');
  await page.getByRole('combobox',{name:'关联企划',exact:true}).selectOption('liella');
  await expect(page.getByTestId('release-card')).toHaveCount(2);
  await expect(page.getByTestId('release-ip-group').getByRole('heading',{level:2})).toContainText('Liella!');
  await page.getByRole('combobox',{name:'Live 报名企划',exact:true}).selectOption('liella');
  const live=page.getByTestId('live-lottery-card').filter({hasText:'八巡'});
  await live.locator(':scope > summary').click();
  await expect(live).toContainText('2026-11-18 12:00');
  await expect(live).toContainText('2026-11-27 12:00');
  await expect(live.getByRole('link',{name:'ラブライブ！スーパースター!! ファンディスク第2弾',exact:false})).toBeVisible();
  await live.getByTestId('lottery-images').locator('summary').click();
  await expect(live.locator('img').first()).toBeVisible();
  await expect(live.getByRole('link',{name:'图片官方出处 ↗'}).first()).toHaveAttribute('href','https://www.lovelive-anime.jp/yuigaoka/live/live_detail.php?p=8thlivetour');
  await page.getByRole('combobox',{name:'Live 报名企划',exact:true}).selectOption('lovelive');
  await expect(page.getByTestId('live-lottery-card').filter({hasText:'103期毕业公演'})).toHaveCount(1);
  await page.getByRole('combobox',{name:'Live 报名企划',exact:true}).selectOption('starlight');
  await expect(page.getByTestId('live-lottery-card').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});
