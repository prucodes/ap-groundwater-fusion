import { expect, test } from "@playwright/test";
import village from "../data/village_offsets_summary.json";
import queue from "../data/field_queue.json";
import monsoon from "../data/monsoon_watch.json";

for (const width of [390, 1440]) {
  test(`village evidence distinguishes future offsets from village depths at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/districts/#village-offsets");
    const evidence = page.getByTestId("village-offset-evidence");
    await expect(evidence).toBeVisible();
    const three = village.dugWell!.forwardDose.find(row => row.readings === 3)!;
    await expect(evidence).toContainText(`${three.residualErrorM.toFixed(2)} m`);
    await expect(evidence).toContainText("observed peer levels");
    await expect(evidence).toContainText("No mandal-nowcast error is included");
    await expect(evidence).not.toContainText("under the mandal model");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (process.env.ACCURACY_SCREENSHOTS) await evidence.screenshot({ path: `test-results/village-evidence-${width}.png` });
  });
}

test("rainfall layers describe association and storage proxies without causal attribution", async ({ page }) => {
  await page.goto("/map/");
  await page.getByRole("button", { name: "Rain–level association", exact: true }).click();
  const rain = page.getByTestId("rain-layer-legend");
  await expect(rain).toContainText("R² ≥ 0.4");
  await expect(rain).toContainText("Association does not establish causation");
  await page.getByRole("button", { name: "Storage / rainfall proxy", exact: true }).click();
  const storage = page.getByTestId("recharge-layer-legend");
  await expect(storage).toContainText("October–November rain is omitted");
  await expect(storage).toContainText("precautionary exclusion");
});

test("the brief reports the forward well test and does not promise a three-reading village forecast", async ({ page }) => {
  await page.goto("/brief/");
  const sheet = page.getByTestId("brief-sheet").nth(8);
  await expect(sheet).toContainText("future individual-offset MAE");
  await expect(sheet).toContainText("observed, not forecast");
  await expect(sheet).toContainText("A well does not represent an entire village");
  await expect(sheet).not.toContainText("A village needs three readings");
});

test("district field priorities count overlapping flags once and show full interval widths", async ({ page }) => {
  await page.goto("/districts/");
  const field = page.locator("#field-queue");
  const unique = queue.queue.filter(row => row.disagrees || row.belowSeaLevel).length;
  await expect(field.locator("span").filter({ hasText: /^of the top/ }).locator("..").locator("b")).toHaveText(String(unique));
  await expect(field).toContainText(`${queue.queue[0].intervalWidthM} m band width`);
  await expect(field).not.toContainText("±");
  await expect(page.locator("#seawater-watch")).toContainText("not surveyed at the wells");
});

test("monsoon ratios and warm-index history remain distinct from recharge and forecasts", async ({ page }) => {
  await page.goto("/monsoon/");
  const rising = monsoon.mandals.filter(row => row.bankedSharePct !== null && (row.riseM ?? 0) > 0).length;
  await expect(page.locator("#water-banked")).toContainText(`${rising}mandals with rising levels among the ${monsoon.banked.mandals}`);
  await expect(page.locator("#water-banked")).toContainText("not the fraction of rain retained");
  await expect(page.locator("#water-banked")).toContainText("negative changes are clipped to zero");
  const enso = page.locator("#enso-outlook");
  await expect(enso).toContainText("not the five-season episode criterion");
  await expect(enso).toContainText("RONI, a different index");
});

test("mandal seasonal recovery is not presented as recharge alone", async ({ page }) => {
  await page.goto("/mandals/ap-temp-mandal-kurnool-orvakal-506/");
  await expect(page.locator(".monsoonCycle")).toContainText("recharge, pumping and other flows");
  await expect(page.getByRole("region", {name: /State network/})).toContainText("dated station aggregate");
});
