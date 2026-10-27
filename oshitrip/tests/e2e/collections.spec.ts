import { test, expect } from "@playwright/test";
test("one collection keeps all nine branches, filtered dates and image-backed Chinese rules", async ({
  page,
}) => {
  await page.goto("/events?ip=our-notes&category=联动咖啡厅");
  const card = page
    .getByTestId("event-card")
    .filter({ hasText: "SWEETS PARADISE" });
  await expect(card).toHaveCount(1);
  await card.locator("summary").click();
  await expect(card.getByTestId("collection-venue")).toHaveCount(9);
  await page.getByLabel("旅行城市").selectOption("京都");
  await page.getByLabel("旅行开始日期").fill("2026-11-23");
  await page.getByLabel("旅行结束日期").fill("2026-11-23");
  await expect(card.getByTestId("collection-venue")).toHaveCount(1);
  await card.getByRole("link", { name: "查看合集与中文规则" }).click();
  await expect(page.locator("#rules")).toContainText("餐食与甜点合计最多 5 份");
  await expect(page.locator("#rules")).toContainText(
    "每人每次入店只能结账购买周边 1 次",
  );
  await expect(page.locator("#venues .venue-row")).toHaveCount(9);
  await expect(page.locator("#benefits .event-gallery img")).toHaveCount(8);
  const rule = page
    .locator("#rules article")
    .filter({ hasText: "首次餐食甜点合计" });
  await rule.locator("summary").click();
  await expect(rule.locator('a[href*="wp-content/uploads"]')).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
