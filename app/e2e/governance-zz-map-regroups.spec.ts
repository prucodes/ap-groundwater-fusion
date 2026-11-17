import { expect, test, type Locator, type Page } from "@playwright/test";
import monsoon from "../data/monsoon_watch.json";
import summer from "../data/summer_outlook.json";
import drought from "../data/drought_watch_summary.json";

/* Three of the State maps can line their mandals up (components/MapSpread.tsx), as This
   Week's sensor map does. The picture is only worth having if it is the figure: the squares
   on each side of the line, or in each column, must be exactly the counts the page states. */

const CATEGORY_ORDER = ["severe", "moderate|severe", "moderate", "normal|moderate", "normal", "noTrigger", "insufficient"] as const;
const counts = drought.state.counts as unknown as Record<string, number>;

/** Each square's centre in the map's units, and the dividing line's place when there is one. */
const squares = (stage: Locator) => stage.evaluate(element => {
  const svg = element.querySelector("svg")!, back = svg.getScreenCTM()!.inverse();
  const tiles = [...svg.querySelectorAll('[data-testid="spread-tiles"] rect')].map(rect => {
    const box = rect.getBoundingClientRect();
    const point = new DOMPoint(box.left + box.width / 2, box.top + box.height / 2).matrixTransform(back);
    return { x: point.x, y: point.y };
  });
  const divide = [...svg.querySelectorAll('[data-testid="spread-tiles"] line')].find(line => getComputedStyle(line).strokeDasharray !== "none");
  return { tiles, divide: divide ? Number(divide.getAttribute("x1")) : null };
});

async function lineUp(page: Page, url: string, stageSelector: string, label: string) {
  await page.goto(url);
  const stage = page.locator(stageSelector).first();
  await stage.scrollIntoViewIfNeeded();
  const toggle = page.getByTestId("spread-toggle").filter({ has: page.getByRole("button", { name: label }) });
  await expect(toggle).toBeVisible({ timeout: 15000 });
  const before = await squares(stage);
  await toggle.getByRole("button", { name: label }).click();
  await expect(stage).toHaveAttribute("data-view", "spread");
  await expect(toggle.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
  // The last square to leave has arrived.
  await page.waitForTimeout(2000);
  return { stage, toggle, before, after: await squares(stage) };
}

async function goesBack(page: Page, stage: Locator, toggle: Locator, home: Array<{ x: number; y: number }>) {
  await toggle.getByRole("button", { name: "On the map" }).click();
  await page.waitForTimeout(2000);
  await expect(stage).toHaveAttribute("data-view", "map");
  const back = await squares(stage);
  expect(back.tiles.every((tile, i) => Math.abs(tile.x - home[i].x) < 0.8 && Math.abs(tile.y - home[i].y) < 0.8)).toBe(true);
  // The map's own outlines are back, and the squares out of the way.
  expect(await stage.locator("svg > g").first().evaluate(group => getComputedStyle(group).opacity)).toBe("1");
}

for (const [name, width, height] of [["laptop", 1440, 960], ["phone", 390, 844]] as const) {
  test.describe(name, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width, height }); });

    test("Monsoon: right of the line are the mandals lower than in May", async ({ page }) => {
      const { stage, toggle, before, after } = await lineUp(page, "/monsoon/", ".rechargeMapStage", "By change");
      // Every mandal the season count includes has a square, even the few without an outline of their own.
      expect(after.tiles).toHaveLength(monsoon.recharge.mandals);
      expect(after.tiles.filter(tile => tile.x > after.divide!)).toHaveLength(monsoon.recharge.falling);
      await expect(stage.getByText(/lower than in May$/)).toBeVisible();
      await expect(stage).toContainText(String(monsoon.recharge.falling));
      await goesBack(page, stage, toggle, before.tiles);
    });

    test("Summer: right of the line are the mandals past their deepest May", async ({ page }) => {
      const { stage, toggle, before, after } = await lineUp(page, "/summer/", '[data-testid="summer-map"] [data-view]', "By record");
      expect(after.tiles).toHaveLength(summer.summary.mandals);
      expect(after.tiles.filter(tile => tile.x > after.divide!)).toHaveLength(summer.summary.beyond);
      expect(after.tiles.filter(tile => tile.x < after.divide!)).toHaveLength(summer.summary.dry + summer.summary.within);
      await expect(stage.getByText(/past their deepest May on record$/)).toBeVisible();
      await goesBack(page, stage, toggle, before.tiles);
    });

    test("Drought: each column is one of the manual's readings, as many squares as the legend counts", async ({ page }) => {
      const { stage, toggle, before, after } = await lineUp(page, "/drought/", '[data-view]:has([data-testid="drought-map"])', "By reading");
      expect(after.tiles).toHaveLength(CATEGORY_ORDER.reduce((sum, key) => sum + (counts[key] ?? 0), 0));
      // Columns are the runs of squares between the wider gaps, left to right.
      const xs = [...new Set(after.tiles.map(tile => Math.round(tile.x * 10) / 10))].sort((a, b) => a - b);
      const steps = xs.slice(1).map((x, i) => x - xs[i]), pitch = Math.min(...steps);
      const columns: number[][] = [[xs[0]]];
      xs.slice(1).forEach((x, i) => { if (steps[i] > pitch * 1.6) columns.push([x]); else columns[columns.length - 1].push(x); });
      const sizes = columns.map(column => after.tiles.filter(tile => tile.x >= column[0] - 0.05 && tile.x <= column[column.length - 1] + 0.05).length);
      expect(sizes).toEqual(CATEGORY_ORDER.map(key => counts[key] ?? 0));
      for (const key of ["severe", "moderate"]) await expect(stage).toContainText(String(counts[key]));
      await goesBack(page, stage, toggle, before.tiles);
    });
  });
}

test("with reduced motion the squares change places at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/drought/");
  const stage = page.locator('[data-view]:has([data-testid="drought-map"])');
  await stage.scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "By reading" }).click();
  await page.waitForTimeout(80);
  const { tiles } = await squares(stage);
  // Already standing on the line: no square is still up on the map.
  const baseline = Math.max(...tiles.map(tile => tile.y));
  expect(tiles.filter(tile => tile.y > baseline - 20).length).toBeGreaterThan(40);
});
