import { expect, test, type Page } from "@playwright/test";

/* Every chart, bar, ring and map on the site is revealed once, the first time it is
   reached (components/ChartReveal.tsx). The reveal hides a picture until then, so the
   thing to guard is a picture that is never shown: after a page has been read to the
   bottom, nothing a reader can see may still be waiting. */

const ROUTES = ["/", "/changes/", "/cyclones/", "/monsoon/", "/drought/", "/rabi/", "/summer/", "/agriculture/", "/districts/", "/constituencies/", "/facts/", "/mandals/"];

async function readToTheBottom(page: Page) {
  const step = Math.round((page.viewportSize()?.height ?? 800) * 0.6);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += step) { await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(60); }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
}

/** Pictures still waiting for their reveal although a reader can see where they are. */
const waiting = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-draw]:not([data-drawn])")].filter(el => {
  const frame = el.dataset.draw === "sequence" ? el : el.parentElement!;
  const box = frame.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && !el.closest("details:not([open])") && frame.checkVisibility({ contentVisibilityAuto: true, checkVisibilityCSS: true });
}).map(el => `${el.tagName.toLowerCase()}[${el.dataset.draw || "wipe"}] in ${el.closest("[data-testid]")?.getAttribute("data-testid") ?? el.parentElement?.className}`));

for (const [name, width, height] of [["laptop", 1440, 900], ["phone", 390, 844]] as const) {
  test(`${name}: nothing is left hidden once a page has been read`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    let reveals = 0;
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForFunction(() => document.documentElement.dataset.motion === "ready");
      await readToTheBottom(page);
      expect(await waiting(page), `${route}, as it opens`).toEqual([]);
      // Folded chapters hold charts too: opened, they must draw like any other.
      await page.evaluate(() => document.querySelectorAll("details").forEach(fold => { fold.open = true; }));
      await page.waitForTimeout(500);
      await readToTheBottom(page);
      expect(await waiting(page), `${route}, every fold opened`).toEqual([]);
      reveals += await page.locator("[data-draw]").count();
    }
    expect(reveals).toBeGreaterThan(300);
  });
}

test("a bar further down grows when it is reached, and bars already on screen never blink", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/constituencies/");
  await page.waitForFunction(() => document.documentElement.dataset.motion === "ready");
  const bars = page.locator('[data-draw="bar"]');
  expect(await bars.count()).toBeGreaterThan(20);
  // On screen as the page opened: drawn already, at full size.
  const first = bars.first();
  await expect(first).toHaveAttribute("data-drawn", "done");
  // Below the fold: waiting at nothing, then full size once scrolled to.
  const last = bars.last();
  await expect(last).not.toHaveAttribute("data-drawn", /.+/);
  expect(await last.evaluate(el => getComputedStyle(el).transform)).toBe("matrix(0, 0, 0, 1, 0, 0)");
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveAttribute("data-drawn", "done", { timeout: 4000 });
  expect(await last.evaluate(el => getComputedStyle(el).transform)).toBe("none");
});

test("with reduced motion nothing is ever hidden", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/facts/");
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBeUndefined();
  for (const el of await page.locator('i[style*="width"]').all()) expect(await el.evaluate(node => getComputedStyle(node).transform)).toBe("none");
  expect(await page.locator("svg[data-draw] rect[data-on]").first().evaluate(node => getComputedStyle(node).opacity)).toBe("1");
});
