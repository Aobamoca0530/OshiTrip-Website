import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-25T12:00:00+09:00") });
});
test("home to Osaka search, official App details and persistent favorites", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Our Notes", exact: false }).click();
  await page.getByLabel("去哪座城市").selectOption("大阪");
  await page.getByLabel("出发日期").fill("2026-11-13");
  await page.getByLabel("返程日期").fill("2026-11-23");
  await page.getByRole("button", { name: "寻找旅行期间的联动" }).click();
  await page.getByLabel("活动分类").selectOption("联动咖啡厅");
  await page.getByLabel("IP / 子系列").selectOption("our-notes");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card")).toContainText("梅田店");
  await page.getByRole("button", { name: "收藏活动", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "取消收藏活动" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "查看梅田店详情" }).click();
  await page.getByLabel("计划到店日期").fill("2026-11-14");
  await expect(
    page.getByText("处于预约开放时间范围内，剩余名额请到官网确认。"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "前往官方 App 说明" }),
  ).toHaveAttribute("href", "https://www.sweets-paradise.jp/app/");
  await expect(
    page.getByRole("link", { name: "SWEETS PARADISE 官方活动公告" }),
  ).toHaveAttribute("target", "_blank");
  await page
    .getByRole("button", { name: "加入旅行备选", exact: true })
    .last()
    .click();
  await page.goto("/favorites");
  await expect(
    page.getByRole("button", { name: "Our Notes", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.goto("/trip");
  await expect(
    page.getByText("梅田店", { exact: false }).first(),
  ).toBeVisible();
});
test("real boundary dates, filters and empty states", async ({ page }) => {
  await page.goto(
    "/events?ip=our-notes&city=京都&start=2026-11-23&end=2026-11-23&category=联动咖啡厅",
  );
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.getByLabel("旅行城市").selectOption("神户");
  await page.getByLabel("旅行开始日期").fill("2026-11-01");
  await page.getByLabel("旅行结束日期").fill("2026-11-09");
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await expect(page.getByText("暂时没有匹配活动")).toBeVisible();
  await page.getByLabel("旅行开始日期").fill("2026-11-14");
  await page.getByLabel("旅行结束日期").fill("2026-11-14");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.getByLabel("IP / 子系列").selectOption("lovelive");
  await expect(page.getByTestId("event-card")).toHaveCount(0);
});
test("city-specific trip and arrangements survive refresh", async ({
  page,
}) => {
  await page.goto("/trip");
  await page.getByLabel("旅行开始日期", { exact: true }).fill("2026-11-01");
  await page.getByLabel("旅行结束日期", { exact: true }).fill("2026-11-23");
  await page.getByRole("button", { name: "添加城市" }).click();
  await page
    .getByRole("combobox", { name: "城市", exact: true })
    .selectOption("神户");
  await page.getByLabel("抵达日期").fill("2026-11-01");
  await page.getByLabel("离开日期").fill("2026-11-09");
  await page.getByRole("button", { name: "保存旅行计划" }).click();
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await page.getByLabel("抵达日期").fill("2026-11-14");
  await page.getByLabel("离开日期").fill("2026-11-15");
  await page.getByRole("button", { name: "添加安排" }).click();
  await page.getByLabel("安排名称").fill("我的私人 Live 笔记");
  await page.getByLabel("日期", { exact: true }).fill("2026-11-14");
  await page.getByLabel("地点", { exact: true }).fill("个人待确认地点");
  await page.getByRole("button", { name: "保存旅行计划" }).click();
  await page.reload();
  await expect(page.getByLabel("抵达日期")).toHaveValue("2026-11-14");
  await expect(page.getByLabel("安排名称")).toHaveValue("我的私人 Live 笔记");
  await expect(page.getByTestId("event-card")).toHaveCount(2);
  await expect(
    page.getByTestId("event-card").filter({ hasText: "クレフィ三宮店" }),
  ).toHaveCount(1);
});
test("all core pages fit viewport and have no runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "/",
    "/events",
    "/events/ournotes-sweets-paradise-2026",
    "/events/bushiroad-20th-live-2027",
    "/releases",
    "/releases/bushiroad-20th-anniversary-book",
    "/releases/mygo-setensai",
    "/releases/ave-mujica-kami-no-na-wo",
    "/trip",
    "/favorites",
    "/admin",
    "/about",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      path,
    ).toBe(true);
  }
  await expect(
    page.getByText("OshiTrip 是个人非商业的日本 IP 联动活动查询工具。"),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("local admin is honest and invalid saved data is recoverable", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.getByText("当前为本地资料模式")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存到数据库" })).toHaveCount(
    0,
  );
  await page.evaluate(() =>
    localStorage.setItem("oshitrip.personal.v1", "broken-json"),
  );
  await page.goto("/favorites");
  await expect(
    page.getByText("浏览器中保存的数据格式损坏", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Our Notes", exact: false }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Our Notes", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
});
