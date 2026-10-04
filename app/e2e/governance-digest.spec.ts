import { expect, test } from "@playwright/test";
import droughtJson from "../data/drought_watch_summary.json";

/* The Monday digest: one A4 sheet, reached from This Week, with the same
   drought counts This Week shows. */

const counts = (droughtJson as unknown as { state: { counts: Record<string, number> } }).state.counts;

test("the digest is reached from This Week and carries the same drought counts", async ({ page }) => {
  await page.goto("/changes/");
  await page.getByTestId("digest-link").click();
  const sheet = page.getByTestId("digest");
  await expect(sheet.locator("h1")).toContainText("Week of");
  await expect(sheet).toContainText(`${counts.severe} severe`);
  await expect(sheet).toContainText(`${counts.moderate} moderate`);
  await expect(sheet.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByTestId("digest-pdf")).toHaveAttribute("href", /\/digest\/ap-water-weekly-digest\.pdf$/);
});

test("the digest prints on one A4 sheet", async ({ page }) => {
  await page.goto("/digest/");
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBe(1);
});
