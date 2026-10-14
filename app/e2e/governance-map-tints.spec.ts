import { expect, test, type Locator, type Page } from "@playwright/test";

async function pointAt(page: Page, path: Locator) {
  await path.scrollIntoViewIfNeeded();
  const point = await path.evaluate((element: SVGPathElement) => {
    const box = element.getBBox(), matrix = element.getScreenCTM()!;
    for (let y = .15; y < 1; y += .1) for (let x = .15; x < 1; x += .1) {
      const point = new DOMPoint(box.x + box.width * x, box.y + box.height * y);
      if (element.isPointInFill(point)) {
        const screen = point.matrixTransform(matrix);
        return { x: screen.x, y: screen.y };
      }
    }
    throw new Error("No interior point in this map shape");
  });
  await page.mouse.move(point.x, point.y);
}

async function matches(path: Locator, card: Locator) {
  await expect(card).toBeVisible();
  await expect.poll(async () => {
    const fill = await path.evaluate(el => getComputedStyle(el).fill);
    const edge = await card.evaluate(el => getComputedStyle(el).borderTopColor);
    return fill === edge ? "matched" : { fill, edge };
  }).toBe("matched");
  await expect(card).toHaveCSS("border-top-width", "3px");
  expect(await card.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  const accent = card.locator('.mapStatusValue, .tipActive b, .estHoverRow strong, em').first();
  if (await accent.count()) {
    expect(await accent.evaluate(el => getComputedStyle(el).color)).not.toBe(
      await card.evaluate(el => getComputedStyle(el).color));
  }
}

for (const theme of ["light", "dark"]) {
  test(`main mandal hover follows every selected layer in ${theme}`, async ({ page }, testInfo) => {
    await page.goto(`/map/?theme=${theme}`);
    const path = page.getByRole("button", { name: /^Orvakal, Kurnool:/ });
    const card = page.locator(".estHoverCard");
    await path.focus();
    for (const layer of ["Fusion status", "Gauge rain vs normal", "Soil moisture", "Crop vegetation", "Groundwater category", "Rainfall (CHIRPS)", "Water Balance"]) {
      // Dispatch without moving the pointer: an already-open card must also update.
      await page.getByRole("button", { name: layer, exact: true }).dispatchEvent("click");
      await matches(path, card);
    }
    await page.screenshot({ path: testInfo.outputPath(`mandal-hover-${theme}.png`) });
  });

  test(`weekly, summer and rabi cards inherit their map scale in ${theme}`, async ({ page }) => {
    for (const [route, id] of [["changes", "week-move-map"], ["summer", "summer-map"], ["rabi", "rabi-map"], ["rabi", "rabi-tank-map"]]) {
      await page.goto(`/${route}/?theme=${theme}`);
      const map = page.getByTestId(id);
      await expect(map).toHaveAttribute("data-ready", "true");
      const path = map.locator('path[data-key]').first();
      await pointAt(page, path);
      await matches(path, map.getByRole("tooltip"));
      if (route === "changes") for (const view of ["before", "after", "moved"]) {
        await page.getByTestId(`week-view-${view}`).dispatchEvent("click");
        await matches(path, map.getByRole("tooltip"));
      }
    }
  });

  test(`drought indicators and soil convention recolour the open card in ${theme}`, async ({ page }) => {
    await page.goto(`/drought/?theme=${theme}`);
    const path = page.getByTestId("drought-map").getByRole("button", { name: /^Orvakal, Kurnool:/ });
    await pointAt(page, path);
    const card = page.locator('[aria-live="polite"]').filter({ has: page.locator("strong", { hasText: "Orvakal" }) }).first();
    for (const layer of ["Manual outcome", "Rainfall vs normal", "Longest dry spell", "SPI (satellite)", "Vegetation (VCI)", "Soil moisture (PASM)", "Groundwater (GWDI)"]) {
      await page.getByRole("button", { name: layer, exact: true }).dispatchEvent("click");
      await matches(path, card);
    }
    await page.getByRole("button", { name: "3 weeks (light soils)", exact: true }).dispatchEvent("click");
    await matches(path, card);
  });

  test(`monsoon and agriculture cards follow the hovered values in ${theme}`, async ({ page }, testInfo) => {
    await page.goto(`/monsoon/?theme=${theme}`);
    const path = page.locator(".rechargeCell:not(.noData)").first();
    await path.focus();
    const card = page.locator(".rechargeTip");
    await matches(path, card);
    await page.getByRole("button", { name: "Storage proxy", exact: true }).dispatchEvent("click");
    await matches(path, card);
    await page.goto(`/agriculture/?theme=${theme}`);
    await page.getByRole("button", { name: "AP map", exact: true }).click();
    const map = page.getByTestId("agriculture-map");
    const orvakal = map.getByRole("button", { name: /^Orvakal:/ });
    await orvakal.focus();
    await matches(orvakal, map.getByRole("tooltip"));
    const cropMap = page.getByTestId("field-week-map");
    const cropPath = cropMap.getByRole("button", { name: /^Orvakal:/ });
    await pointAt(page, cropPath);
    await matches(cropPath, cropMap.getByRole("tooltip"));
    for (const crop of ["Maize", "Cotton"]) {
      await page.getByRole("group", { name: "Crop", exact: true }).getByRole("button", { name: crop, exact: true }).dispatchEvent("click");
      await matches(cropPath, cropMap.getByRole("tooltip"));
    }
    await cropMap.screenshot({ path: testInfo.outputPath(`crop-hover-${theme}.png`) });
  });
}

test("Leaflet mandal and district cards follow active scales", async ({ page }) => {
  await page.goto("/");
  const path = page.locator('.leaflet-overlay-pane path.leaflet-interactive').first();
  await pointAt(page, path);
  const card = page.locator(".leaflet-tooltip.liveTip");
  await matches(path, card);
  for (const layer of ["Gauge rain", "Soil", "Rainfall", "Balance"]) {
    await page.getByRole("button", { name: layer, exact: true }).dispatchEvent("click");
    await matches(path, card);
  }
  await page.goto("/map/");
  await page.getByRole("button", { name: "District", exact: true }).click();
  const district = page.locator('.leaflet-overlay-pane path.leaflet-interactive').first();
  await pointAt(page, district);
  await matches(district, card);
  for (const layer of ["Rainfall", "Groundwater %ile", "Water Balance"]) {
    await page.getByRole("button", { name: layer, exact: true }).dispatchEvent("click");
    await matches(district, card);
  }
});

test("constituency and estimate readouts match their selected measure", async ({ page }) => {
  await page.goto("/constituencies/");
  const path = page.getByTestId("constituency-map").getByRole("button").first();
  await path.focus();
  const panel = page.getByTestId("constituency-panel");
  await matches(path, panel);
  for (const button of await page.getByRole("group", { name: "Map measure" }).getByRole("button").all()) {
    await button.dispatchEvent("click");
    await matches(path, panel);
  }
  await page.goto("/estimates/");
  const estimate = page.locator('.estMapSvg path[style*="pointer"]').first();
  await pointAt(page, estimate);
  await matches(estimate, page.locator(".estHoverCard"));
});

test("3D hover tint follows depth, latest month, extraction, district and outlook", async ({ page }, testInfo) => {
  test.setTimeout(process.env.CI ? 180000 : 90000);
  await page.goto("/crystal/");
  const frame = page.frameLocator(".crystalFrame");
  await expect(frame.locator("#kCov")).toContainText("/");
  const inner = page.frames().find(f => f.url().includes("water-crystal-3d"))!;
  const verify = async () => {
    const result = await inner.evaluate(() => new Function(`
      const f=M.findIndex(m=>m.cat&&m.c&&m.o);
      showTip(f,innerWidth/2,innerHeight/2);
      const expected="#"+new THREE.Color(toC[f*3],toC[f*3+1],toC[f*3+2]).getHexString();
      updateMandalCard(f);
      const stroke=getComputedStyle(document.querySelector('#mcSpark path')).stroke;
      const swatch=document.createElement('span');swatch.style.color='var(--map-status-graph)';mCard.append(swatch);
      const graph=getComputedStyle(swatch).color;swatch.remove();
      return {expected,actual:tip.style.getPropertyValue("--map-status-color"),
        selected:mCard.style.getPropertyValue("--map-status-color"),stroke,graph,mode,gran,onNow};`)());
    expect(result.actual).toBe(result.expected);
    expect(result.selected).toBe(result.expected);
    expect(result.stroke).toBe(result.graph);
    await expect(frame.locator("#tip")).toHaveCSS("border-top-width", "3px");
  };
  await verify();
  await frame.getByLabel("Year", { exact: true }).fill("0");
  await verify();
  await frame.getByRole("button", { name: "Extraction stress", exact: true }).click();
  await verify();
  await frame.getByRole("button", { name: "District", exact: true }).click();
  await verify();
  await frame.getByRole("button", { name: /May .* outlook/, exact: true }).click();
  await verify();
  await page.screenshot({ path: testInfo.outputPath("atlas-hover.png") });
});

test("Atlas real pointer hover colours its graph without changing direction labels", async ({ page }, testInfo) => {
  test.setTimeout(process.env.CI ? 180000 : 90000);
  await page.goto("/crystal/");
  const frame = page.frameLocator(".crystalFrame");
  await expect(frame.locator("#kCov")).toContainText("/");
  await frame.getByRole("button", { name: "Reset view", exact: true }).click();
  const inner = page.frames().find(f => f.url().includes("water-crystal-3d"))!;
  const point = await inner.evaluate(() => new Function(`
    const r=new THREE.Raycaster();
    for(let y=innerHeight*.55;y<innerHeight*.75;y+=12)for(let x=innerWidth*.4;x<innerWidth*.7;x+=12){
      if(document.elementFromPoint(x,y)!==canvas)continue;
      r.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),camera);
      const hit=r.intersectObject(crystals,false)[0];if(!hit)continue;
      const f=faceFeat[hit.faceIndex];if(!M[f].c)continue;
      return {x,y,f,color:'#'+new THREE.Color(toC[f*3],toC[f*3+1],toC[f*3+2]).getHexString()};
    } throw new Error('No visible mandal found');`)());
  const bounds = (await page.locator('.crystalFrame').boundingBox())!;
  await page.mouse.move(bounds.x + point.x, bounds.y + point.y);
  await expect(frame.locator('#tip')).toBeVisible();
  expect(await frame.locator('#tip').evaluate(el => (el as HTMLElement).style.getPropertyValue('--map-status-color'))).toBe(point.color);
  expect(await frame.locator('#tipSpark path').getAttribute('stroke')).toContain('--map-status-graph');
  await page.screenshot({ path: testInfo.outputPath('atlas-real-hover.png') });
  await frame.getByLabel('Inspect a mandal').selectOption(String(point.f));
  await expect(frame.locator('#mCard')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('atlas-selected.png') });
});

for (const width of [390, 1440]) {
  test(`Overview and mandal maps have compact summaries and accessible expansion at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/mandals/ap-temp-mandal-kakinada-pithapuram-147/"]) {
      await page.goto(route);
      const expand = page.getByRole("button", { name: "Expand map", exact: true });
      await expand.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Close expanded map" })).toBeFocused();
      const path = dialog.locator('.leaflet-overlay-pane path.leaflet-interactive').first();
      await pointAt(page, path);
      const card = dialog.locator('.liveTip');
      await matches(path, card);
      await expect(card).toContainText("Latest recorded depth");
      await expect(card).toContainText("Observation");
      await expect(card).toContainText("NASA GW percentile");
      const box = (await card.boundingBox())!;
      expect(box.height).toBeLessThan(270);
      expect(box.width).toBeLessThanOrEqual(260);
      const mapBox = (await dialog.locator('.liveMap').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(mapBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(mapBox.x + mapBox.width);
      expect(box.y).toBeGreaterThanOrEqual(mapBox.y);
      expect(box.y + box.height).toBeLessThanOrEqual(mapBox.y + mapBox.height);
      const overflow = await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1);
      expect(overflow).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`${route === '/' ? 'overview' : 'mandal'}-expanded-${width}.png`) });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(expand).toBeFocused();
      await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    }
  });
}
