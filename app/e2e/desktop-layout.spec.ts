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
  "/monsoon",
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

/* The map answers "where"; it should not be the whole page. At full card width
   it rendered 926x792 and left its hover readout half a screen below the
   cursor that drove it. */
test.describe("the monsoon map is legible at desktop width", () => {
  test("the map is capped and its readout sits beside it", async ({ page }) => {
    await page.goto("/monsoon");
    await settle(page);

    const map = await page.locator(".rechargeMapSvg").boundingBox();
    // It has been wrong in both directions: 792px pushed every other block
    // under the fold, and a 430px correction was called too small. What
    // actually matters is that it is the largest thing on the page without
    // being most of it, so both bounds are asserted.
    expect(map!.height).toBeGreaterThan(480);
    expect(map!.height).toBeLessThanOrEqual(660);
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    expect(map!.height).toBeLessThan(pageHeight * 0.25);

    const readout = await page.locator(".rechargeReadout").boundingBox();
    // Beside, not below: the readout must overlap the map vertically.
    expect(readout!.y).toBeLessThan(map!.y + map!.height);
  });

  test("hovering a mandal names it", async ({ page }) => {
    await page.goto("/monsoon");
    await settle(page);

    const before = await page.locator(".rechargeReadout").innerText();
    await page.locator(".rechargeCell:not(.noData)").nth(120).hover({ force: true });
    await page.waitForTimeout(250);

    await expect(page.locator(".rechargeTip")).toBeVisible();
    expect(await page.locator(".rechargeReadout").innerText()).not.toBe(before);
  });
});

/* A hydration mismatch makes React throw the server's tree away and rebuild it
   in the browser. The page still renders, so nothing visible says it happened:
   the monsoon page carried one for two releases. Its cause was <title> children
   on the SVG bars, which the browser relocates as document metadata, so they
   were absent from the parsed server HTML and present once React had hydrated.

   Every route is clean today, so every route is held to it. A failure here
   names the route; the cause is usually markup whose parsed form differs from
   what React rendered, or a value that differs between build and browser. */
const HYDRATION_ROUTES = [
  "/",
  "/map",
  "/mandals",
  "/estimates",
  "/districts",
  "/watchlist",
  "/alerts",
  "/monsoon",
  "/climate",
  "/methodology",
  "/snapshot",
];

test.describe("no route throws while hydrating", () => {
  for (const route of HYDRATION_ROUTES) {
    test(`${route} hydrates cleanly`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(route);
      await settle(page);
      expect(errors, `${route} threw: ${errors.join(" | ")}`).toEqual([]);
    });
  }
});

test.describe("both monsoon charts answer the pointer", () => {
  test("a rainfall column names its year and the ocean state with it", async ({ page }) => {
    await page.goto("/monsoon");
    await settle(page);

    const before = await page.locator(".rainHistReadout").innerText();
    await page.locator(".rainBar").nth(42).hover({ force: true });
    await page.waitForTimeout(200);
    const after = await page.locator(".rainHistReadout").innerText();

    expect(after).not.toBe(before);
    expect(after).toMatch(/\d{4}/);
    expect(after).toMatch(/mm/);
  });

  test("no SVG carries a title child, which the browser would relocate", async ({ page }) => {
    await page.goto("/monsoon");
    await settle(page);
    const titles = await page.evaluate(
      () => document.querySelectorAll("svg title").length,
    );
    expect(titles).toBe(0);
  });
});

/* The executive snapshot exists to be printed. Capping its 670-row register so
   the screen stays usable is right, and silently truncating the printout to one
   screenful would be the worst possible way to get it wrong -- nobody would
   notice until a printed sheet reached someone with rows missing.

   These assert the two halves against each other: the cap exists on screen, and
   print releases it. Any future scroll cap on this page has to pass both. */
test.describe("the snapshot caps on screen and prints in full", () => {
  test("on screen the register scrolls instead of stretching the page", async ({ page }) => {
    await page.goto("/snapshot");
    await settle(page);

    const rows = await page.locator("tbody tr").count();
    expect(rows).toBeGreaterThan(600);

    const register = page.locator(".snapRegister");
    const box = await register.boundingBox();
    expect(box!.height).toBeLessThan(900);

    // Every row is present and reachable, not truncated away.
    const scrollable = await register.evaluate((el) => el.scrollHeight > el.clientHeight + 4);
    expect(scrollable).toBe(true);

    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    expect(pageHeight).toBeLessThan(4000);
  });

  test("print releases the cap and repeats the column headings", async ({ page }) => {
    await page.goto("/snapshot");
    await settle(page);
    const onScreen = await page.locator(".snapRegister").boundingBox();

    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(400);

    const printed = await page.evaluate(() => {
      const el = document.querySelector(".snapRegister") as HTMLElement;
      const style = getComputedStyle(el);
      const thead = getComputedStyle(document.querySelector("table.dataTable thead") as HTMLElement);
      return {
        height: el.getBoundingClientRect().height,
        maxHeight: style.maxHeight,
        overflowY: style.overflowY,
        theadDisplay: thead.display,
      };
    });

    // The whole register, not one screenful.
    expect(printed.height).toBeGreaterThan(onScreen!.height * 10);
    expect(printed.maxHeight).toBe("none");
    expect(printed.overflowY).toBe("visible");
    // Fifteen pages of a table whose headings appeared once are unreadable.
    expect(printed.theadDisplay).toBe("table-header-group");
  });
});

/* Metres of water table and the water they hold rank mandals differently --
   a metre lost from hard rock is a fraction of a metre lost from the delta.
   If the two views agreed, the second would be decoration. */
test.describe("the recharge map reads in metres and in water", () => {
  test("switching the view recolours the map and changes what the tooltip says",
    async ({ page }) => {
      await page.goto("/monsoon");
      await settle(page);

      const cell = page.locator(".rechargeCell:not(.noData)").nth(150);
      await cell.hover({ force: true });
      await page.waitForTimeout(200);
      const inMetres = await page.locator(".rechargeTip").innerText();
      expect(inMetres).toMatch(/against its own normal/);

      const fillsBefore = await page.evaluate(() =>
        [...document.querySelectorAll(".rechargeCell")].slice(0, 120).map((c) => c.getAttribute("fill")).join("|"));

      await page.getByRole("button", { name: "Water lost" }).click();
      await page.waitForTimeout(250);

      const fillsAfter = await page.evaluate(() =>
        [...document.querySelectorAll(".rechargeCell")].slice(0, 120).map((c) => c.getAttribute("fill")).join("|"));
      expect(fillsAfter).not.toBe(fillsBefore);

      await cell.hover({ force: true });
      await page.waitForTimeout(200);
      expect(await page.locator(".rechargeTip").innerText()).toMatch(/Mm³ of water short/);
      await expect(page.locator(".rechargeLegend")).toContainText("Mm³");
    });

  test("the season card is lowered but the chart still spans its card", async ({ page }) => {
    await page.goto("/monsoon");
    await settle(page);
    const svg = await page.locator(".trajectorySvg").boundingBox();
    const card = await page.locator(".trajectoryWrap").boundingBox();
    // Shortened by reshaping the viewBox, not by capping height -- a cap would
    // have narrowed it and left whitespace either side.
    expect(svg!.height).toBeLessThan(340);
    expect(svg!.width).toBeGreaterThan(card!.width * 0.95);
  });
});
