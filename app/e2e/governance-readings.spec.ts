import { expect, test } from "@playwright/test";

/* Readings day (/readings/): built around the newest month in, so it turns by itself when the
   Monday refresh brings a new month. It must name that month, and state the forecast test as
   the ledger has it: a verdict once a month has enough forecasts, otherwise the next test. */

test("readings day names the newest month and states the forecast test as the ledger has it", async ({ page }) => {
  await page.goto("/readings/");
  const hero = page.getByTestId("readings-hero");
  await expect(hero).toHaveAttribute("data-month", /^\d{4}-\d{2}$/);
  await expect(hero.locator("h2")).toContainText(/readings are in for \d+ of \d+ mandals/);
  const forecast = page.getByTestId("readings-forecast");
  if (await forecast.getAttribute("data-judged") !== null) {
    await expect(forecast.locator("h2")).toContainText(/missed by \d+\.\d m/);
  } else {
    await expect(page.getByTestId("readings-next-forecast")).toContainText(/\d+ forecasts frozen on/);
  }
  await expect(page.getByTestId("readings-sensors")).toBeVisible();
  await expect(page.getByTestId("readings-next")).toContainText(/usually land in the first week of/);
});

/* The map of what moved must add up to the counts the heading states: every mandal read in
   both months has a colour, its class is on the outline, and the legend counts the same.
   The likely misreadings are ringed and left out of the counts. The forecast strip's words
   never sit on each other. */
test("readings day's map adds up to its counts, and the forecast strip keeps its words apart", async ({ page }) => {
  await page.goto("/readings/");
  const map = page.getByTestId("readings-map");
  await expect(map).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  const heading = await page.locator("#moved-title").innerText();
  const [, rose, fell] = heading.match(/rose in (\d+) mandals and fell in (\d+)/)!.map(Number);
  const drawn = await map.evaluate(el => {
    const n: Record<string, number> = {};
    el.querySelectorAll("path[data-key]").forEach(p => { const k = p.getAttribute("data-key")!; n[k] = (n[k] ?? 0) + 1; });
    const legend: Record<string, number> = {};
    el.querySelectorAll("figcaption span[data-key]").forEach(s => { legend[s.getAttribute("data-key")!] = Number(s.textContent!.match(/· (\d+)$/)![1]); });
    return { n, legend, ringed: el.querySelectorAll("path[data-mark]").length };
  });
  expect((drawn.n.U ?? 0) + (drawn.n.u ?? 0)).toBe(rose);
  expect((drawn.n.D ?? 0) + (drawn.n.d ?? 0)).toBe(fell);
  for (const key of ["U", "u", "s", "d", "D"]) expect(drawn.legend[key]).toBe(drawn.n[key] ?? 0);
  const doubted = await page.getByTestId("readings-doubted").locator("a").count();
  expect(drawn.ringed).toBe(doubted);

  const strip = page.getByTestId("readings-strip");
  await strip.scrollIntoViewIfNeeded();
  await expect(strip).toContainText(/Forecast for \w+/);
  const clashes = await strip.evaluate(el => {
    const words = [...el.querySelectorAll(":scope > div > span")].filter(s => s.textContent!.trim() && s.getBoundingClientRect().width > 0).map(s => s.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
      const a = words[i], b = words[j];
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) n++;
    }
    return n;
  });
  expect(clashes).toBe(0);
});
