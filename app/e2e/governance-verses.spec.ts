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

for (const [path, id] of [["/methodology/", "reflect"], ["/monsoon/", "rain"], ["/summer/", "yaksha"]] as const) {
  test(`${path} closes with one verse`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId("verse")).toHaveCount(1);
    await expect(page.locator(`[data-verse="${id}"]`)).toContainText(VERSES[id].english);
  });
}

test("on Water Depth 3D the verse rests on the sea beside the State, then sinks, and never takes a touch", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/crystal/");
  const verse = page.locator('[data-verse="bhishma"]');
  await expect(verse).toBeVisible();
  expect(await verse.evaluate(el => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect(verse).toBeHidden({ timeout: 15000 });
});

test("on a phone Water Depth 3D keeps the whole screen for the scene", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/crystal/");
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-verse="bhishma"]')).toBeHidden();
});
