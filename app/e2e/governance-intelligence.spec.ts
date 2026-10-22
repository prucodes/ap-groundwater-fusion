import { expect, test } from "@playwright/test";
import village from "../data/village_offsets_summary.json";
import queue from "../data/field_queue.json";
import monsoon from "../data/monsoon_watch.json";

/* The accuracy pass: each figure says what it measures in plain words, and the
   corrected village numbers are the ones on the page. */

for (const width of [390, 1440]) {
  test(`village evidence shows the forward figure against the mandal figure alone at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/districts/#village-offsets");
    const evidence = page.getByTestId("village-offset-evidence");
    await expect(evidence).toBeVisible();
    const three = village.dugWell!.forwardDose.find(row => row.readings === 3)!;
    await expect(evidence).toContainText(`${three.residualErrorM.toFixed(2)} m`);
    await expect(evidence).toContainText(`${village.dugWell!.forwardBaselineM!.toFixed(2)} m with the mandal figure alone`);
    await expect(evidence).toContainText("the mandal estimate’s own error comes on top");
    await expect(evidence).not.toContainText("under the mandal model");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (process.env.ACCURACY_SCREENSHOTS) await evidence.screenshot({ path: `test-results/village-evidence-${width}.png` });
  });
}

test("the rain layers say what they show and what they cannot", async ({ page }) => {
  await page.goto("/map/");
  await page.getByRole("button", { name: "Does rain still drive it?", exact: true }).click();
  const rain = page.getByTestId("rain-layer-legend");
  await expect(rain).toContainText("Rain explains much of the swing");
  await expect(rain).toContainText("A pattern, not proof of what moves the rest");
  await page.getByRole("button", { name: "Rain reaching the aquifer", exact: true }).click();
  const storage = page.getByTestId("recharge-layer-legend");
  await expect(storage).toContainText("net of pumping");
  await expect(storage).toContainText("set aside");
});

test("the brief reports the forward well test and does not promise a three-reading village figure", async ({ page }) => {
  await page.goto("/brief/");
  const sheet = page.getByTestId("brief-sheet").nth(8);
  await expect(sheet).toContainText("error on a later reading after three readings at a dug well");
  await expect(sheet).toContainText("on the mandal figure alone");
  await expect(sheet).toContainText("A well speaks for its spot");
  await expect(sheet).not.toContainText("A village needs three readings");
});

test("district field priorities count overlapping flags once and show the band as plus or minus half", async ({ page }) => {
  await page.goto("/districts/");
  const field = page.locator("#field-queue");
  const unique = queue.queue.filter(row => row.disagrees || row.belowSeaLevel).length;
  await expect(field.locator("span").filter({ hasText: /^of the top/ }).locator("..").locator("b")).toHaveText(String(unique));
  await expect(field).toContainText(`±${(queue.queue[0].intervalWidthM / 2).toFixed(1)} m`);
  await expect(page.locator("#seawater-watch")).toContainText("ranks places to check rather than proving intrusion");
});

test("the monsoon page keeps the share kept honest and the El Niño history loose", async ({ page }) => {
  await page.goto("/monsoon/");
  const rising = monsoon.mandals.filter(row => row.bankedSharePct !== null && (row.riseM ?? 0) > 0).length;
  await expect(page.locator("#water-banked")).toContainText(`${rising}mandals where the table rose at all, of ${monsoon.banked.mandals}`);
  await expect(page.locator("#water-banked")).toContainText("estimated to still be in the ground");
  await expect(page.locator("#water-banked")).toContainText("This cannot tell which");
  const enso = page.locator("#enso-outlook");
  await expect(enso).toContainText("a looser test than NOAA’s official episode count");
  await expect(enso).toContainText("Neither enters any model");
});

test("mandal seasonal recovery names pumping as well as rain", async ({ page }) => {
  await page.goto("/mandals/ap-temp-mandal-kurnool-orvakal-506/");
  await expect(page.locator(".monsoonCycle")).toContainText("or pumping that took the rise back out");
  await expect(page.getByRole("region", { name: /State network/ })).toContainText("one dated reading");
});

test("the methodology carries the forecast track record and does not judge it on a handful", async ({ page }) => {
  await page.goto("/methodology/");
  const ledger = page.getByTestId("forecast-ledger");
  await expect(ledger).toContainText("Forecasts on record");
  await expect(ledger).toContainText("Next to be scored");
  await expect(ledger).toContainText("SHA-256");
});

test("the footer and methodology state ownership without claiming the source data", async ({ page }) => {
  await page.goto("/methodology/");
  await expect(page.locator(".appCreatorFooter")).toContainText("© 2026");
  const note = page.getByTestId("method-ownership");
  await expect(note).toContainText("© 2026 Pruthvi Yannam, all rights reserved");
  await expect(note).toContainText("Source data belongs to its providers");
});
