import { test, expect } from "@playwright/test";

const hepUrl =
  "/events/lovelive-hep-navio-2026?venue=niji-hep-reserved";

// These regressions must pass on the first attempt, including in CI.
test.describe.configure({ retries: 0 });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-28T12:00:00+09:00") });
});

test("booking controls wait for their own hydration before accepting input", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await scriptsReady;
    await route.continue();
  });

  const visit = page.getByLabel("计划到店日期");
  const venue = page.getByLabel("参加门店");
  try {
    // Do not wait for load: the JS requests are deliberately held, not timed.
    await page.goto(hepUrl, { waitUntil: "commit" });
    await expect(visit).toBeVisible();
    await expect(visit).toBeDisabled();
    await expect(venue).toBeDisabled();
  } finally {
    releaseScripts();
  }

  // Fill as soon as possible; the actual disabled control gates the action.
  await visit.fill("2026-11-05");
  await expect(venue).toBeEnabled();
  await expect(visit).toHaveValue("2026-11-05");
  await expect(page.locator(".booking-panel")).toContainText(
    "2026年11月4日 23:59",
  );
  expect(errors).toEqual([]);
});

test("HEP accepts the first date after repeated initial navigations", async ({
  page,
}) => {
  test.setTimeout(60000);
  const visit = page.getByLabel("计划到店日期");
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.goto(hepUrl);
    await visit.fill("2026-11-05");
    await expect(visit).toHaveValue("2026-11-05");
    await expect(page.locator(".booking-panel")).toContainText(
      "2026年11月4日 23:59",
    );
  }
});

test("HEP date edits stay in sync through rerenders and venue changes", async ({
  page,
}) => {
  await page.goto(hepUrl);
  const panel = page.locator(".booking-panel");
  const visit = page.getByLabel("计划到店日期");
  const venue = page.getByLabel("参加门店");
  const cutoff = panel.locator(".booking-rule dd").last();

  await visit.fill("2026-11-05");
  await expect(cutoff).toHaveText("2026年11月4日 23:59 JST");
  await visit.fill("2026-11-08");
  await expect(cutoff).toHaveText("2026年11月7日 23:59 JST");

  // Personal data changes rerender the panel; DOM-only input must not be lost.
  await panel.getByRole("button", { name: "加入旅行备选", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "已加入旅行备选", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(visit).toHaveValue("2026-11-08");
  await expect(cutoff).toHaveText("2026年11月7日 23:59 JST");

  await visit.fill("");
  await expect(cutoff).toHaveText("尚未核实 JST");
  await visit.fill("2026-11-09");
  await expect(panel.getByRole("alert")).toContainText("此日期不在");
  await expect(cutoff).toHaveText("尚未核实 JST");
  await visit.fill("2026-11-06");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(cutoff).toHaveText("2026年11月5日 23:59 JST");

  await venue.selectOption("niji-hep-later");
  await expect(visit).toHaveValue("");
  await expect(panel).not.toContainText("2026年10月27日 20:00");
  await expect(panel).not.toContainText("2026年11月5日 23:59");
  await venue.selectOption("niji-hep-reserved");
  await expect(visit).toHaveValue("");
  await expect(cutoff).toHaveText("尚未核实 JST");
  await visit.fill("2026-11-05");
  await expect(cutoff).toHaveText("2026年11月4日 23:59 JST");

  await page.reload();
  // Only the saved venue persists; visit is intentionally panel-local state.
  await expect(
    panel.getByRole("button", { name: "已加入旅行备选", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(visit).toHaveValue("");
  await visit.fill("2026-11-08");
  await expect(cutoff).toHaveText("2026年11月7日 23:59 JST");
});
