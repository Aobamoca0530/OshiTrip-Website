import { test, expect } from "@playwright/test";

test.skip(process.env.OSHITRIP_SHARED_DATA !== "1", "Run with shared data enabled");
test("offline startup and manual refresh preserve favorites and fit the viewport", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const bar = page.getByRole("region", { name: "活动数据更新" });
  await expect(bar).toContainText("数据发布于");
  const refresh = bar.getByRole("button", { name: "刷新活动数据" });
  await expect(refresh).toBeEnabled();
  if (process.env.OSHITRIP_DATA_OFFLINE === "1") await expect(bar).toContainText("离线模式");
  await refresh.click();
  await expect(refresh).toBeEnabled();
  await page.goto("/events");
  const favorite = page.getByRole("button", { name: "收藏活动", exact: true }).first();
  await favorite.click();
  await page.getByRole("button", { name: "刷新活动数据" }).click();
  await expect(page.getByRole("button", { name: "取消收藏活动", exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "取消收藏活动", exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/data-sync-${test.info().project.name}.png`, fullPage: false });
});
