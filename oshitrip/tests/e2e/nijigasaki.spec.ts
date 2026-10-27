import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-28T12:00:00+09:00") });
});
test("Nijigasaki gifts, closed dates and detail attribution", async ({
  page,
}) => {
  await page.goto(
    "/events?ip=nijigasaki&city=大阪&category=快闪店&start=2026-12-31&end=2026-12-31&benefits=true",
  );
  await expect(page.getByTestId("event-card")).toHaveCount(0);
  await expect(page.getByLabel("只看有门店特典 / 满赠")).toBeChecked();
  await page.getByLabel("旅行开始日期").fill("2027-01-02");
  await page.getByLabel("旅行结束日期").fill("2027-01-02");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page
    .getByRole("link", {
      name: "虹咲学园 × Loft 幼稚园老师主题快闪",
      exact: true,
    })
    .click();
  const bonus = page.locator("#benefits");
  await expect(bonus).toContainText("不可合并");
  await expect(bonus).toContainText("通販不附赠");
  await expect(
    bonus.getByRole("link", { name: "查看官方领取条件" }),
  ).toHaveAttribute("href", "https://www.cocollabo.net/pages/nijigasaki");
  await expect(bonus.getByTestId("official-image")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("HEP corrected reservation and unknown fair thresholds", async ({
  page,
}) => {
  await page.goto("/events/lovelive-hep-navio-2026?venue=niji-hep-reserved");
  await page.getByLabel("计划到店日期").fill("2026-11-05");
  await expect(page.locator(".booking-panel")).toContainText(
    "2026年11月4日 23:59",
  );
  await expect(page.locator(".booking-panel")).toContainText(
    "2026年10月27日 20:00",
  );
  await page.getByLabel("参加门店").selectOption("niji-hep-later");
  await expect(page.locator(".booking-panel")).not.toContainText(
    "2026年10月27日 20:00",
  );
  await page.goto("/events/nijigasaki-sweet-collection-2027");
  await expect(page.locator("#benefits")).toContainText("未公布金额不作推算");
  await expect(page.locator("#benefits")).not.toContainText("1,100");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
