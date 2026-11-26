import { expect, test } from "@playwright/test";

/* Readings day (/readings/): built around the newest month in, so it turns by itself when the
   Monday refresh brings a new month. It must name that month, and state the forecast test as
   the ledger has it: a verdict once a month has enough forecasts, otherwise the next test. */

test("readings day names the newest month and states the forecast test as the ledger has it", async ({ page }) => {
  await page.goto("/readings/");
  const hero = page.getByTestId("readings-hero");
  await expect(hero).toHaveAttribute("data-month", /^\d{4}-\d{2}$/);
  await expect(hero.locator("h2")).toContainText(/readings are in for \d+ of \d+ mandals/);
  const forecast = page.getByTestId("readings-forecast");
  if (await forecast.getAttribute("data-judged") !== null) {
    await expect(forecast.locator("h2")).toContainText(/missed by \d+\.\d m/);
  } else {
    await expect(page.getByTestId("readings-next-forecast")).toContainText(/\d+ forecasts frozen on/);
  }
  await expect(page.getByTestId("readings-sensors")).toBeVisible();
  await expect(page.getByTestId("readings-next")).toContainText(/usually land in the first week of/);
});
