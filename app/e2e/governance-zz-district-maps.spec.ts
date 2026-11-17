import { expect, test } from "@playwright/test";

/* The pages that only need the State at a glance draw it themselves (DistrictChoropleth,
   MandalLocator) rather than loading a zoomable tile map: nothing to pan away from, no
   third-party basemap, and the same look and wash-in as every other State map. */

const MAPS = [
  ["/nasa/", "nasa-district-map"], ["/climate/", "climate-district-map"], ["/scenario/", "scenario-district-map"],
  ["/irrigation/", "aware-district-map"],
] as const;

for (const [route, id] of MAPS) {
  test(`${route}: the district map is drawn in-site, and its readout wears the district's colour`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator(".leaflet-container")).toHaveCount(0);
    const map = page.getByTestId(id);
    await map.scrollIntoViewIfNeeded();
    const districts = map.locator("path[data-district]");
    await expect(districts).toHaveCount(28);
    const target = districts.nth(12);
    await target.hover({ force: true });
    const tip = map.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/mandals/);
    // The readout's top edge is the district's own fill, as on every other map.
    await expect.poll(async () => {
      const fill = await target.evaluate(el => getComputedStyle(el).fill);
      const edge = await tip.evaluate(el => getComputedStyle(el).borderTopColor);
      return fill === edge;
    }).toBe(true);
    // Keyboard: every district can be reached and read.
    await districts.first().focus();
    await expect(tip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCount(0);
  });
}

test("Districts: the status map is drawn in-site too", async ({ page }) => {
  await page.goto("/districts/");
  await page.getByRole("button", { name: "Map" }).first().click();
  await expect(page.getByTestId("districts-status-map").locator("path[data-district]")).toHaveCount(28);
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
});

test("Scenario: a preset recolours the districts", async ({ page }) => {
  await page.goto("/scenario/");
  const map = page.getByTestId("scenario-district-map");
  await map.scrollIntoViewIfNeeded();
  const colours = () => map.locator("path[data-district]").evaluateAll(paths => paths.map(p => p.getAttribute("fill")).join(","));
  const before = await colours();
  await page.getByRole("button", { name: /Reference year/ }).first().click();
  await expect.poll(colours).not.toBe(before);
});

test("Compare: each mandal is shown in its district, with the district in the State", async ({ page }) => {
  await page.goto("/compare/");
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  const locators = page.getByRole("figure", { name: /within .* district, and the district within Andhra Pradesh/ });
  await expect(locators).toHaveCount(2);
  for (const figure of await locators.all()) {
    expect(await figure.locator("svg").first().locator("path").count()).toBeGreaterThan(3);
    await expect(figure.locator("svg").nth(1)).toBeVisible();
  }
});
