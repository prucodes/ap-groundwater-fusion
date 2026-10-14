import { expect, test } from "@playwright/test";
import watch from "../data/monsoon_watch.json";
import state from "../data/gw_state_summary.json";

test("rain summaries use the source precision and source window", async ({ page }) => {
  const deficit = Math.abs(watch.rainfall.anomalyPct).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  await page.goto("/");
  await expect(page.locator('.evidenceStrip a[href="/monsoon/"]')).toContainText(`${deficit}%`);
  await page.goto("/monsoon/");
  await expect(page.getByTestId("page-brief")).toContainText(`${deficit}%`);
  await expect(page.getByTestId("page-brief")).toContainText(String(watch.season.year));
});

test("comparison graphics preserve source values and proportional zero-based scales", async ({ page }) => {
  await page.goto("/monsoon/");
  const charts = page.getByTestId("evidence-comparison");
  await expect(charts).toHaveCount(4);
  const rain = charts.filter({ hasText: "Satellite rain" });
  await expect(rain).toHaveAttribute("data-value", String(watch.rainfall.mm));
  await expect(rain).toHaveAttribute("data-reference", String(watch.rainfall.normalMm));
  const depth = charts.filter({ hasText: "State mean depth" });
  await expect(depth).toHaveAttribute("data-value", String(state.state.currentM));
  await expect(depth).toHaveAttribute("data-reference", String(state.state.yearAgoM));
  const groundwater = charts.filter({ hasText: "Past-season high" });
  await expect(groundwater).toHaveAttribute("data-value", String(watch.recharge.fallingPct));
  const priorHigh = Math.max(...watch.seasons.filter(s => s.year !== watch.season.year).map(s => s.fallingPct));
  await expect(groundwater).toHaveAttribute("data-reference", String(priorHigh));
  for (const chart of await charts.all()) {
    const measured = await chart.evaluate(el => {
      const track = el.querySelector('div[aria-hidden="true"]')!;
      const [fill, marker] = track.children;
      const bounds = track.getBoundingClientRect();
      return {
        expected: Number(el.getAttribute("data-value")) / Number(el.getAttribute("data-maximum")),
        actual: fill.getBoundingClientRect().width / bounds.width,
        reference: Number(el.getAttribute("data-reference")) / Number(el.getAttribute("data-maximum")),
        marker: (marker.getBoundingClientRect().x + 1 - bounds.x) / bounds.width,
      };
    });
    expect(measured.actual).toBeCloseTo(measured.expected, 2);
    expect(measured.marker).toBeCloseTo(measured.reference, 2);
    await expect(chart).toHaveAttribute("aria-label", /Zero-based scale/);
  }
});

for (const width of [320, 390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`evidence summaries fit at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/monsoon/", "/agriculture/", "/drought/", "/summer/"]) {
        await page.goto(`${route}?theme=${theme}`);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const failures = await page.locator(".evidenceStrip, .pageBriefBand, [aria-labelledby='drought-command-title'], [data-testid='summer-summary']").evaluateAll(elements => {
          return elements.flatMap(parent => [parent, ...parent.querySelectorAll("strong, small, figcaption, li, p")])
            .filter(el => {
              const box = el.getBoundingClientRect();
              return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1);
            }).map(el => el.textContent?.slice(0, 70));
        });
        expect(failures, route).toEqual([]);
      }
    });
  }
}
