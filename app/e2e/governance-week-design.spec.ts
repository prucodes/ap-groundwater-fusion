import { expect, test } from "@playwright/test";
import changes from "../data/weekly_changes.json";

for (const width of [320, 390, 768, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`weekly briefing is readable and interactive at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/changes/?theme=${theme}`);
      await expect(page.getByTestId("week-move-map")).toHaveAttribute("data-ready", "true");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("This Week");
      await expect(page.getByTestId("page-brief")).toContainText("previous refresh");
      const moved = changes.items.filter(item => item.direction !== "same");
      for (const item of moved) {
        const card = page.locator(`a[data-key="${item.key}"]`);
        await expect(card).toBeVisible();
        if (item.before !== null && item.after !== null) {
          await expect(card.getByTestId("weekly-comparison")).toHaveAttribute("aria-label", /Two snapshots, not a trend/);
        }
      }
      await page.screenshot({ path: testInfo.outputPath(`weekly-${width}-${theme}.png`) });
      await page.locator("#weekly-register > summary").click();
      for (const item of changes.items.filter(item => item.direction === "same")) {
        const row = page.locator(`a[data-key="${item.key}"]`);
        await expect(row).toBeVisible();
        if (item.refreshed === false) await expect(row).toContainText("source has not updated");
      }
      await page.getByTestId("week-moves").locator("details > summary").click();
      await expect(page.getByTestId("week-moves").getByRole("link", { name: "Open the Drought Watch" })).toBeVisible();
      await page.getByTestId("week-view-before").click();
      await expect(page.getByTestId("week-view-before")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("week-view-after").click();
      await expect(page.getByTestId("week-view-after")).toHaveAttribute("aria-pressed", "true");
      expect(await page.evaluate(() => { scrollTo(document.documentElement.scrollWidth, scrollY); return scrollX; })).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }
}

test("printing includes the folded source register", async ({ page }) => {
  await page.goto("/changes/");
  const unchanged = page.locator('a[data-direction="same"]').first();
  await expect(unchanged).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(unchanged).toBeVisible();
});
