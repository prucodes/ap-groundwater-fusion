import { expect, test } from "@playwright/test";
import akvan from "../data/cyclone_akvan.json";

test("the third cyclone leads the cyclone page and says what is forecast and what is counted", async ({ page }) => {
  await page.goto("/cyclones/");
  const card = page.getByTestId("cyclone-akvan");
  await expect(card).toContainText("The third cyclone");
  if (!akvan.nameConfirmed) await expect(card).toContainText("name to be confirmed by IMD");
  if (!akvan.landfallConfirmed) await expect(card).toContainText("expected ashore");
  await expect(card).toContainText(`of ${akvan.missedBefore.mandals}`);
  await expect(card).toContainText(`of ${akvan.sensors.compared.toLocaleString("en-IN")}`);
  await expect(page.getByTestId("akvan-map")).toBeVisible();
});

test("the third cyclone is shown live from Himawari beside the State at night", async ({ page, request }) => {
  await page.goto("/cyclones/");
  const live = page.getByTestId("akvan-live");
  await expect(live).toContainText("Himawari-9 infrared · last 48 hours");
  await expect(live.locator("figcaption b")).toContainText("IST");
  const src = await live.locator("video").getAttribute("src");
  expect((await request.head(src!)).ok()).toBe(true);
});
