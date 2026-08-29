import { test, expect, type Page } from "@playwright/test";

/**
 * Guards the mobile layout.
 *
 * The app once rendered a 264px-wide sidebar into a 76px column on phones,
 * overlapping its own labels and crushing the page into what was left, and
 * several inline grid-template-columns pushed content past the viewport. Both
 * are invisible to unit tests and to a desktop browser, so they are asserted
 * here against a real rendered page.
 */

const ROUTES = [
  "/",
  "/alerts",
  "/climate",
  "/compare",
  "/districts",
  "/estimates",
  "/irrigation",
  "/living-water-table",
  "/mandals",
  "/map",
  "/methodology",
  "/nasa",
  "/readiness",
  "/reports",
  "/scenario",
  "/settings",
  "/snapshot",
  "/watchlist",
];

// Sub-pixel rounding can leave a fraction of a pixel of scroll that no user can
// perceive. More than a pixel is a real sideways scroll.
const OVERFLOW_TOLERANCE_PX = 1;

async function settle(page: Page) {
  // Maps, 3D scenes and the page transition all resize after first paint.
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

/**
 * Interactive controls whose right edge falls outside the viewport with no
 * scrollable ancestor to reach them — i.e. buttons the user simply cannot tap.
 * A page can fail this while still not scrolling sideways, which is the worse
 * of the two symptoms, so it is checked separately.
 */
async function unreachableControls(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrollable = (el: Element) => {
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") return true;
        parent = parent.parentElement;
      }
      return false;
    };
    return [...document.querySelectorAll("button, a, input, select")]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        if (getComputedStyle(el).position === "fixed") return false;
        return box.right > width + 1 && !scrollable(el);
      })
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}`)
      .slice(0, 5);
  });
}

test.describe("phone layout", () => {

  for (const route of ROUTES) {
    test(`${route} does not scroll sideways`, async ({ page }) => {
      await page.goto(route);
      await settle(page);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
      expect(await unreachableControls(page)).toEqual([]);
    });
  }

  test("a mandal detail page does not scroll sideways", async ({ page }) => {
    await page.goto("/mandals");
    await settle(page);
    const link = page.locator('a[href^="/mandals/"]').first();
    await expect(link).toBeAttached();
    await page.goto((await link.getAttribute("href"))!);
    await settle(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
  });

  test("navigation is reachable through the drawer, not a crushed sidebar", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    // The sidebar must be off-canvas, not occupying a slice of the screen.
    const sidebar = page.locator(".sidebar");
    const viewportWidth = page.viewportSize()!.width;
    const closedBox = await sidebar.boundingBox();
    expect(closedBox!.x + closedBox!.width).toBeLessThanOrEqual(0);

    await page.locator(".mobileNavBtn").click();
    await page.waitForTimeout(400);

    const openBox = await sidebar.boundingBox();
    expect(openBox!.x).toBeGreaterThanOrEqual(-1);
    // A drawer that covers the whole screen has no visible way back to content.
    expect(openBox!.width).toBeLessThan(viewportWidth);

    // Escape must close it, or a keyboard user is trapped.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const reclosed = await sidebar.boundingBox();
    expect(reclosed!.x + reclosed!.width).toBeLessThanOrEqual(0);
  });

  test("navigating from the drawer closes it", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await page.locator(".mobileNavBtn").click();
    await page.waitForTimeout(400);

    // The export uses trailing slashes, so match the prefix rather than an
    // exact href.
    await page.locator('.sidebarNav a[href^="/map"]').first().click();
    await page.waitForURL("**/map/**");
    await page.waitForTimeout(500);

    const box = await page.locator(".sidebar").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(0);
    // Scroll must be handed back, or the new page cannot be read.
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });
});
