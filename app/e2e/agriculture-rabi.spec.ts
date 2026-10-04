import { expect, test } from "@playwright/test";
import contextJson from "../data/water_context.json";
import fieldJson from "../data/field_signals.json";

/* The Rabi Outlook: the starting position from published files, the rainfed
   seedbed read only where WorldCereal maps the cropland as mostly rainfed, and
   a field report that travels as text and comes back as a row. */

const reservoirs = (contextJson as unknown as { reservoirs: { state: { storagePct: number }; byBasin: unknown[] } }).reservoirs;
const irrigation = (fieldJson as unknown as { irrigation: { summary: { mostlyIrrigated: number; mostlyRainfed: number } } }).irrigation;

test("the rabi page states its starting position and draws the seedbed over rainfed mandals only", async ({ page }) => {
  await page.goto("/rabi/");
  await expect(page.getByTestId("rabi-summary")).toContainText(`${Math.round(reservoirs.state.storagePct)}% of capacity`);
  await expect(page.getByTestId("rabi-basin")).toHaveCount(reservoirs.byBasin.length);
  const map = page.getByTestId("rabi-map");
  await expect(map).toHaveAttribute("data-ready", "true");
  await expect(map.locator("path[data-key]")).toHaveCount(670);
  // Every mostly irrigated mandal is set aside, never coloured as dry or wet.
  await expect(map.locator('path[data-key="i"]')).toHaveCount(irrigation.summary.mostlyIrrigated);
  await expect(page.getByTestId("rabi-soil")).toContainText(`The ${irrigation.summary.mostlyIrrigated} mandals where most cropland is irrigated are set aside`);
  await expect(page.getByTestId("rabi-sowing")).toContainText("Bengal gram");
  await expect(page.getByTestId("rabi-monsoon")).toContainText("Past El Niño years");
});

test("the rabi page fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/rabi/");
  await expect(page.getByTestId("rabi-map")).toHaveAttribute("data-ready", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("a field report written for a listed mandal reads back in the collector, beside the site's call", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/changes/");
  const link = page.getByTestId("field-teams").getByRole("link", { name: /Write a field report for/ }).first();
  const name = (await link.getAttribute("aria-label"))!.replace("Write a field report for ", "");
  await link.click();
  await expect(page.getByTestId("field-report-site").locator("h3")).toContainText(name);
  const crop = page.getByTestId("field-report-crop").first();
  await crop.getByRole("radio", { name: "Severe wilting" }).click();
  await page.getByRole("radio", { name: "Some dry" }).click();
  await page.getByRole("button", { name: "Copy text" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(`AP field report · ${name}`);
  expect(text).toMatch(/#APWR1:[A-Za-z0-9_-]+$/);

  await page.getByRole("tab", { name: "Collected reports" }).click();
  // Pasted twice, as a chat export repeats a forwarded message: read once.
  await page.getByLabel("Shared reports").fill(`[04/10/26] Team A: ${text}\n[04/10/26] Team B: ${text}`);
  await expect(page.getByTestId("field-report-summary")).toContainText("1 report from 1 mandal");
  const row = page.getByTestId("field-report-collect").locator("tbody tr");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(name);
  await expect(row).toContainText("severe wilting");
});
