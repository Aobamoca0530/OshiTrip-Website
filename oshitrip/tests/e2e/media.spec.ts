import { test, expect } from "@playwright/test";
import products from "../../src/data/releases.json" with { type: "json" };
test("activity images retain source access when the remote image fails", async ({
  page,
}) => {
  await page.route(
    "https://bushiroad-creative.com/wordpress/wp-content/uploads/**",
    (route) => route.abort(),
  );
  await page.goto(
    "/events?ip=ave-mujica&city=东京&start=2026-10-28&end=2026-10-28",
  );
  const card = page.getByTestId("event-card").filter({ hasText: "Virtus" });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("图片暂不可用 · 查看官方图片")).toBeVisible();
  await expect(
    card.getByTestId("official-image").getByRole("link"),
  ).toHaveAttribute("href", "https://bushiroad-creative.com/topics/106228/");
  await expect(
    page.getByLabel("IP / 子系列").locator('option[value="roselia"]'),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("retailer image changes with the product edition and added band filter works", async ({
  page,
}) => {
  // Deterministic UI check: remote availability is verified separately in visual review.
  await page.route(
    "https://bang-dream.com/wordpress/wp-content/uploads/**",
    (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#cdd4bf"/></svg>',
      }),
  );
  await page.goto("/releases");
  await page
    .getByRole("combobox", { name: "关联企划" })
    .selectOption("raise-a-suilen");
  await expect(page.getByTestId("release-card")).toHaveCount(1);
  await page.getByRole("link", { name: "查看版本、特典与预约日期" }).click();
  await page
    .getByRole("combobox", { name: "店铺", exact: true })
    .selectOption("アニメイト(通販含む)");
  const p = products.find((p) => p.id === "ras-i-am-who-i-am")!;
  for (const edition of ["bd", "cd"]) {
    await page
      .getByRole("combobox", { name: "商品版本", exact: true })
      .selectOption(edition);
    const expected = (p.images || []).filter(
      (i) =>
        i.kind === "bonus" &&
        i.retailer === "アニメイト(通販含む)" &&
        i.edition_ids.includes(edition),
    );
    expect(expected.length).toBeGreaterThan(0);
    const images = page.getByTestId("retailer-offer").locator("img");
    await expect(images).toHaveCount(expected.length);
    expect(
      await images.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("src")),
      ),
    ).toEqual(expected.map((i) => i.url));
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
