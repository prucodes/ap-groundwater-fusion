import { expect, test, type Locator } from "@playwright/test";
import watch from "../data/monsoon_watch.json";
import changes from "../data/weekly_changes.json";
import drought from "../data/drought_watch_summary.json";
import crossNetwork from "../data/cross_network_check.json";

/* The calm pass: each page leads with the few figures that answer its question,
   and every other figure, row and method note stays on the page, one click away.
   Nothing is removed: folded rows are still in the document, open in place, and print. */

const shown = (rows: Locator) => rows.evaluateAll(list => list.filter(row => row.checkVisibility()).length);

test("Monsoon Watch leads with headline figures and keeps every season figure one click away", async ({ page }) => {
  await page.goto("/monsoon/");
  const season = page.getByRole("region", { name: "Season evidence", exact: true });
  expect(await season.locator(".headlineCard").count()).toBeGreaterThanOrEqual(3);
  const fold = season.locator("details.foldMore");
  await expect(fold).toHaveJSProperty("open", false);
  const flags = season.getByText("Provisional shortfall flags", { exact: true });
  await expect(flags).toBeHidden();
  await fold.locator("summary").click();
  await expect(flags).toBeVisible();
});

test("a long table shows its first rows, keeps every row, and opens the rest in place", async ({ page }) => {
  await page.goto("/monsoon/");
  const queue = page.locator("section.card", { hasText: "Provisional groundwater review queue" });
  const rows = queue.locator("tbody tr");
  const total = watch.mandals.filter(row => row.status !== "normal").slice(0, 25).length;
  await expect(rows).toHaveCount(total);
  expect(await shown(rows)).toBe(Math.min(8, total));
  if (total > 8) {
    await queue.getByText(`Show all ${total} rows`).click();
    expect(await shown(rows)).toBe(total);
    await queue.getByText("Show the first 8").click();
    expect(await shown(rows)).toBe(8);
  }
});

test("printing a page shows every folded row and note", async ({ page }) => {
  await page.goto("/drought/");
  const rows = page.getByTestId("drought-district-matrix").locator("tbody tr");
  await expect(rows).toHaveCount(drought.districts.length);
  expect(await shown(rows)).toBe(Math.min(10, drought.districts.length));
  const method = page.getByRole("region", { name: "How this page reads the manual" });
  const note = method.getByText("Not a declaration", { exact: false }).first();
  await expect(note).toBeHidden();
  await page.emulateMedia({ media: "print" });
  expect(await shown(rows)).toBe(drought.districts.length);
  await expect(note).toBeVisible();
});

test("This Week leads with what moved, worse first, and keeps the steady figures beneath", async ({ page }) => {
  await page.goto("/changes/");
  const directions = await page.getByTestId("weekly-changes").getByRole("link")
    .evaluateAll(cards => cards.map(card => (card as HTMLElement).dataset.direction ?? ""));
  expect(directions).toHaveLength(changes.items.length);
  const rank: Record<string, number> = { worse: 0, better: 1, moved: 2, new: 3, same: 4 };
  expect(directions.map(d => rank[d])).toEqual([...directions.map(d => rank[d])].sort((a, b) => a - b));
  await expect(page.getByRole("heading", { name: /Moved this week/ })).toBeVisible();
});

test("the research snapshot is one line until opened, with its caveat in view", async ({ page }) => {
  await page.goto("/monsoon/");
  const evidence = page.getByRole("region", { name: "Evidence status and release gates" });
  await expect(evidence.getByText("Baseline review pending.", { exact: true })).toBeVisible();
  await expect(evidence.getByText("Operational release pending")).toBeHidden();
  await evidence.locator("summary").click();
  await expect(evidence.getByText("Operational release pending")).toBeVisible();
});

test("Methodology shows the forecast checked on wells it never saw, method folded", async ({ page }) => {
  await page.goto("/methodology/");
  const section = page.getByTestId("method-cross-network");
  await expect(section.getByRole("heading", { name: /never saw/ }).or(section.getByText("Checked on wells it never saw"))).toBeVisible();
  const share = `${Math.round(crossNetwork.overall.direction.forecast! * 100)}%`;
  await expect(section.locator(".headlineCard").first()).toContainText(share);
  await expect(section.locator(".headlineCard")).toHaveCount(3);
  const fold = section.locator("details.foldMore");
  await expect(fold).toHaveJSProperty("open", false);
  await expect(section).toContainText(crossNetwork.frozenMonths[0]);
});
