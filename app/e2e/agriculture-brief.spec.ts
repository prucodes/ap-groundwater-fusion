import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import watch from "../data/monsoon_watch.json";
import geometry from "../data/ap_map_geometry.json";
import records from "../data/mandal_groundwater_records_v2.json";
import { buildAgricultureEvidence } from "../lib/agriculture";
import type { MonsoonWatch } from "../lib/data";
import type { MandalGroundwaterRecordV2 } from "../lib/types";

const evidence = buildAgricultureEvidence(watch as MonsoonWatch, records.records as MandalGroundwaterRecordV2[], geometry.mandals.map(row => ({ ...row, path: "M0 0Z" })));

for (const width of [1440, 390]) {
  test(`district brief reconciles counts, exports and drills down at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/agriculture/");
    const brief = page.getByRole("region", { name: "Where should the next field review begin?" });
    await brief.scrollIntoViewIfNeeded();
    const district = evidence.districts[0];
    const dossier = brief.getByLabel("District review evidence");
    await expect(dossier).toContainText(`${district.flagged} of ${district.compared} units`);
    await expect(dossier).toContainText(`${district.total - district.compared} unresolved of ${district.total}`);
    const download = page.waitForEvent("download");
    await brief.getByRole("button", { name: "Download draft district brief" }).click();
    const file = await download;
    const content = await readFile((await file.path())!, "utf8");
    expect(content).toContain("Not live telemetry");
    expect(content).toContain("Owner: not assigned");
    expect(content).toContain("Seasonal baseline review pending");
    expect(content).toContain(`Provisional seasonal flags: ${district.flagged}/${district.compared}`);
    await brief.screenshot({ path: testInfo.outputPath(`district-brief-${width}.png`) });
    await brief.getByRole("button", { name: "Coverage gaps", exact: true }).click();
    const blindspot = [...evidence.districts].sort((a, b) => (b.total - b.compared) - (a.total - a.compared) || a.name.localeCompare(b.name))[0];
    await expect(brief.getByRole("combobox", { name: "Brief district" })).toHaveValue(blindspot.name);
    await expect(dossier).toContainText(`${blindspot.total - blindspot.compared} unresolved of ${blindspot.total}`);
    await brief.getByRole("button", { name: `Review ${blindspot.total - blindspot.compared} records`, exact: true }).click();
    await expect(page.getByRole("combobox", { name: "District filter" })).toHaveValue(blindspot.name);
    await expect(page.getByRole("combobox", { name: "Water signal filter" })).toHaveValue("unavailable");
    await expect(page.getByRole("heading", { name: "Where does the water story need a closer look?" })).toBeFocused();
    const clean = evidence.districts.find(row => !row.flagged)!;
    await brief.getByRole("button", { name: "Shortfall flags", exact: true }).click();
    await brief.getByRole("combobox", { name: "Brief district" }).selectOption(clean.name);
    await expect(dossier).toContainText("No records in this category.");
    await expect(dossier.getByRole("button", { name: "Review 0 records" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}
