import { expect, test } from "@playwright/test";
import watch from "../data/monsoon_watch.json";

// Orvakal's figures come from the published Monsoon Watch, so these checks follow
// each Monday's data instead of the month they were written in.
const ORVAKAL = (watch as unknown as { mandals: Array<{ mandal: string; latestDepthM: number; status: string }> }).mandals.find(m => m.mandal === "Orvakal")!;
const ORVAKAL_DEPTH = ORVAKAL.latestDepthM.toFixed(2);

for (const width of [1440, 390]) {
  test(`agriculture lab, evidence and exports at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/agriculture/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Agriculture &\s*Water Intelligence/);
    await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
    await expect(page.getByText("Prototype planning workspace.")).toBeVisible();
    for (const image of await page.locator("header img").all()) {
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    }
    const lab = page.getByRole("region", { name: "A crop's needs change with its stage." });
    await lab.scrollIntoViewIfNeeded();
    await expect(page.getByTestId("crop-field")).toHaveAttribute("data-ready", "true");
    await expect(page.getByTestId("budget-gap")).toContainText("11.6");
    await page.getByRole("button", { name: "Initial Kc 0.30", exact: true }).click();
    await expect(page.getByTestId("budget-gap")).toContainText("0.0");
    await page.getByRole("button", { name: "Mid-season Kc 1.20", exact: true }).click();
    await page.getByRole("slider", { name: "Effective rain", exact: true }).fill("30");
    await expect(page.getByTestId("budget-gap")).toContainText("0.0");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("combobox", { name: "Reference crop" }).selectOption("groundnut");
    await expect(page.getByTestId("budget-gap")).toContainText("10.2");
    await page.getByRole("button", { name: "Pause water animation" }).click();
    await expect(page.getByRole("button", { name: "Play water animation" })).toBeVisible();
    await page.getByRole("button", { name: "Rain", exact: true }).click();
    await expect(page.getByText(/Effective rain is the portion available/)).toBeVisible();
    await page.getByRole("button", { name: "Play water animation" }).click();
    await lab.screenshot({ path: testInfo.outputPath(`lab-detail-${width}.png`), animations: "disabled" });
    await page.screenshot({ path: testInfo.outputPath(`lab-${width}.png`), fullPage: true, animations: "disabled" });
    const watch = page.getByRole("region", { name: "Where does the water story need a closer look?" });
    await watch.scrollIntoViewIfNeeded();
    const context = page.getByRole("group", { name: "Rainfall, soil moisture and reservoir context" });
    await expect(context.getByTestId("context-rainfall")).toContainText(/Gauge rainfall\s*Measured/);
    await expect(context.getByTestId("context-rainfall")).toContainText("against normal");
    await expect(context.getByTestId("context-soil")).toContainText(/Modelled/);
    await expect(context.getByTestId("context-soil")).toContainText("not measured in a field");
    await expect(context.getByTestId("context-reservoirs")).toContainText("of capacity");
    await context.getByText("Largest canal releases now").click();
    await expect(context.getByTestId("context-reservoirs")).toContainText("command-area map, which is not public");
    await context.screenshot({ path: testInfo.outputPath(`water-context-${width}.png`) });
    await page.getByRole("combobox", { name: "District filter" }).selectOption("KURNOOL");
    await page.getByRole("searchbox", { name: "Search mandals or districts" }).fill("orvakal");
    const rail = page.getByRole("complementary", { name: "Selected mandal evidence" });
    await expect(rail.getByRole("heading", { name: "Orvakal", exact: true })).toBeVisible();
    await expect(page.getByText(ORVAKAL_DEPTH, { exact: false }).first()).toBeVisible();
    const season = rail.getByRole("definition").filter({ hasText: /vs normal/ });
    await expect(season).toHaveCount(1);
    await expect(rail).toContainText(/Soil moisture 30 cm/);
    await expect(rail).toContainText(/of 1\d years/);
    await expect(rail.locator("dl").last()).toContainText("Canal delivery to this mandalNot connected");
    await page.getByRole("button", { name: "AP map", exact: true }).click();
    await expect(page.getByRole("group", { name: "AP groundwater water-watch map" }).locator("path")).toHaveCount(670);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export review" }).click();
    const exported = await download;
    expect(exported.suggestedFilename()).toContain("agriculture-water-review-");
    await page.getByRole("searchbox", { name: "Search mandals or districts" }).fill("no-such-mandal-xyz");
    await expect(page.getByRole("heading", { name: "No matching evidence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export review" })).toBeDisabled();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByRole("combobox", { name: "Water signal filter" }).selectOption("unavailable");
    await expect(page.getByRole("complementary", { name: "Selected mandal evidence" })).toContainText(/Reconciliation required|No comparable|Verification required/);
    await page.getByRole("combobox", { name: "Water signal filter" }).selectOption("all");
    await page.getByRole("button", { name: "District fieldbook", exact: true }).click();
    await page.getByRole("button", { name: "Next review page" }).click();
    await expect(page.getByText("11-20 of 670", { exact: true })).toBeVisible();
    const readiness = page.getByRole("region", { name: "The missing links matter." });
    await expect(readiness).toContainText("Partly connected");
    const sources = readiness.getByRole("list", { name: "Supply and weather sources" }).getByRole("listitem");
    await expect(sources).toHaveCount(5);
    await expect(sources.filter({ hasText: "IMD forecasts and warnings" })).toHaveAttribute("data-state", "pending");
    await expect(sources.filter({ hasText: "Canal delivery to mandals" })).toHaveAttribute("data-state", "off");
    await expect(sources.filter({ hasText: "Gauge rainfall" })).toHaveAttribute("data-state", "on");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`agriculture-${width}.png`), fullPage: true });
  });
}

test("three-signal agreement narrows the map to corroborated mandals", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/agriculture/");
  // The page fades in; under a full parallel run that can outlast the default wait.
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1", { timeout: 15000 });
  const tile = page.getByTestId("agreement-tile");
  const count = Number((await tile.locator("strong").innerText()).split("/")[0].trim());
  expect(count).toBeGreaterThan(0);
  await tile.getByRole("button", { name: "Show them on the map" }).click();
  await expect(page.getByRole("combobox", { name: "Water signal filter" })).toHaveValue("agree3");
  await expect(page.getByText(`${count} boundary units`, { exact: true })).toBeVisible();
  const map = page.getByRole("group", { name: "AP groundwater water-watch map" });
  await expect(map.locator('path[aria-disabled="false"]')).toHaveCount(count);
  const rail = page.getByRole("complementary", { name: "Selected mandal evidence" });
  await expect(rail.getByRole("img", { name: /^3 of 3 usable signals point to stress/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Water signal filter" }).selectOption("agree2");
  expect(Number((await page.getByText(/^\d+ boundary units$/).innerText()).split(" ")[0])).toBeGreaterThan(count);
  await page.screenshot({ path: testInfo.outputPath("agreement-map.png") });
});

test("agriculture respects reduced motion and stays readable in dark mode", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/agriculture/?theme=dark");
  await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".pageWrap")).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByTestId("crop-field")).toHaveAttribute("data-moving", "false");
  await page.getByRole("region", { name: "A crop's needs change with its stage." }).scrollIntoViewIfNeeded();
  await expect(page.getByTestId("crop-field")).toHaveAttribute("data-ready", "true");
  await page.screenshot({ path: testInfo.outputPath("agriculture-dark.png"), animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

for (const width of [375, 768, 1920]) {
  test(`agriculture framing at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1080 });
    await page.goto("/agriculture/");
    await expect(page.locator("main > div")).toHaveCSS("opacity", "1");
    // Any element reaching past the screen that no scrolling box contains, named, so a failure says what.
    const wide = await page.evaluate(() => {
      const clipped = (el: Element) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
      return Array.from(document.querySelectorAll("body *")).filter(el => el.getBoundingClientRect().right > innerWidth + 1 && !clipped(el))
        .slice(0, 6).map(el => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(" ")[0]} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().right)}px`);
    });
    // Within 1 px, as the phone and desktop layout tests allow: Linux text metrics round a sub-pixel over.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `wider than the screen: ${wide.join("; ")}`).toBeLessThanOrEqual(1);
    const scene = page.getByTestId("crop-field");
    const sceneWidth = await scene.evaluate(element => ({ scene: element.clientWidth, column: element.parentElement!.clientWidth }));
    expect(Math.abs(sceneWidth.scene - sceneWidth.column)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`first-viewport-${width}.png`), animations: "disabled" });
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-ready", "true");
    await page.getByRole("region", { name: "A crop's needs change with its stage." }).screenshot({ path: testInfo.outputPath(`lab-framing-${width}.png`), animations: "disabled" });
    await page.getByRole("button", { name: "AP map", exact: true }).click();
    const map = page.getByRole("group", { name: "AP groundwater water-watch map" });
    await map.screenshot({ path: testInfo.outputPath(`map-${width}.png`), animations: "disabled" });
    const clipped = await page.locator("main button, main select").evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 2 && getComputedStyle(element).overflowX === "visible").map(element => element.textContent));
    expect(clipped).toEqual([]);
  });
}
