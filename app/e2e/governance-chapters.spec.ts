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

test("Agriculture, Drought Watch and Summer keep their reference chapters to one line until opened", async ({ page }) => {
  for (const [path, folds] of [["/agriculture/", ["chapter-district-brief", "chapter-crop-lab", "chapter-advisory"]],
                                ["/drought/", ["chapter-dry-weeks", "chapter-store-sown", "chapter-state-steps"]],
                                ["/summer/", ["chapter-furthest"]]] as const) {
    await page.goto(path);
    for (const id of folds) {
      const fold = page.getByTestId(`fold-${id}`);
      await expect(fold).not.toHaveAttribute("open", "");
      await expect(fold.locator(":scope > summary p")).not.toBeEmpty();
    }
  }
});

test("the crop check's lab button opens the folded lab and brings it into view", async ({ page }) => {
  await page.goto("/agriculture/");
  await page.getByRole("button", { name: /Work it through in the crop-water lab/ }).click();
  await expect(page.getByTestId("fold-chapter-crop-lab")).toHaveAttribute("open", "");
  await expect(page.locator("#crop-water-lab")).toBeInViewport();
});
