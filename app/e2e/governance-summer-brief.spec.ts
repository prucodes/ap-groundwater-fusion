import { expect, test } from "@playwright/test";
import priority from "../data/summer_priority.json";
import outlook from "../data/summer_outlook.json";
import context from "../data/water_context_summary.json";
import ledger from "../data/forecast_ledger.json";
import cyclone from "../data/cyclone_arnab.json";

test("the summer brief is one A4 sheet that leads with the mandals to plan first", async ({ page }) => {
  await page.goto("/summer/");
  await page.getByTestId("summer-brief-link").click();
  await expect(page).toHaveURL(/\/summer\/brief\/$/);
  const sheet = page.getByTestId("summer-brief");
  await expect(sheet).toHaveCount(1);
  await expect(sheet.locator("h1")).toContainText(`${priority.summary.first.mandals} mandals`);
  await expect(sheet.getByTestId("summer-brief-why")).toContainText(`${Math.round(context.reservoirs.storagePct)}% full`);
  await expect(sheet.getByTestId("summer-brief-places").locator("li")).toHaveCount(Math.min(6, priority.districts.filter(d => d.first).length));
  await expect(sheet).toContainText(`${outlook.summary.beyond}`);
  await expect(page.getByTestId("summer-brief-pdf")).toHaveAttribute("href", /\/summer\/brief\/ap-summer-water-brief\.pdf$/);
  // Nothing spills past the sheet: every block ends above the footer.
  const spill = await sheet.evaluate((el) => {
    const foot = el.lastElementChild!.getBoundingClientRect().top;
    return [...el.querySelectorAll("p, li, svg")].filter(n => n.getBoundingClientRect().bottom > foot + 1 && !el.lastElementChild!.contains(n)).length;
  });
  expect(spill).toBe(0);
});

test("the forecast record says what the next month's forecasts expect before they are scored", async ({ page }) => {
  const next = (ledger as { nextTest?: { forecasts: number; expectedChangeM: number | null } | null }).nextTest;
  test.skip(!next || next.expectedChangeM === null || (ledger.scored?.forecasts ?? 0) >= 100, "no month waiting, or a verdict is already given");
  await page.goto("/methodology/");
  const card = page.getByTestId("forecast-ledger");
  await card.evaluate((el) => el.closest("details")?.setAttribute("open", ""));
  const line = card.getByTestId("forecast-ledger-next");
  await expect(line).toContainText(`${next!.forecasts.toLocaleString("en-IN")} forecasts`);
  await expect(line).toContainText(`${Math.abs(next!.expectedChangeM!).toFixed(1)} m`);
});

test("the cyclone page reads as a closed record once the daily log has ended", async ({ page }) => {
  const closed = (cyclone.updatedAt ?? "") >= "2026-11-30" || cyclone.generatedAt.slice(0, 10) > "2026-11-30";
  await page.goto("/cyclones/");
  const notes = page.locator("details", { hasText: "Sources and limits" }).last();
  if (closed) {
    await expect(page.getByTestId("arnab-hero")).toContainText("record closed");
    await expect(notes).toContainText("the weekly refresh now keeps the page");
  } else {
    await expect(page.getByTestId("arnab-hero")).not.toContainText("record closed");
    await expect(notes).toContainText("Updated every morning until 30 Nov");
  }
});
