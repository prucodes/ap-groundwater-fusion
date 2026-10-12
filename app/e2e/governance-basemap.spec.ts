import { expect, test } from "@playwright/test";

// The vector basemap: the ground beneath the data and the names above it, two MapLibre
// layers in the platform's palette. Test runners render WebGL in software, where the map
// skips its basemap to keep pages responsive, so `?basemap` forces it on here.
test("the vector basemap draws the ground beneath the data and the names above it", async ({ page }) => {
  test.setTimeout(process.env.CI ? 180000 : 60000);
  const tiles: string[] = [];
  page.on("request", request => { if (request.url().includes("tiles.openfreemap.org")) tiles.push(request.url()); });
  await page.goto("/nasa/?basemap");
  const map = page.locator(".leaflet-container").first();
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator(".leaflet-gl-layer")).toHaveCount(2, { timeout: 60000 });
  await expect(map.locator(".leaflet-basemapLabels-pane .leaflet-gl-layer")).toHaveCount(1);
  await expect(map.locator(".leaflet-overlay-pane path").first()).toBeVisible();
  await expect.poll(() => tiles.length, { timeout: 60000 }).toBeGreaterThan(0);
  await expect(map.locator(".leaflet-control-attribution")).toContainText("OpenFreeMap");
});

test("in software WebGL the map keeps its data and skips the basemap", async ({ page }) => {
  await page.goto("/nasa/");
  const map = page.locator(".leaflet-container").first();
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator(".leaflet-overlay-pane path").first()).toBeVisible();
  const software = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return /swiftshader|llvmpipe|software|basic render/i.test(gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "");
  });
  test.skip(!software, "this browser has a GPU, so the basemap draws");
  await page.waitForTimeout(1500);
  await expect(map.locator(".leaflet-gl-layer")).toHaveCount(0);
});
