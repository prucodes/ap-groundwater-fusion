import { expect, test, type Locator } from "@playwright/test";

// SVG bounding-box centres can fall outside an irregular mandal polygon.
async function interiorPoint(path: Locator) {
  return path.evaluate((element: SVGPathElement) => {
    const box = element.getBBox(), matrix = element.getScreenCTM()!;
    for (let y = .1; y < 1; y += .1) for (let x = .1; x < 1; x += .1) {
      const point = new DOMPoint(box.x + box.width * x, box.y + box.height * y);
      if (element.isPointInFill(point)) {
        const screen = point.matrixTransform(matrix);
        return { x: screen.x, y: screen.y };
      }
    }
    throw new Error("No interior point found for mandal");
  });
}

for (const width of [1440, 390]) {
  test(`mandal map hover, focus and missing evidence at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/agriculture/");
    await page.getByRole("button", { name: "AP map", exact: true }).click();
    const map = page.getByTestId("agriculture-map");
    await map.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const orvakal = map.getByRole("button", { name: /^Orvakal:/ });
    const point = await interiorPoint(orvakal);
    await page.mouse.move(point.x, point.y);
    const tooltip = map.getByRole("tooltip");
    await expect(tooltip).toContainText("Orvakal");
    await expect(tooltip).toContainText("Kurnool district");
    await expect(tooltip).toContainText("28.97");
    await expect(tooltip).toContainText("Aug 2026");
    await expect(tooltip).toContainText("Shortfall vs own normal");
    await expect(tooltip).toContainText("crop records not connected");
    await expect(tooltip).toHaveAttribute("data-signal", "severe");
    const frame = (await map.boundingBox())!, card = (await tooltip.boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(frame.x);
    expect(card.y).toBeGreaterThanOrEqual(frame.y);
    expect(card.x + card.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(card.y + card.height).toBeLessThanOrEqual(frame.y + frame.height);
    await page.screenshot({ path: testInfo.outputPath(`map-hover-${width}.png`) });
    await expect(tooltip).toContainText("Orvakal");
    const clickPoint = await interiorPoint(orvakal);
    await page.mouse.click(clickPoint.x, clickPoint.y);
    const rail = page.getByRole("complementary", { name: "Selected mandal evidence" });
    await expect(rail.getByRole("heading", { name: "Orvakal", exact: true })).toBeVisible();
    await orvakal.focus();
    await expect(orvakal).toHaveAttribute("aria-describedby", await tooltip.getAttribute("id") as string);
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    const next = map.locator("path:focus");
    const nextName = (await next.getAttribute("aria-label"))!.split(":")[0];
    await expect(tooltip).toContainText(nextName);
    await page.keyboard.press("Enter");
    await expect(rail.getByRole("heading", { name: nextName, exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Water signal filter" }).selectOption("unavailable");
    await expect(tooltip).toHaveCount(0);
    await map.scrollIntoViewIfNeeded();
    const unavailable = map.locator('path[aria-disabled="false"]').first();
    await unavailable.focus();
    await expect(tooltip).toContainText("Unresolved / missing");
    await expect(tooltip).toContainText(/Reconciliation required|No comparable|Verification required/);
    await expect(tooltip).not.toContainText("0.00");
    await map.screenshot({ path: testInfo.outputPath(`map-unavailable-${width}.png`) });
    await page.mouse.move(1, 1);
    await page.keyboard.press("Escape");
    const disabledPoint = await interiorPoint(orvakal);
    await page.mouse.move(disabledPoint.x, disabledPoint.y);
    await expect(tooltip).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("touching a mandal opens its evidence card", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL}/agriculture/`);
  await page.getByRole("button", { name: "AP map", exact: true }).click();
  const map = page.getByTestId("agriculture-map");
  await map.scrollIntoViewIfNeeded();
  const point = await interiorPoint(map.getByRole("button", { name: /^Orvakal:/ }));
  await page.touchscreen.tap(point.x, point.y);
  await expect(map.getByRole("tooltip")).toContainText("Orvakal");
  await expect(page.getByRole("complementary", { name: "Selected mandal evidence" })).toContainText("28.97");
  await context.close();
});
