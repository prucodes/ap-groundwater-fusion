import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import summary from "../data/water_context_summary.json";

/* The APWRIMS water context -- gauge rain, modelled soil moisture, reservoir
   storage -- must reach every page that talks about water, each figure dated
   and sourced, and never as a groundwater status. */

test("the overview carries this water year beside the groundwater", async ({ page }) => {
  await page.goto("/");
  const season = page.getByRole("region", { name: "This water year so far" });
  await expect(season).toContainText("Gauge rain vs normal");
  await expect(season).toContainText("mandals below their usual");
  await expect(season).toContainText(`${summary.reservoirs!.storagePct}%`);
  await expect(season).toContainText("none of it changes a groundwater status");
  const agreeing = Number(await season.getByText("Three signals agree").locator("..").locator("strong").innerText());
  await page.goto("/agriculture/");
  const tile = page.getByTestId("agreement-tile").locator("strong");
  expect(Number((await tile.innerText()).split("/")[0].trim())).toBe(agreeing);
});

test("the sidebar names each feed and its own date", async ({ page }) => {
  await page.goto("/");
  const status = page.locator(".sidebarStatus");
  for (const feed of ["CHIRPS rainfall ·", "Rain gauges · to", "Soil moisture ·", "Reservoirs ·", "State wells ·"]) await expect(status).toContainText(feed);
});

test("both maps can show gauge rain and soil moisture", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Gauge rain", exact: true }).click();
  await expect(page.locator(".choroLegend")).toContainText("Gauge rain vs normal");
  await page.getByRole("button", { name: "Soil", exact: true }).click();
  await expect(page.locator(".choroLegend")).toContainText("Soil moisture, 30 cm");

  await page.goto("/map/");
  await page.getByRole("button", { name: "Gauge rain vs normal", exact: true }).click();
  const legend = page.locator(".choroLegend");
  await expect(legend).toContainText("Measured: AP DES mandal rain gauges");
  await expect(legend).toContainText("it does not change any groundwater status");
  const orvakal = page.getByRole("button", { name: /^Orvakal, Kurnool:/ });
  await orvakal.focus();
  await expect(page.locator(".estHoverCard")).toContainText(/Gauge rain vs normal[\s\S]*(vs normal|No unique record)/);
  await page.getByRole("button", { name: "Soil moisture", exact: true }).click();
  await orvakal.focus();
  await expect(page.locator(".estHoverCard")).toContainText(/Soil moisture, 30 cm/);
  await expect(legend).toContainText("Modelled: NRSC VIC");
});

test("a mandal page shows its season beside its groundwater record", async ({ page }) => {
  await page.goto("/mandals/ap-temp-mandal-kurnool-orvakal-506/");
  const card = page.getByRole("region", { name: /This season/ });
  await expect(card).toContainText("against normal");
  await expect(card.getByRole("list", { name: "Soil moisture by depth" }).getByRole("listitem")).toHaveCount(4);
  await expect(card).toContainText(/of 1\d years for this date/);
  await expect(card).toContainText("3 of 3 usable");
  await expect(card).toContainText("Reservoirs in Kurnool");
  await expect(card).toContainText("not a score");
});

test("climate ranks districts by their measured rain", async ({ page }) => {
  await page.goto("/climate/");
  const section = page.getByRole("region", { name: /This water year by district/ });
  const rows = section.locator("tbody tr");
  await expect(rows).toHaveCount(28);
  const departure = async (index: number) => Number((await rows.nth(index).locator("td").nth(3).innerText()).replace("−", "-").match(/-?\+?\d+/)![0]);
  expect(await departure(0)).toBeLessThanOrEqual(await departure(27));
  await expect(section).toContainText("a release is not water delivered to a mandal");
});

test("methodology and readiness document the new sources and their limits", async ({ page }) => {
  await page.goto("/methodology/");
  for (const text of ["AP DES rain gauges (measured, via APWRIMS)", "NRSC VIC soil moisture (model, via APWRIMS)", "Reservoir storage and releases (measured, via APWRIMS)", "when the sources agree", "CHIRPS v3"]) {
    await expect(page.locator("main")).toContainText(text);
  }
  await page.goto("/readiness/");
  await expect(page.getByRole("heading", { name: "Nine sources. Different clocks." })).toBeVisible();
  await expect(page.locator("main")).toContainText("APWRIMS already holds crop-sown and crop-stress dashboards behind a login");
});

test("snapshot, season CSV and AWARE preview carry the season as context", async ({ page }) => {
  await page.goto("/snapshot/");
  await expect(page.locator("main")).toContainText("Rain gauges,");
  await expect(page.locator("main")).toContainText("Reservoirs hold");
  await page.goto("/reports/");
  let download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Season context by district/ }).click();
  const csv = readFileSync((await (await download).path())!, "utf8");
  expect(csv).toContain("gauge_rain_departure_pct");
  expect(csv).toContain("measured at the dam");
  download = page.waitForEvent("download");
  await page.getByRole("button", { name: /AWARE draft payload/ }).click();
  const payload = JSON.parse(readFileSync((await (await download).path())!, "utf8"));
  expect(payload.length).toBeGreaterThan(20);
  expect(payload.every((row: Record<string, unknown>) => "gauge_rain_departure_pct" in row && row.operational_use === false)).toBe(true);
});
