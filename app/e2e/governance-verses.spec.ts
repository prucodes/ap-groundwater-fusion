import { expect, test } from "@playwright/test";
import { VERSES } from "../lib/verses";

test("the welcome screen carries Narada's question on tanks, in Telugu script and English", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  const verse = page.locator('[data-verse="narada"]');
  await expect(verse).toBeVisible();
  await expect(verse.locator('blockquote[lang="sa-Telu"]')).toContainText(VERSES.narada.telugu[0]);
  await expect(verse).toContainText("not left to the rain alone");
  await expect(verse.locator("cite")).toHaveText("Mahabharata, Sabha Parva 5");
  // The cut-down Telugu serif loads, rather than a system fallback.
  await expect.poll(() => page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('17px "Verse Telugu"', "కచ్చిద్"); })).toBe(true);
});

for (const [path, id] of [["/methodology/", "reflect"], ["/monsoon/", "rain"], ["/crystal/", "bhishma"], ["/summer/", "yaksha"]] as const) {
  test(`${path} closes with one verse`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId("verse")).toHaveCount(1);
    await expect(page.locator(`[data-verse="${id}"]`)).toContainText(VERSES[id].english);
  });
}
