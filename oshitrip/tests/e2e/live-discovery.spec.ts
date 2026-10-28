import { test, expect } from "@playwright/test";
test("Live collection separates tours and links Chinese lottery rules to eligible products", async ({
  page,
}) => {
  await page.goto("/events");
  await page.getByRole("button", { name: "Live 合集", exact: true }).click();
  const live = page.getByRole("region", { name: "Live 合集", exact: true });
  await expect(
    live.getByText("Roselia 十周年巡回演唱会", { exact: true }),
  ).toBeVisible();
  await expect(
    live.getByText("RAISE A SUILEN 2027 巡回演唱会", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "联动与快闪", exact: true }),
  ).toHaveCount(0);
  await live
    .getByRole("link", { name: "RAISE A SUILEN 2027 巡回演唱会", exact: true })
    .click();
  await expect(page.locator("#venues .venue-row")).toHaveCount(5);
  await expect(page.locator("#rules")).toContainText("I AM WHO I AM");
  await expect(page.locator("#rules")).toContainText(
    "当前不能据此判断报名已开放",
  );
  await expect(
    page.getByRole("link", { name: /附券商品.*I AM WHO I AM/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
