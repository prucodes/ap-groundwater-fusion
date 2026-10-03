import { expect, test } from "@playwright/test";
import outlook from "../data/enso_outlook.json";
import changes from "../data/weekly_changes.json";

/* NOAA's outlook must arrive dated, quoted and kept apart from the state's own
   record; the weekly page must show every headline with its dates. */

test("the monsoon page carries NOAA's outlook beside the state's El Niño record", async ({ page }) => {
  await page.goto("/monsoon/");
  const panel = page.getByRole("region", { name: /El Niño outlook/ });
  await expect(panel.getByTestId("enso-alert")).toHaveText(outlook.alert);
  await expect(panel).toContainText(outlook.synopsis);
  await expect(panel).toContainText(`+${outlook.peak.medianC.toFixed(2)} °C`);
  await expect(panel).toContainText("not a rainfall forecast for Andhra Pradesh");
  await expect(panel).toContainText("Northeast monsoon in El Niño years");
  await expect(panel.getByRole("list", { name: "Northeast-monsoon districts in El Niño years" }).getByRole("listitem")).not.toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Monsoon sections" }).getByRole("link", { name: "El Niño outlook" })).toBeVisible();
});

test("this week lists every headline with its dates and is reachable from the sidebar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /This Week/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("This Week");
  await expect(page.getByTestId("weekly-changes").getByRole("link")).toHaveCount(changes.items.length);
  await expect(page.getByRole("region", { name: "Drought manual readings that moved" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Groundwater status that moved" })).toBeVisible();
});
