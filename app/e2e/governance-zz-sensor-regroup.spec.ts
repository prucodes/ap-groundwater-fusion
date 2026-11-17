import { expect, test, type Locator } from "@playwright/test";

/* This Week's sensor map has two arrangements of the same dots: where each sensor stands,
   and lined up by how far it has moved in a year. The second is only worth having if the
   picture is the figure: the dots right of the line must be exactly the sensors the page
   counts as deeper. */

/** Each dot's centre in the map's own units (640 wide), with the side the page gave it. */
const dots = (view: Locator) => view.evaluate(element => {
  const frame = element.querySelector("svg")!.getBoundingClientRect(), scale = frame.width / 640;
  return [...element.querySelectorAll<SVGCircleElement>("circle[data-side]")].map(dot => {
    const box = dot.getBoundingClientRect();
    return { side: Number(dot.dataset.side), x: (box.left + box.width / 2 - frame.left) / scale, y: (box.top + box.height / 2 - frame.top) / scale };
  });
});

for (const [name, width, height] of [["laptop", 1440, 900], ["phone", 390, 844]] as const) {
  test(`${name}: lined up by change, the dots right of the line are the sensors counted as deeper`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/changes/");
    const pulse = page.getByTestId("sensor-pulse"), view = page.getByTestId("sensor-view");
    await view.scrollIntoViewIfNeeded();
    await expect(view.locator("svg")).toHaveAttribute("data-drawn", "done", { timeout: 15000 });
    // The page's own count: "1,148 of 1,522".
    const [, deeper, compared] = (await pulse.innerText()).replace(/,/g, "").match(/(\d+) of (\d+)/)!.map(Number);
    const onMap = await dots(view);
    expect(onMap).toHaveLength(compared);

    await expect(view).toHaveAttribute("data-view", "map");
    await view.getByRole("button", { name: "By change" }).click();
    await expect(view).toHaveAttribute("data-view", "spread");
    await expect(view.getByRole("button", { name: "By change" })).toHaveAttribute("aria-pressed", "true");
    // Every dot has travelled once the slowest (the last in the order) has finished; a slow machine takes longer.
    const settled = () => page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))));
    await page.waitForTimeout(400);
    await settled();
    const lined = await dots(view);
    const zeroLeft = 10 + 9 * 20, zeroRight = zeroLeft + 20, baseline = Math.max(...lined.map(dot => dot.y));
    expect(lined.filter(dot => dot.x > zeroRight)).toHaveLength(deeper);
    expect(lined.filter(dot => dot.x > zeroRight).every(dot => dot.side === 1)).toBe(true);
    expect(lined.filter(dot => dot.x < zeroLeft).every(dot => dot.side === -1)).toBe(true);
    expect(lined.filter(dot => dot.x >= zeroLeft && dot.x <= zeroRight).every(dot => dot.side === 0)).toBe(true);
    // A strip, not a cloud: everything stands on one line and inside the frame.
    expect(lined.every(dot => dot.x > 0 && dot.x < 640 && dot.y > 60 && dot.y <= baseline)).toBe(true);
    // No two sensors share a place.
    expect(new Set(lined.map(dot => `${dot.x.toFixed(1)},${dot.y.toFixed(1)}`)).size).toBe(compared);
    // Its words are on screen, clear of the toggle and inside the figure.
    const frame = (await view.boundingBox())!, toggle = (await view.getByRole("group").boundingBox())!;
    for (const words of [view.getByText(/shallower$/), view.getByText(/deeper than a year ago$/), view.getByText(/^\d+ m\+$/)]) {
      await expect(words).toBeVisible();
      const box = (await words.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(frame.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      expect(box.y >= toggle.y + toggle.height || box.x >= toggle.x + toggle.width).toBe(true);
    }

    // And back: every sensor returns to where it stands.
    await view.getByRole("button", { name: "On the map" }).click();
    await expect.poll(async () => {
      const back = await dots(view);
      return back.filter((dot, i) => Math.abs(dot.x - onMap[i].x) >= 0.6 || Math.abs(dot.y - onMap[i].y) >= 0.6).length;
    }, { timeout: 8000 }).toBe(0);
  });
}

test("with reduced motion the dots change places at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/changes/");
  const view = page.getByTestId("sensor-view");
  await view.scrollIntoViewIfNeeded();
  await view.getByRole("button", { name: "By change" }).click();
  await page.waitForTimeout(100);
  const lined = await dots(view);
  expect(Math.max(...lined.map(dot => dot.y)) - Math.min(...lined.filter(dot => dot.side === 0).map(dot => dot.y))).toBeLessThan(200);
  expect(new Set(lined.map(dot => `${dot.x.toFixed(1)},${dot.y.toFixed(1)}`)).size).toBe(lined.length);
});
