import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { alertFor, MAX_ALERT_SCORE, severityCounts } from "../lib/alerts";
import { mandals, observationSeries } from "../lib/data";

test("historical medians average the central pair for even observation counts", () => {
  for (const mandal of mandals) {
    const values = (observationSeries[mandal.id]?.observations ?? []).map(r => r.value).sort((a,b) => a-b);
    if(!values.length) { expect(mandal.median_groundwater_mbgl).toBeNull(); continue; }
    const centre = Math.floor(values.length / 2);
    const expected = values.length % 2 ? values[centre] : (values[centre-1] + values[centre]) / 2;
    expect(mandal.median_groundwater_mbgl).toBe(Math.round(expected * 100) / 100);
  }
});

test("missing depth is not normal, non-finite inputs fail closed, score ceiling is reachable", () => {
  const base = mandals.find(row => row.estimate_mbgl != null)!;
  const missing = alertFor({ ...base, estimate_mbgl: null, display_mbgl: null });
  expect(missing.state).toBe("insufficient_data");
  expect(severityCounts([missing])).toEqual({ Critical: 0, High: 0, Watch: 0, Normal: 0 });
  expect(alertFor({ ...base, estimate_mbgl: NaN }).state).toBe("insufficient_data");
  const maximum = alertFor({ ...base, estimate_mbgl: 20, trend_m_per_yr: 2, sensor_satellite_agreement: "declining_despite_positive_climate_balance" });
  expect(maximum.score).toBe(MAX_ALERT_SCORE);
  expect(alertFor({ ...base, confidence_label: "Limited" }).score).toBe(alertFor(base).score);
});

test("the retired review queue and snapshot forward to the pages that replace them", async ({ page }) => {
  await page.goto("/alerts");
  await expect(page).toHaveURL(/\/changes\/#field-teams$/);
  await expect(page.getByTestId("field-teams")).toBeVisible();
  await page.goto("/snapshot");
  await expect(page).toHaveURL(/\/digest\/$/);
});

test("district profile selects evidence and drills into that district's mandals", async ({ page }) => {
  await page.goto("/districts");
  const plot = page.getByLabel("District profile: modelled depth versus measured year-on-year change");
  const levels = page.getByText("District levels / available nowcasts", { exact: true });
  const plotBounds = await plot.boundingBox();
  const tableBounds = await levels.boundingBox();
  expect(tableBounds!.x).toBeGreaterThan(plotBounds!.x + plotBounds!.width);
  await expect(plot.locator('[role="button"]')).toHaveCount(28);
  const point = plot.locator('[role="button"]').nth(3);
  await point.focus(); await page.keyboard.press("Enter");
  await expect(point).toHaveAttribute("aria-pressed", "true");
  const href = await page.getByRole("link", { name: "Review mandals", exact: true }).getAttribute("href");
  const district = new URL(href!, "http://localhost").searchParams.get("district")!;
  expect(href).toMatch(/^\/agriculture\/\?district=.+#agriculture-watch$/);
  await page.getByRole("link", { name: "Review mandals", exact: true }).click();
  // The water watch opens on that district's mandals, in the fieldbook.
  await expect(page.getByLabel("District filter")).toHaveValue(new RegExp(`^${district}$`, "i"));
  await expect(page.getByRole("button", { name: "District fieldbook" })).toHaveAttribute("aria-pressed", "true");
});

test("readiness reports unknown dates and pending release gates, not live percentages", async ({ page }) => {
  await page.goto("/readiness");
  await expect(page.getByRole("heading", { name: "Nine sources. Different clocks." })).toBeVisible();
  await expect(page.getByText("Valid period not supplied", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending acceptance", { exact: true })).toHaveCount(6);
  expect(await page.locator("main").innerText()).not.toMatch(/sources live|% prototype-ready/);
});

test("Crystal is the single main 3D destination; model comparison stays under advanced evidence", async ({ page }) => {
  await page.goto("/estimates");
  await expect(page.getByRole("link", { name: "Water Depth 3D", exact: true })).toHaveCount(1);
  await expect(page.locator("aside").getByRole("link", { name: "Living Water Table", exact: true })).toHaveCount(0);
  await page.getByText("Advanced model evidence", { exact: true }).click();
  await page.getByRole("link", { name: "Open Model Evidence Lab", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Model Evidence Lab", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Recorded May depth atlas", exact: true })).toHaveAttribute("href", /\/crystal\/?$/);
});

test("report pack downloads its real manifest and retains research restrictions", async ({ page }) => {
  await page.goto("/readiness/#exports");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Evidence & model pack/ }).click();
  const result = await download;
  const pack = JSON.parse(readFileSync((await result.path())!, "utf8"));
  expect(pack.operationalUse).toBe(false);
  expect(pack.manifest.counts.boundaryFeatureCount).toBe(670);
  expect(pack.manifest.inputHashes.apwrimsHistory).toHaveLength(64);
  expect(pack.caveats.join(" ")).toContain("baseline review pending");
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 812 }]) {
  test(`main review pages fit ${viewport.width}px and hydrate`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(String(e)));
    for (const route of ["/", "/alerts", "/districts", "/readiness", "/settings", "/compare", "/irrigation", "/nasa", "/scenario"]) {
      await page.goto(route); await page.waitForTimeout(450);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), route).toBe(true);
      if(route === "/") await expect(page.locator(".liveBadge")).toContainText("SNAPSHOT");
    }
    expect(errors).toEqual([]);
  });
}
