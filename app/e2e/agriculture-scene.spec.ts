import { expect, test } from "@playwright/test";

/* The crop-water lab draws a measured cross-section, not artwork: every mark
   stands for an input or a published reference, so the tests read the marks. */

for (const width of [1440, 390]) {
  test(`the field section draws the scenario to scale at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/agriculture/");
    const scene = page.getByTestId("crop-field");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-ready", "true");
    const section = page.getByTestId("field-section");
    await expect(scene.locator("canvas, img")).toHaveCount(0);

    // Roots to the FAO-56 depths for the crop and stage.
    await expect(section).toContainText("1.0–1.7 m");
    await page.getByRole("button", { name: "Initial Kc 0.30", exact: true }).click();
    await expect(section).toContainText("0.15–0.20 m");
    await expect(section).toContainText("at sowing");
    await page.getByRole("button", { name: "Mid-season Kc 1.20", exact: true }).click();

    // Crop water use and the part rain and reserve leave uncovered.
    await expect(section).toContainText("33.6");
    await expect(section).toContainText("11.6 mm not covered");

    // Rain: a streak for about every millimetre that counts; none without rain.
    const drops = section.locator('line[class*="drop"]');
    await page.getByRole("slider", { name: "Effective rain", exact: true }).fill("0");
    await expect(drops).toHaveCount(0);
    await page.getByRole("slider", { name: "Effective rain", exact: true }).fill("30");
    await expect(drops).toHaveCount(27);

    // The reserve deepens the root zone's wash.
    const wash = section.locator('rect[class*="moisture"]');
    const opacity = async () => Number(await wash.evaluate(element => getComputedStyle(element).opacity));
    await page.getByRole("slider", { name: "Usable soil reserve", exact: true }).fill("0");
    await expect.poll(opacity).toBeLessThan(0.1);
    await page.getByRole("slider", { name: "Usable soil reserve", exact: true }).fill("60");
    await expect.poll(opacity).toBeGreaterThan(0.35);

    // The water table, from the State's wells, far below any root zone.
    await expect(section).toContainText("Water table ≈");
    await expect(section).toContainText(width > 600 ? "crops reach it only through wells" : "State wells, average");

    // Pausing stops the flows; the layer names appear on request.
    await page.getByRole("button", { name: "Pause water animation" }).click();
    await expect(scene).toHaveAttribute("data-moving", "false");
    await expect(drops.first()).toHaveCSS("animation-play-state", "paused");
    await page.getByRole("button", { name: "Inspect crop and soil detail" }).click();
    await expect(section.getByText("Subsoil", { exact: true })).toHaveCSS("opacity", "0.95");
    await page.getByRole("button", { name: "Inspect crop ET" }).click();
    await expect(scene).toHaveAttribute("data-focus", "crop");
    await page.getByRole("button", { name: "Reset field view" }).click();
    await expect(scene).toHaveAttribute("data-focus", "roots");

    // Groundnut: shallower roots, and the stage buttons draw the crop.
    await page.getByRole("combobox", { name: "Reference crop" }).selectOption("groundnut");
    await expect(scene).toHaveAttribute("data-crop", "groundnut");
    await expect(section).toContainText("0.50–1.0 m");
    await expect(page.getByRole("group", { name: "Crop growth stage" }).locator("svg")).toHaveCount(3);

    await scene.screenshot({ path: testInfo.outputPath(`field-section-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}
