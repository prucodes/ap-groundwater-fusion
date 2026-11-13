import { expect, test } from "@playwright/test";
import sensors from "../data/gw_sensors.json";

test("This Week opens on today's sensors, each against itself a year ago", async ({ page }) => {
  await page.goto("/changes/");
  const pulse = page.getByTestId("sensor-pulse");
  await expect(pulse).toContainText(`of ${sensors.state.compared.toLocaleString("en-IN")}`);
  await expect(pulse).toContainText("Fallen furthest since a year ago");
  await expect(pulse).toContainText("not official data");
  expect(await pulse.locator("circle").count()).toBeGreaterThan(800);
});
