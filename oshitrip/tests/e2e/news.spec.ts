import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Announcement } from "../../src/lib/announcements";
const announcements: Announcement[] = JSON.parse(
  readFileSync(
    new URL("../../src/data/announcements.json", import.meta.url),
    "utf8",
  ),
);
test("official announcements expose merchandise separately and retain original sources", async ({
  page,
}) => {
  const example = announcements.find((item) =>
    item.images.some((image) => image.kind === "merchandise"),
  );
  test.skip(!example, "No merchandise announcements in the current snapshot");
  await page.goto("/news");
  await expect(
    page.getByRole("heading", { name: "官方新消息与商品图", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "虹咲公式X" })).toHaveAttribute(
    "href",
    "https://x.com/Nijigaku_movie",
  );
  await expect(
    page.getByText("官网公告每日采集；X 为官方入口，尚未自动同步帖子。"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "少女歌剧官网新闻" }),
  ).toHaveAttribute("href", "https://revuestarlight.com/news/");
  await page.getByLabel("搜索官方公告").fill(example!.title);
  await expect(page.locator(".news-card")).toHaveCount(1);
  await page.getByText(/^查看商品及活动图片（/).click();
  await expect(page.getByRole("heading", { name: /售卖商品图/ })).toBeVisible();
  await expect(page.locator(".news-card")).toContainText(
    example!.activity?.state === "ready"
      ? "中文为辅助译文"
      : "尚未据此加入行程匹配",
  );
  await expect(
    page.getByRole("link", { name: "阅读完整官方公告" }),
  ).toHaveAttribute("href", example!.source_url);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/news-${test.info().project.name}.png`,
    fullPage: false,
  });
});

test("official news has separate offline and Live collections and discovery review links", async ({
  page,
}) => {
  await page.goto("/news");
  await page.getByRole("button", { name: /^Live 合集 ·/ }).click();
  await expect(
    page.getByRole("region", { name: "线下活动官方消息" }),
  ).toHaveCount(0);
  const live = page.getByRole("region", { name: "Live 官方消息" });
  await expect(live).toBeVisible();
  const liveIds = new Set(
    announcements
      .filter((item) => item.activity?.kind === "live")
      .map((item) => `announcement-${item.id}`),
  );
  for (const id of await live
    .locator(".news-card")
    .evaluateAll((nodes) => nodes.map((node) => node.id)))
    expect(liveIds.has(id)).toBe(true);
  await page.getByRole("button", { name: /^线下活动合集 ·/ }).click();
  await expect(page.getByRole("region", { name: "Live 官方消息" })).toHaveCount(
    0,
  );
  const pending = announcements.find(
    (item) =>
      item.activity?.state !== "ready" && item.activity?.kind === "offline",
  );
  if (pending) {
    await page.getByLabel("搜索官方公告").fill(pending.title);
    await page.getByRole("link", { name: "已推送至发现活动 · 待审核" }).click();
    await expect(page.locator(`#announcement-${pending.id}`)).toBeVisible();
  }
});
