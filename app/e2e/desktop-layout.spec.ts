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

/* The rail column once overflowed by ~300px on the mandal detail page and ~460px
   on the home page while every phone width passed, because a single-column grid
   with no explicit track sizes to max-content. Desktop needs the same
   route-by-route sweep the phone project runs. */
const DESKTOP_ROUTES = [
  "/",
  "/districts",
  "/estimates",
  "/map",
  "/mandals",
  "/watchlist",
];

test.describe("no desktop route scrolls sideways", () => {
  for (const route of DESKTOP_ROUTES) {
    test(`${route} fits the viewport`, async ({ page }) => {
      await page.goto(route);
      await settle(page);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
    });
  }

  test("a mandal detail page fits the viewport", async ({ page }) => {
    await page.goto("/mandals");
    await settle(page);
    const href = await page.locator('a[href*="/mandals/"]').first().getAttribute("href");
    await page.goto(href!);
    await settle(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
  });
});

/* A short column beside a tall one just stops, leaving white. The overview once
   left ~730px beside its map and the mandal detail ~960px beside its rail, and
   neither was caught by the overflow checks above — those measure sideways
   scroll, and a vertical void does not scroll anything. */
const MAX_COLUMN_IMBALANCE_PX = 400;

type Void = { grid: string; heights: number[]; imbalance: number };

async function columnVoids(page: Page): Promise<Void[]> {
  return page.evaluate((limit) => {
    const found: { grid: string; heights: number[]; imbalance: number }[] = [];
    document.querySelectorAll<HTMLElement>(".pageWrap div").forEach((grid) => {
      const cs = getComputedStyle(grid);
      if (cs.display !== "grid") return;

      const tracks = cs.gridTemplateColumns.split(" ").filter(Boolean).length;
      if (tracks < 2) return;

      const kids = [...grid.children].filter(
        (k) => k.getBoundingClientRect().height > 40,
      ) as HTMLElement[];
      // Only a single row of columns can show a void. When items wrap onto
      // further rows the height difference is between rows, not beside them.
      if (kids.length !== tracks) return;

      // A sticky short column follows the reader down the page, so the space
      // beside it is deliberate rather than abandoned.
      const sticky = kids.some((k) => {
        if (getComputedStyle(k).position === "sticky") return true;
        const inner = k.firstElementChild;
        return !!inner && getComputedStyle(inner).position === "sticky";
      });
      if (sticky) return;

      const heights = kids.map((k) => Math.round(k.getBoundingClientRect().height));
      const imbalance = Math.max(...heights) - Math.min(...heights);
      if (imbalance > limit) {
        found.push({
          grid: (grid.className || grid.tagName).toString().slice(0, 40),
          heights,
          imbalance,
        });
      }
    });
    return found;
  }, MAX_COLUMN_IMBALANCE_PX);
}

test.describe("no column is left as dead space", () => {
  for (const route of DESKTOP_ROUTES) {
    test(`${route} has balanced columns`, async ({ page }) => {
      await page.goto(route);
      await settle(page);
      expect(await columnVoids(page)).toEqual([]);
    });
  }

  test("a mandal detail page has balanced columns", async ({ page }) => {
    await page.goto("/mandals");
    await settle(page);
    const href = await page.locator('a[href*="/mandals/"]').first().getAttribute("href");
    await page.goto(href!);
    await settle(page);
    expect(await columnVoids(page)).toEqual([]);
  });
});
