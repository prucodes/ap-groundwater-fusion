import { expect, test } from "@playwright/test";
import watch from "../data/monsoon_watch.json";

for (const route of ["agriculture", "monsoon"]) {
  test(`${route} exposes dated sources and operational release gates`, async ({ page }, testInfo) => {
    await page.goto(`/${route}/`);
    const evidence = page.getByRole("region", { name: "Evidence status and release gates" });
    await expect(evidence).toContainText("Not live telemetry");
    await expect(evidence.getByText("Baseline review pending.", { exact: true })).toBeVisible();
    await evidence.locator("summary").click();
    await expect(evidence).toContainText("3/3 sampled series matched");
    await expect(evidence).toContainText("341 source-series comparisons change");
    await expect(evidence).toContainText("Not connected");
    await expect(evidence).toContainText("Operational release pending");
    await evidence.screenshot({ path: testInfo.outputPath(`${route}-source-status.png`) });
  });
}

test("Monsoon Watch does not pick a value from duplicate boundary joins", async ({ page }) => {
  await page.goto("/monsoon/");
  const counts = new Map<number, number>();
  for (const row of watch.mandals) if (row.boundaryIndex !== null) counts.set(row.boundaryIndex, (counts.get(row.boundaryIndex) ?? 0) + 1);
  const ambiguous = [...counts.entries()].find(([, count]) => count > 1)![0];
  const shape = page.locator(".rechargeMapSvg path").nth(ambiguous);
  await shape.dispatchEvent("mousemove", { clientX: 200, clientY: 200 });
  await expect(page.locator(".rechargeTip")).toContainText("Multiple source series");
  await expect(page.locator(".rechargeTip")).not.toContainText("m against");
  await expect(page.getByText("State storage estimate", { exact: true }).locator("..")).toContainText("Under review");
  await page.getByRole("button", { name: "Storage proxy", exact: true }).click();
  await expect(page.locator(".rechargeTip")).toContainText("Multiple source series");
});

for (const width of [1440, 390]) {
  test(`Monsoon briefing order and accessible map at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/monsoon/");
    await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
    const season = page.getByRole("region", { name: "Season evidence", exact: true });
    const film = page.getByRole("heading", { name: "From the Pacific to Andhra Pradesh" });
    await expect(season).toContainText("source series");
    await expect(season).toContainText("Baseline review pending");
    expect((await season.boundingBox())!.y).toBeLessThan((await film.boundingBox())!.y);
    await page.screenshot({ path: testInfo.outputPath(`monsoon-first-viewport-${width}.png`), animations: "disabled" });
    const cells = page.locator(".rechargeCell");
    await cells.first().focus();
    await expect(cells.first()).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(cells.nth(1)).toBeFocused();
    await expect(page.locator(".rechargeReadout")).not.toContainText("Colours show");
    await page.keyboard.press("Escape");
    await expect(page.locator(".rechargeTip")).toHaveCount(0);
    const index = watch.mandals.find(row => row.boundaryIndex !== null && watch.mandals.filter(other => other.boundaryIndex === row.boundaryIndex).length === 1)!.boundaryIndex!;
    await cells.nth(index).dispatchEvent("click");
    await expect(page.locator(".rechargeReadout")).toContainText("Recorded at");
    if (width === 1440) {
      const tip = (await page.locator(".rechargeTip").boundingBox())!;
      const frame = (await page.locator(".rechargeMapFigure").boundingBox())!;
      expect(tip.x).toBeGreaterThanOrEqual(frame.x);
      expect(tip.x + tip.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    }
    await page.locator("#monsoon-map").screenshot({ path: testInfo.outputPath(`monsoon-map-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}
