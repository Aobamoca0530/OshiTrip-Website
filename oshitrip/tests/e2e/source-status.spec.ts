import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { SourceStatus } from "../../src/lib/source-status";
import type { Announcement } from "../../src/lib/announcements";
const status: SourceStatus = JSON.parse(
  readFileSync(
    new URL("../../src/data/source-status.json", import.meta.url),
    "utf8",
  ),
);
const announcements: Announcement[] = JSON.parse(
  readFileSync(
    new URL("../../src/data/announcements.json", import.meta.url),
    "utf8",
  ),
);

test("source dashboard shows real snapshot failures and supports review filters", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin");
  await page
    .getByRole("link", { name: "来源状态与待审核", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "来源状态与待审核", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "报告时间" })).toContainText(
    "不发布新资料",
  );
  await expect(page.locator(".source-card")).toHaveCount(status.sources.length);
  const failed = status.sources.find((s) => s.state === "failed");
  if (failed) {
    const card = page.locator(".source-card").filter({
      has: page.getByRole("heading", { name: failed.name, exact: true }),
    });
    await expect(card).toContainText("读取失败");
    if (!failed.last_success_at) await expect(card).toContainText("暂无记录");
  }
  await page.getByLabel("只看需关注来源").check();
  await expect(page.locator(".source-card")).toHaveCount(
    status.sources.filter((s) =>
      ["failed", "blocked", "partial", "unknown"].includes(s.state),
    ).length,
  );
  await page.screenshot({
    path: `test-results/sources-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: /^待审核 ·/ }).click();
  const pending = announcements.filter((a) => a.activity?.state !== "ready");
  await expect(
    page.getByRole("status").filter({ hasText: "找到" }),
  ).toContainText(`找到 ${pending.length} 条待办`);
  const example = pending[0];
  if (example) {
    await page.getByLabel("搜索待审核公告").fill(example.title);
    await expect(page.locator(".review-card")).toHaveCount(1);
    await expect(page.locator(".review-card")).toContainText(
      example.activity?.reason || "等待对照官方原文翻译与审核。",
    );
    await expect(
      page.getByRole("link", { name: "对照官方原文" }),
    ).toHaveAttribute("href", example.source_url);
    await page.getByText("查看现有摘要与原文依据", { exact: true }).click();
    await expect(page.locator(".review-card details")).toHaveAttribute(
      "open",
      "",
    );
  }
  await page.getByLabel("搜索待审核公告").fill("__没有匹配的公告__");
  await expect(
    page.getByRole("heading", { name: "没有符合筛选条件的待办" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "清除筛选", exact: true })
    .first()
    .click();
  await page.getByLabel("处理阶段").selectOption("missing");
  const missing = pending.filter((a) =>
    status.unread_announcement_ids.includes(a.id),
  );
  await expect(page.locator(".review-card")).toHaveCount(
    Math.min(15, missing.length),
  );
  for (const card of await page.locator(".review-card").all())
    await expect(card).toContainText("本轮缺少正文");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/review-${test.info().project.name}.png`,
    fullPage: false,
  });
});

test("source card drills into its review queue and clear filters restores all items", async ({
  page,
}) => {
  await page.goto("/admin/sources");
  const source = status.sources.find((s) =>
    announcements.some(
      (a) => a.source_id === s.id && a.activity?.state !== "ready",
    ),
  );
  test.skip(!source, "No pending source in this snapshot");
  const card = page.locator(".source-card").filter({
    has: page.getByRole("heading", { name: source!.name, exact: true }),
  });
  await card.getByRole("button", { name: /查看待审核/ }).click();
  await expect(page.getByLabel("公告来源")).toHaveValue(source!.id);
  const count = announcements.filter(
    (a) => a.source_id === source!.id && a.activity?.state !== "ready",
  ).length;
  await expect(page.locator(".review-card")).toHaveCount(Math.min(15, count));
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  if (announcements.filter((a) => a.activity?.state !== "ready").length > 15) {
    await page.getByRole("button", { name: "加载更多待办" }).click();
    await expect(page.locator(".review-card")).toHaveCount(30);
  }
});
