import { expect, test } from "@playwright/test";
import outlook from "../data/enso_outlook.json";
import changes from "../data/weekly_changes.json";
import drought from "../data/drought_watch.json";

/* NOAA's outlook must arrive dated, quoted and kept apart from the state's own
   record; the weekly page must show every headline with its dates. */

test("the monsoon page carries NOAA's outlook beside the state's El Niño record", async ({ page }) => {
  await page.goto("/monsoon/");
  const panel = page.getByRole("region", { name: /El Niño outlook/ });
  await expect(panel.getByTestId("enso-alert")).toHaveText(outlook.alert);
  await expect(panel).toContainText(outlook.synopsis);
  await expect(panel).toContainText(`+${outlook.peak.medianC.toFixed(2)} °C`);
  await expect(panel).toContainText("not a rainfall forecast for Andhra Pradesh");
  await expect(panel).toContainText("Northeast monsoon in warm-index years");
  await expect(panel.getByRole("list", { name: "Northeast-monsoon districts in El Niño years" }).getByRole("listitem")).not.toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Monsoon sections" }).getByRole("link", { name: "El Niño outlook" })).toBeVisible();
});

test("this week lists every headline with its dates and is reachable from the sidebar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /This Week/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("This Week");
  await page.locator("#weekly-register > summary").click();
  await expect(page.getByTestId("weekly-changes").locator("a[data-direction]")).toHaveCount(changes.items.length);
  for (const item of changes.items) {
    await expect(page.locator(`a[data-key="${item.key}"]`)).toBeVisible();
  }
  await expect(page.getByTestId("week-moves")).toBeVisible();
  await expect(page.getByRole("region", { name: "Groundwater status that moved" })).toBeVisible();
});

test("this week's map shows where the drought reading moved, and switches to last week and this", async ({ page }) => {
  const { worse, better } = changes.drought;
  await page.goto("/");
  if (worse.length + better.length) {
    await expect(page.locator(".headlineCard", { hasText: "Drought manual" })).toContainText(`${worse.length} worse and ${better.length} better than last week`);
  }
  await page.goto("/changes/");
  const map = page.getByTestId("week-move-map");
  await expect(map).toHaveAttribute("data-ready", "true");
  await expect(map.locator("path[data-key]")).toHaveCount(drought.mandals.length);
  if (!worse.length && !better.length) {
    await expect(page.getByTestId("week-view-moved")).toHaveCount(0);
    return;
  }
  await expect(page.getByTestId("week-moves").getByRole("heading", { level: 2 })).toContainText(`${worse.length} mandals read worse`);
  // What moved: worse and better coloured, every mover ringed.
  await expect(map.locator('path[data-key="w"]')).toHaveCount(worse.length);
  await expect(map.locator('path[data-key="b"]')).toHaveCount(better.length);
  await expect(map.locator("path[data-mark]")).toHaveCount(worse.length + better.length);
  // Last week and this week: each mandal takes the reading of that week.
  const severe = (key: "prev" | "category") => drought.mandals.filter(row => row[key] === "severe").length;
  await page.getByTestId("week-view-before").click();
  await expect(page.getByTestId("week-view-before")).toHaveAttribute("aria-pressed", "true");
  await expect(map.locator('path[data-key="s"]')).toHaveCount(severe("prev"));
  await page.getByTestId("week-view-after").click();
  await expect(map.locator('path[data-key="s"]')).toHaveCount(severe("category"));
  await expect(map.locator("path[data-mark]")).toHaveCount(worse.length + better.length);
});

test("each released forecast says how such forecasts have fared", async ({ page }) => {
  await page.goto("/");
  const trust = page.getByTestId("forecast-trust").first();
  await expect(trust).toContainText(/Lower confidence|Backed by its record|Untested conditions/);
  // A forecast made where the backtest is thin says so instead of quoting an error it does not have.
  if (/Untested conditions/.test((await trust.textContent()) ?? "")) {
    await expect(trust).toContainText("too few forecasts");
  } else {
    await expect(trust).toContainText("Forecasts made in");
    await expect(trust).toContainText("average error over");
  }
});
