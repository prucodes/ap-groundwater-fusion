import { test, expect, type Page } from "@playwright/test";

/** Desktop must keep the persistent sidebar column the drawer work replaced on phones. */

const OVERFLOW_TOLERANCE_PX = 1;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);
}

/**
 * How far the page can actually be scrolled sideways.
 *
 * Deliberately not scrollWidth - clientWidth: a position:fixed overlay reports
 * the initial containing block (viewport + classic scrollbar), which inflates
 * scrollWidth on pages that scroll vertically without the user being able to
 * scroll sideways at all. Scrolling and reading back measures the symptom that
 * actually matters.
 */
async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const before = window.scrollX;
    window.scrollTo(document.documentElement.scrollWidth, window.scrollY);
    const reached = window.scrollX;
    window.scrollTo(before, window.scrollY);
    return reached - before;
  });
}

test.describe("desktop layout is unaffected", () => {

  test("sidebar stays a persistent column and the phone bar is hidden", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    const sidebar = page.locator(".sidebar");
    const box = await sidebar.boundingBox();
    // Visible at x=0 rather than parked off-canvas.
    expect(box!.x).toBe(0);
    expect(box!.width).toBeGreaterThan(200);

    await expect(page.locator(".mobileBar")).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
  });
});
