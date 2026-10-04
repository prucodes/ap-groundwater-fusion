import { expect, test, type Page } from "@playwright/test";
import fieldJson from "../data/field_signals.json";
import recordJson from "../data/crop_water_record.json";
import type { CheckRecord } from "../lib/cropWater";

/* This week in the fields. The crop water check runs in the browser; the
   pipeline runs its own copy of the same FAO-56 water balance for every crop
   and stage, and the page must reproduce those counts exactly. */

type Counts = { stressed: number; severe: number; soon: number; ok: number; unknown: number };
const check = (fieldJson as unknown as { crossCheck: { counts: Record<string, Counts> } }).crossCheck.counts;
const assessment = (fieldJson as unknown as { assessment: { year: string; state: { stagePct: number } } }).assessment;
const record = recordJson as unknown as CheckRecord;

async function pick(page: Page, crop: string, stage: string) {
  const section = page.getByTestId("field-week");
  await section.getByRole("group", { name: "Crop", exact: true }).getByRole("button", { name: crop, exact: true }).click();
  await section.getByRole("group", { name: "Growth stage", exact: true }).getByRole("button", { name: new RegExp(`^${stage}`) }).click();
}

test("the crop water check reproduces the pipeline's counts for every crop and stage it is asked", async ({ page }) => {
  await page.goto("/agriculture/");
  const section = page.getByTestId("field-week");
  await section.scrollIntoViewIfNeeded();
  const map = page.getByTestId("field-week-map");
  await expect(map.locator("path").first()).toBeVisible();
  for (const [crop, stage, key] of [["Maize", "Mid-season", "maize-1"], ["Chilli", "Initial", "chilli-0"], ["Red gram", "End-season", "redgram-2"], ["Groundnut", "Mid-season", "groundnut-1"]] as const) {
    await pick(page, crop, stage);
    await expect(map).toHaveAttribute("data-agrees", "true");
    for (const state of ["stressed", "soon", "ok", "unknown"] as const) {
      await expect(page.getByTestId(`field-week-${state}`).locator("strong")).toHaveText(String(check[key][state]));
    }
    await expect(map.locator('path[data-state="stressed"]')).toHaveCount(check[key].stressed);
    await expect(map.locator('path[data-state="unknown"]')).toHaveCount(check[key].unknown);
  }
  // The answer is a sentence, and it names the crop and stage.
  await expect(page.getByTestId("field-week-lede")).toContainText("groundnut at the mid-season stage");
});

test("one mandal's week: the chart, a plain reading, and the lab started from its numbers", async ({ page }) => {
  await page.goto("/agriculture/");
  await page.getByTestId("field-week").scrollIntoViewIfNeeded();
  await pick(page, "Cotton", "Mid-season");
  const detail = page.getByTestId("field-week-detail");
  await expect(detail.getByTestId("root-zone-chart")).toBeVisible();
  await expect(detail.getByTestId("root-zone-chart")).toHaveAttribute("aria-label", /root zone/);
  await expect(detail.getByTestId("field-week-reading")).toContainText("Cotton at the mid-season stage");
  await expect(detail).toContainText("of the unstressed rate (FAO-56 Ks)");

  // Choosing a mandal on the map selects it.
  const mandal = page.getByTestId("field-week-map").locator('path[data-state="ok"]').first();
  const name = (await mandal.getAttribute("aria-label"))!.split(":")[0];
  await mandal.click();
  await expect(detail.locator("h3")).toHaveText(name);

  // Highlighting a state fades the rest of the map.
  await page.getByTestId("field-week-stressed").click();
  await expect(page.getByTestId("field-week-stressed")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("field-week-map").locator('path[data-state="ok"]').first()).toHaveAttribute("opacity", "0.14");
  await page.getByTestId("field-week-stressed").click();

  await page.getByTestId("open-in-lab").click();
  const lab = page.locator("#crop-water-lab");
  await expect(lab.getByTestId("lab-live-preset")).toContainText(`Started from this week’s values for ${name}`);
  await expect(lab.getByRole("combobox", { name: "Reference crop" })).toHaveValue("cotton");
  await expect(lab.getByTestId("crop-field")).toHaveAttribute("data-stage", "1");
  await lab.getByRole("button", { name: "Back to the scenario" }).click();
  await expect(lab.getByTestId("lab-live-preset")).toHaveCount(0);
  await expect(lab.getByRole("combobox", { name: "Reference crop" })).toHaveValue("maize");
});

test("the water watch colours by vegetation or the official category, with its own legend", async ({ page }) => {
  await page.goto("/agriculture/");
  await expect(page.getByTestId("context-vegetation")).toContainText("severely below normal");
  await expect(page.getByTestId("context-assessment")).toContainText(`${assessment.state.stagePct.toFixed(1)}%`);
  await expect(page.getByTestId("context-assessment")).toContainText(`Groundwater assessment ${assessment.year}`);
  await page.getByRole("button", { name: "AP map" }).click();
  const colour = page.getByRole("group", { name: "Colour mandals by" });
  await colour.getByRole("button", { name: "Crop vegetation" }).click();
  await expect(page.getByTestId("watch-legend")).toContainText("Severely below normal (0–40)");
  await colour.getByRole("button", { name: "Groundwater category" }).click();
  await expect(page.getByTestId("watch-legend")).toContainText("Over-exploited");
  await expect(page.getByTestId("agriculture-map").locator('path[aria-label*="Groundwater category"]').first()).toBeVisible();
});

test("the check carries its track record for the crop and stage chosen, with every season shown", async ({ page }) => {
  await page.goto("/agriculture/");
  await page.getByTestId("field-week").scrollIntoViewIfNeeded();
  for (const [crop, stage, key] of [["Maize", "Mid-season", "maize-1"], ["Chilli", "Initial", "chilli-0"]] as const) {
    await pick(page, crop, stage);
    const panel = page.getByTestId("field-week-record");
    // The verdict is the rainfed reading: the same mandal in the same season, never the pooled seasons.
    const entry = record.record[key].rainfed;
    await expect(panel).toHaveAttribute("data-verdict", entry.verdict);
    await expect(panel).toContainText("rainfed fields");
    const same = entry.within.sameSeason;
    if (entry.verdict !== "untested") {
      await expect(panel.locator("p").first()).toContainText(`(${same.mandals} mandal-seasons)`);
      await expect(panel.locator("p").first()).toContainText(`${Math.abs(same.afterGap!).toFixed(1)} index point`);
    }
    const shown = Object.values(entry.within.seasons).filter(season => season.mandals > 0 && season.afterGap !== null).length;
    await expect(panel.locator('figure > div[data-kind="season"]')).toHaveCount(shown);
    await expect(panel.locator('figure > div[data-kind="total"]')).toContainText(`${same.mandals} mandal-seasons`);
    // The field-scale reading (Sentinel-2) carries its own verdict beside the 4 km one.
    const field = record.record[key].sentinel;
    if (field && record.sentinel) await expect(panel.getByTestId("field-week-sentinel")).toHaveAttribute("data-verdict", field.verdict);
    // All cropland, irrigated fields included, is drawn beneath for reference.
    const reference = record.record[key].allCropland.within.sameSeason.afterGap!;
    await expect(panel.locator('figure > div[data-kind="reference"]')).toContainText(Math.abs(reference).toFixed(1));
  }
});

test("the field week fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/agriculture/");
  await page.getByTestId("field-week").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("field-week-map").locator("path").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("the map page draws both new layers, and the title follows the view", async ({ page }) => {
  await page.goto("/map/");
  await page.getByRole("button", { name: "Crop vegetation" }).click();
  await expect(page.locator(".mapCard .cardTitle")).toContainText("Crop vegetation (VCI)");
  await expect(page.getByTestId("field-layer-legend")).toContainText("Severely below normal");
  await page.getByRole("button", { name: "Groundwater category" }).click();
  await expect(page.locator(".mapCard .cardTitle")).toContainText(`Groundwater category ${assessment.year}`);
  await expect(page.getByTestId("field-layer-legend")).toContainText("Not matched to an assessment unit");
});

test("a mandal page carries its crop vegetation and its official category", async ({ page }) => {
  await page.goto("/agriculture/");
  const detail = page.getByTestId("field-week-detail");
  const link = detail.getByRole("link", { name: "Mandal record" });
  // Not every boundary has a groundwater record to link to; take the first that does.
  const options = await detail.getByRole("combobox").locator("option").evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value));
  for (const value of options) {
    if (await link.count()) break;
    await detail.getByRole("combobox").selectOption(value);
  }
  const href = await link.getAttribute("href");
  await page.goto(href!);
  await expect(page.getByTestId("mandal-vegetation")).toContainText("Satellite index: NOAA STAR VHP");
  await expect(page.getByTestId("mandal-assessment")).toContainText(`Groundwater assessment ${assessment.year}`);
  await expect(page.getByTestId("mandal-assessment")).toContainText("GEC-2015");
});
