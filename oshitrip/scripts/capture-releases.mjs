import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
});
try {
  await mkdir("docs/screenshots", { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(
    "http://127.0.0.1:3001/releases/bushiroad-20th-anniversary-book",
  );
  await page.screenshot({ path: "docs/screenshots/bushiroad20-desktop.png" });
  await page
    .getByRole("combobox", { name: "店铺", exact: true })
    .selectOption("カドスト（角川商店）");
  await page.getByTestId("retailer-offer").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/bushiroad20-retailer.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3001/releases");
  await page.screenshot({
    path: "docs/screenshots/releases-mobile.png",
    fullPage: true,
  });
  await page.goto(
    "http://127.0.0.1:3001/releases/bushiroad-20th-anniversary-book",
  );
  await page.getByTestId("lottery-section").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/bushiroad20-mobile.png" });
} finally {
  await browser.close();
}
