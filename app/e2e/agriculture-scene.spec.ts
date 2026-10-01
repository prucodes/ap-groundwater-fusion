import { expect, test, type Locator } from "@playwright/test";

async function pixels(canvas: Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d")!;
    const data = context.getImageData(0, 0, element.width, element.height).data;
    let drawn = 0, green = 0, brown = 0, hash = 2166136261;
    for (let i = 0; i < data.length; i += 16) {
      const [r, g, b, a] = data.subarray(i, i + 4);
      if (a > 100) drawn++;
      if (a > 100 && g > r * 1.08 && g > b * 1.15) green++;
      if (a > 100 && r > g * 1.08 && g > b * 1.1) brown++;
      hash = Math.imul(hash ^ (r + (g << 8) + (b << 16)), 16777619);
    }
    return { drawn, green, brown, hash, total: data.length / 16 };
  });
}

async function flowPixels(canvas: Locator, store = false) {
  return canvas.evaluate((element: HTMLCanvasElement & { flowBaseline?: Uint8ClampedArray }, save) => {
    const data = element.getContext("2d")!.getImageData(0, 0, element.width, element.height).data;
    if (save) element.flowBaseline = data;
    const before = element.flowBaseline!;
    let rain = 0, roots = 0;
    for (let y = 0; y < element.height; y += 2) for (let x = 0; x < element.width; x += 2) {
      const i = (y * element.width + x) * 4;
      const difference = Math.abs(data[i] - before[i]) + Math.abs(data[i + 1] - before[i + 1]) + Math.abs(data[i + 2] - before[i + 2]);
      // Feathered, subpixel traces need a lower contrast floor than opaque tubes.
      // Still require >100 changed samples and test rain/root regions separately.
      if (difference < 35) continue;
      if (y > element.height * .14 && y < element.height * .48) rain++;
      if (y > element.height * .65 && y < element.height * .93) roots++;
    }
    return { rain, roots };
  }, store);
}

for (const width of [1440, 390]) {
  test(`rain and root flow remain visible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/agriculture/");
    const scene = page.getByTestId("crop-field"), canvas = scene.locator("canvas");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-ready", "true");
    await page.getByRole("button", { name: "Pause water animation" }).click();
    await page.getByRole("slider", { name: "Effective rain", exact: true }).fill("0");
    await page.getByRole("slider", { name: "Usable soil reserve", exact: true }).fill("0");
    await scene.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await flowPixels(canvas, true);
    await page.getByRole("slider", { name: "Usable soil reserve", exact: true }).fill("14");
    await expect.poll(async () => (await flowPixels(canvas)).roots).toBeGreaterThan(100);
    await scene.scrollIntoViewIfNeeded();
    await flowPixels(canvas, true);
    await page.getByRole("slider", { name: "Effective rain", exact: true }).fill("8");
    await expect.poll(async () => (await flowPixels(canvas)).rain).toBeGreaterThan(100);
    await scene.scrollIntoViewIfNeeded();
    await scene.screenshot({ path: testInfo.outputPath(`visible-water-${width}.png`) });
    const readout = await page.getByRole("button", { name: "Inspect soil reserve" }).boundingBox();
    const bounds = (await scene.boundingBox())!;
    expect(readout!.y).toBeGreaterThanOrEqual(bounds.y + bounds.height);
    await flowPixels(canvas, true);
    await page.getByRole("button", { name: "Play water animation" }).click();
    await scene.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await flowPixels(canvas)).rain).toBeGreaterThan(100);
    await expect.poll(async () => (await flowPixels(canvas)).roots).toBeGreaterThan(100);
    await page.getByRole("slider", { name: "Effective rain", exact: true }).fill("0");
    await page.getByRole("slider", { name: "Usable soil reserve", exact: true }).fill("0");
    await scene.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const dry = await pixels(canvas);
    await page.waitForTimeout(250);
    expect((await pixels(canvas)).hash).toBe(dry.hash);
  });

  test(`natural field renders, changes stage and crop, and pauses at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/agriculture/");
    const scene = page.getByTestId("crop-field");
    const canvas = scene.locator("canvas");
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-ready", "true", { timeout: 20000 });
    await page.getByRole("button", { name: "Pause water animation" }).click();
    await expect.poll(async () => (await pixels(canvas)).green).toBeGreaterThan(200);
    const grown = await pixels(canvas);
    expect(grown.drawn / grown.total).toBeGreaterThan(.1);
    expect(grown.brown).toBeGreaterThan(300);
    await scene.screenshot({ path: testInfo.outputPath(`maize-mid-${width}.png`) });
    const previews = page.getByRole("group", { name: "Crop growth stage" }).locator('[class*="stagePreview"]');
    await expect(previews).toHaveCount(3);
    for (const preview of await previews.all()) {
      await expect(preview).toHaveCSS("background-image", /agriculture-maize-stages.webp/);
      expect((await preview.boundingBox())!.height).toBeGreaterThan(40);
    }
    await expect(scene.getByText("Assumed available soil water", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Initial Kc 0.30", exact: true }).click();
    await scene.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await pixels(canvas)).hash).not.toBe(grown.hash);
    await scene.screenshot({ path: testInfo.outputPath(`maize-initial-${width}.png`) });
    await page.getByRole("button", { name: "End-season Kc 0.35", exact: true }).click();
    await scene.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await pixels(canvas)).hash).not.toBe(grown.hash);
    await scene.screenshot({ path: testInfo.outputPath(`maize-end-${width}.png`) });
    await page.getByRole("combobox", { name: "Reference crop" }).selectOption("groundnut");
    await page.getByRole("button", { name: "Mid-season Kc 1.15", exact: true }).click();
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveAttribute("data-crop", "groundnut");
    await expect.poll(async () => (await pixels(canvas)).green).toBeGreaterThan(150);
    const groundnut = await pixels(canvas);
    expect(groundnut.hash).not.toBe(grown.hash);
    await scene.screenshot({ path: testInfo.outputPath(`groundnut-mid-${width}.png`) });
    await page.waitForTimeout(200);
    const paused = await pixels(canvas);
    await page.waitForTimeout(300);
    expect((await pixels(canvas)).hash).toBe(paused.hash);
    await page.getByRole("button", { name: "Play water animation" }).click();
    await expect.poll(async () => (await pixels(canvas)).hash).not.toBe(paused.hash);
    await page.getByRole("button", { name: "Pause water animation" }).click();
    await scene.scrollIntoViewIfNeeded();
    const beforeLens = await pixels(canvas);
    await page.getByRole("button", { name: "Inspect crop and soil detail" }).click();
    await scene.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveAttribute("data-lens", "true");
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
    await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .55, { steps: 12 });
    await expect.poll(async () => (await pixels(canvas)).hash).not.toBe(beforeLens.hash);
    await canvas.focus();
    const beforeKey = await pixels(canvas);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await pixels(canvas)).hash).not.toBe(beforeKey.hash);
    await scene.screenshot({ path: testInfo.outputPath(`detail-lens-${width}.png`) });
    await page.getByRole("button", { name: "Reset field view" }).click();
    await page.getByRole("button", { name: "Inspect crop ET" }).click();
    await expect(scene).toHaveAttribute("data-focus", "crop");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("missing stage artwork falls back without disabling scenario controls", async ({ page }) => {
  await page.route("**/assets/agriculture-maize-stages.webp", route => route.abort());
  await page.goto("/agriculture/");
  const scene = page.getByTestId("crop-field");
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.getByRole("status")).toHaveText("Stage artwork unavailable. Scenario controls remain active.");
  await expect(scene.locator("img")).toBeVisible();
  await page.getByRole("button", { name: "Initial Kc 0.30", exact: true }).click();
  await expect(page.getByTestId("budget-gap")).toContainText("0.0");
});
