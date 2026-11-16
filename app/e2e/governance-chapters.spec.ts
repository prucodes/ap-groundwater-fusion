import { expect, test } from "@playwright/test";
import outlook from "../data/enso_outlook.json";

test("Monsoon Watch folds its context chapters to one line each, with the one thing they say", async ({ page }) => {
  await page.goto("/monsoon/");
  const pacific = page.getByTestId("fold-chapter-pacific");
  await expect(pacific).not.toHaveAttribute("open", "");
  await expect(pacific.locator(":scope > summary")).toContainText(outlook.alert);
  await expect(page.locator("#enso-outlook")).toBeHidden();
  await expect(page.getByTestId("fold-chapter-heat").locator(":scope > summary")).toContainText("warmest year");
  await pacific.locator(":scope > summary").click();
  await expect(page.locator("#enso-outlook")).toBeVisible();
});

test("the jump menu and a shared link open the folded chapter they point into", async ({ page }) => {
  await page.goto("/monsoon/");
  await page.getByRole("navigation", { name: "Monsoon sections" }).getByRole("link", { name: "El Niño outlook" }).click();
  await expect(page.locator("#enso-outlook")).toBeInViewport();
  await page.goto("/changes/");
  await page.goto("/monsoon/#chapter-heat");
  await expect(page.getByTestId("fold-chapter-heat")).toHaveAttribute("open", "");
});

test("printing Monsoon Watch shows the folded chapters whole", async ({ page }) => {
  await page.goto("/monsoon/");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#enso-outlook")).toBeVisible();
});
