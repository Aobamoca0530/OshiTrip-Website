import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  await page.goto(
    "http://127.0.0.1:3001/events?ip=bang-dream&city=东京&start=2026-10-28&end=2027-01-11",
  );
  await page.locator(".cards-grid").scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  console.log(
    "event images",
    await page
      .locator(".event-card img")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          alt: n.alt,
          loaded: n.complete && n.naturalWidth > 0,
        })),
      ),
  );
  await page.screenshot({ path: "docs/screenshots/events-images-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "http://127.0.0.1:3001/events?ip=ave-mujica&city=东京&start=2026-10-28&end=2026-10-28",
  );
  await page
    .getByTestId("event-card")
    .filter({ hasText: "Virtus" })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "docs/screenshots/events-images-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("http://127.0.0.1:3001/releases/ras-i-am-who-i-am");
  await page
    .getByRole("combobox", { name: "店铺", exact: true })
    .selectOption("アニメイト(通販含む)");
  await page.getByTestId("retailer-offer").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  console.log(
    "bonus images",
    await page
      .getByTestId("retailer-offer")
      .locator("img")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          alt: n.alt,
          loaded: n.complete && n.naturalWidth > 0,
        })),
      ),
  );
  await page.screenshot({ path: "docs/screenshots/bonus-images-desktop.png" });
} finally {
  await browser.close();
}
