import { expect, test } from "@playwright/test";
import akvan from "../data/cyclone_akvan.json";
import liveClouds from "../data/live_clouds.json";

test("the third cyclone leads the cyclone page and says what is forecast and what is counted", async ({ page }) => {
  await page.goto("/cyclones/");
  const card = page.getByTestId("cyclone-akvan");
  await expect(card).toContainText("The third cyclone");
  if (!akvan.nameConfirmed) await expect(card).toContainText("name to be confirmed by IMD");
  if (!akvan.landfallConfirmed) await expect(card).toContainText("expected ashore");
  // Once ashore, the lede names where it was forecast and where it went, not the forecast alone.
  if (akvan.landfallConfirmed && akvan.state) {
    await expect(card.getByTestId("akvan-ashore")).toContainText("came ashore");
    await expect(card.getByTestId("akvan-ashore")).toContainText(akvan.near);
    await expect(card).not.toContainText("forecast to land");
  }
  await expect(card).toContainText(`of ${akvan.missedBefore.mandals}`);
  await expect(card).toContainText(`of ${akvan.sensors.compared.toLocaleString("en-IN")}`);
  await expect(page.getByTestId("akvan-map")).toBeVisible();
});

test("the third cyclone is shown live from Himawari beside the State at night", async ({ page, request }) => {
  await page.goto("/cyclones/");
  const live = page.getByTestId("akvan-live");
  await expect(live).toContainText((liveClouds as { label?: string }).label ?? "Himawari-9 infrared · last 48 hours");
  await expect(live.locator("figcaption b")).toContainText("IST");
  const src = await live.locator("video").getAttribute("src");
  expect((await request.head(src!)).ok()).toBe(true);
});

test("every sensor is a point of light on the night map, lit where its water table has risen", async ({ page }) => {
  await page.goto("/cyclones/");
  const map = page.locator('[data-testid="akvan-map"][data-ready="true"]');
  await expect(map).toBeVisible();
  await expect(map.locator("svg circle")).toHaveCount(akvan.sensors.stations.length);
  await expect(map.locator("svg [data-lit] circle")).toHaveCount(akvan.sensors.stations.filter(s => (s[4] as number) > 0.1).length);
  const response = page.getByTestId("akvan-response");
  if (akvan.timeline.length > 1 || akvan.sensors.risen) await expect(response).toContainText("The water table’s answer");
  else await expect(response).toHaveCount(0);
});
