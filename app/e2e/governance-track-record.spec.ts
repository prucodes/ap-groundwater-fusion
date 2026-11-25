import { expect, test } from "@playwright/test";
import fieldCheck from "../data/field_check.json";
import sensors from "../data/sensor_wells_check.json";
import summer from "../data/summer_outlook.json";

test("methodology leads with every part's track record, the sensors included", async ({ page }) => {
  await page.goto("/methodology/");
  const card = page.getByTestId("track-record");
  await expect(card).toBeVisible();
  for (const id of ["summer", "nowcast", "forecast", "ledger", "crops", "sensors"]) await expect(card.getByTestId(`track-${id}`)).toHaveCount(1);
  await expect(card.getByTestId("track-summer")).toContainText(`${Math.round(summer.backtest!.recordsFlaggedPct!)}%`);
  if (sensors.verdict !== "stands in") await expect(card.getByTestId("track-sensors")).toContainText("Not used for levels");
});

test("the field check pilot states its plan, its predictions and an honest empty score", async ({ page }) => {
  await page.goto("/field-check/");
  await expect(page.getByTestId("field-check-hero")).toContainText("Proposed to the Groundwater Department");
  const p = fieldCheck.predictions;
  await expect(page.getByTestId("field-check-predictions")).toContainText(`${p.dugMandalOnlyM.toFixed(1)} m → ${p.dugAfterThreeM.toFixed(1)} m`);
  await expect(page.getByTestId("field-check-predictions")).toContainText(fieldCheck.planSha256.slice(0, 12));
  await expect(page.getByTestId("field-check-mandals").locator("tbody tr")).toHaveCount(fieldCheck.mandals.length);
  if (!fieldCheck.results) await expect(page.getByTestId("field-check-results")).toContainText("No readings filed yet");
  await expect(page.getByTestId("field-check-pdf")).toHaveAttribute("href", /\/field-check\/sheet\/ap-field-check-protocol\.pdf$/);
});

test("the field check protocol is one A4 sheet with nothing past its footer", async ({ page }) => {
  await page.goto("/field-check/sheet/");
  const sheet = page.getByTestId("field-sheet");
  // One row per mandal, each with its name in bold; the district headings carry none.
  await expect(sheet.getByTestId("field-sheet-mandals").locator("tbody tr").filter({ has: page.locator("td b") })).toHaveCount(fieldCheck.mandals.length);
  const spill = await sheet.evaluate((el) => {
    const foot = el.lastElementChild!.getBoundingClientRect().top;
    return [...el.querySelectorAll("p, li, tr")].filter(n => n.getBoundingClientRect().bottom > foot + 1 && !el.lastElementChild!.contains(n)).length;
  });
  expect(spill).toBe(0);
});

test("the field report points to the pilot", async ({ page }) => {
  await page.goto("/field-report/");
  await expect(page.getByTestId("field-check").getByRole("link", { name: "field check pilot" })).toHaveAttribute("href", /\/field-check\/$/);
});
