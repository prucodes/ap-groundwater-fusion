import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const html = readFileSync("public/water-crystal-3d.html", "utf8");
const data = JSON.parse(html.match(/^const GW = (.*);$/m)![1]) as { years: string[]; mandals: { id: string; lvl: number[]; gap: number[]; n: string }[] };

for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 900 }]) {
  test(`Crystal preserves its scene and truthful analytics at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", error => errors.push(String(error)));
    await page.goto("/crystal");
    const frame = page.frameLocator(".crystalFrame");
    await expect(frame.locator("#kCov")).toContainText("605");
    await expect(frame.locator("#fallback")).not.toBeVisible();
    const year = data.years.length - 1;
    const observed = data.mandals.filter(m => !m.gap.includes(year));
    const mean = observed.reduce((n, m) => n + m.lvl[year], 0) / observed.length;
    await expect(frame.locator("#kAvg")).toHaveText(`${mean.toFixed(1)} m`);
    await expect(frame.locator("#kCov")).toHaveText(`${observed.length} / ${data.mandals.length}`);
    const first = data.mandals.findIndex(m => m.gap.includes(0) && !m.gap.includes(year));
    await frame.getByLabel("Inspect a mandal").selectOption(String(first));
    await expect(frame.locator("#mcName")).toHaveText(data.mandals[first].n);
    await expect(frame.locator("#mcEvidence")).toHaveAttribute("href", `./mandals/${data.mandals[first].id}/`);
    await expect(frame.locator("#wellProfile svg")).toBeVisible();
    await frame.getByRole("button", { name: "Close mandal details" }).click();
    await frame.getByLabel("Depth relief / schematic").check();
    await expect(frame.locator("#lgNote")).toContainText("Taller = shallower");
    await expect(frame.getByLabel("Relief vertical scale")).toBeVisible();
    await frame.getByRole("button", { name: "Reset view", exact: true }).click();
    await page.waitForTimeout(1000);
    const inner = page.frames().find(f => f.url().includes("water-crystal-3d"))!;
    const pixels = await inner.evaluate(() => {
      // Render/read synchronously: the browser discards the default framebuffer after presentation.
      const run = new Function("renderer.setRenderTarget(null); renderer.render(scene,camera); const gl=renderer.getContext(); const pixels=new Uint8Array(64*64*4); gl.readPixels(Math.floor(canvas.width/2)-32,Math.floor(canvas.height/2)-32,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels); return {colors:new Set(Array.from({length:4096},(_,i)=>pixels[i*4]+','+pixels[i*4+1]+','+pixels[i*4+2])).size,heights:[Math.min(...curH),Math.max(...curH)]};");
      return run();
    });
    expect(pixels.colors).toBeGreaterThan(10);
    expect(pixels.heights[1] - pixels.heights[0]).toBeGreaterThan(.2);
    await frame.getByLabel("Inspect a mandal").selectOption(String(first));
    await expect(frame.locator("#probeTag")).toContainText(`${data.mandals[first].lvl[year].toFixed(1)} m`);
    if(viewport.width > 760){
      await expect(frame.locator("#probeTag")).toBeVisible();
      const label = (await frame.locator("#probeTag").boundingBox())!;
      const rail = (await frame.locator("#rail").boundingBox())!;
      expect(label.x + label.width).toBeLessThan(rail.x);
    }
    await frame.getByLabel("Relief vertical scale").fill("1.8");
    await expect(frame.locator("#reliefScaleValue")).toHaveText("1.8×");
    await page.waitForTimeout(400);
    const amplified = await inner.evaluate(() => new Function("return Math.max(...curH)-Math.min(...curH);")());
    expect(amplified).toBeGreaterThan((pixels.heights[1]-pixels.heights[0])*1.3);
    await expect(frame.locator("#kAvg")).toHaveText(`${mean.toFixed(1)} m`);
    await frame.getByLabel("Relief vertical scale").fill("1.2");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/crystal-depth-probe-${viewport.width}.png` });
    await frame.getByRole("button", { name: "Close mandal details" }).click();
    await expect(frame.locator("#probeTag")).not.toBeVisible();
    const framing = await inner.evaluate(() => new Function("const p=new THREE.Vector3();let minX=1,maxX=-1;for(let i=0;i<positions.length;i+=3){p.set(positions[i],positions[i+1],positions[i+2]).project(camera);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);}return {minX,maxX};")());
    expect(framing.minX).toBeGreaterThan(-1);
    expect(framing.maxX).toBeLessThan(1);
    await page.screenshot({ path: `/tmp/crystal-polished-${viewport.width}.png` });
    await frame.getByRole("button", { name: "District", exact: true }).click();
    await expect(frame.locator("#lgNote")).toContainText("equal-weight recorded means");
    await expect(frame.locator("#dLabels strong").first()).toContainText("recorded");
    await page.waitForTimeout(750);
    const districtValues = await inner.evaluate(() => new Function("const m=M[0],d=DISTS[m.d],rows=M.filter(x=>x.d===m.d&&!isGap(x,year));return {actual:d.lvlMean[year],expected:rows.reduce((s,x)=>s+x.lvl[year],0)/rows.length,heights:M.map((x,i)=>x.d===m.d?curH[i]:null).filter(x=>x!==null)};")());
    expect(districtValues.actual).toBeCloseTo(districtValues.expected, 8);
    expect(Math.max(...districtValues.heights)-Math.min(...districtValues.heights)).toBeLessThan(.001);
    await page.screenshot({ path: `/tmp/crystal-districts-${viewport.width}.png` });
    await frame.getByRole("button", { name: "Mandal", exact: true }).click();
    await frame.getByLabel("Year", { exact: true }).focus();
    await frame.getByLabel("Year", { exact: true }).press("Home");
    await frame.getByLabel("Inspect a mandal").selectOption(String(first));
    await expect(frame.locator("#mcBadge")).toContainText("INTERPOLATED");
    await expect(frame.locator("#gaugeLabel")).toContainText("rank withheld");
    await frame.getByRole("button", { name: "Close mandal details" }).click();
    await frame.getByRole("button", { name: "Extraction stress", exact: true }).click();
    await expect(frame.getByLabel("Year", { exact: true })).toBeDisabled();
    await expect(frame.locator("#yearBig")).toHaveText("2024");
    await expect(frame.getByLabel("Depth relief / schematic")).toBeDisabled();
    await expect(frame.getByLabel("Relief vertical scale")).not.toBeVisible();
    await frame.getByRole("button", { name: "Water depth", exact: true }).click();
    await expect(frame.getByLabel("Year", { exact: true })).toBeEnabled();
    await frame.getByLabel("Depth relief / schematic").uncheck();
    await expect(frame.getByLabel("Relief vertical scale")).not.toBeVisible();
    await page.waitForTimeout(800);
    const flat = await inner.evaluate(() => new Function("return Math.max(...curH)-Math.min(...curH);")());
    expect(flat).toBeLessThan(.001);
    expect(errors).toEqual([]);
  });
}

type Projection = { a: number; t: number; y: number; r: number; k: "x" | "d" | "w"; p: number | null; s?: string } | null;
const withOutlook = JSON.parse(html.match(/^const GW = (.*);$/m)![1]) as {
  years: string[]; outlook: { targetMay: string; statewide: { mandals: number; beyond: number; dry: number } };
  mandals: { id: string; lvl: number[]; gap: number[]; n: string; o: Projection }[];
};
const nextMay = withOutlook.outlook.targetMay.slice(0, 4);
const shown = withOutlook.mandals.filter(m => m.o);
const pastTypical = shown.filter(m => m.o!.k === "x");
const pastDry = shown.filter(m => m.o!.k !== "w");

for (const viewport of [{ width: 1440, height: 1000 }, { width: 375, height: 900 }]) {
  test(`Crystal's May outlook sinks each mandal against its own record at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", error => errors.push(String(error)));
    await page.goto("/crystal");
    const frame = page.frameLocator(".crystalFrame");
    await expect(frame.locator("#kCov")).toContainText("605");
    const inner = page.frames().find(f => f.url().includes("water-crystal-3d"))!;
    const scene = () => inner.evaluate(() => new Function("return {proj:+curP.toFixed(2),lit:Array.from(curR).filter(r=>r>0.99).length}")()) as Promise<{ proj: number; lit: number }>;

    await frame.getByRole("button", { name: `May ${nextMay} outlook`, exact: true }).click();
    // Last May as measured, then the water settles on next May's projection and the broken records light.
    await expect(frame.getByLabel("Year", { exact: true })).toHaveValue(String(withOutlook.years.length), { timeout: 8000 });
    await expect.poll(scene, { timeout: 8000 }).toEqual({ proj: 1, lit: pastTypical.length });
    await expect(frame.locator("#oPast")).toHaveText(`${pastTypical.length} / ${shown.length}`);
    await expect(frame.locator("#oPastD")).toHaveText(`${withOutlook.outlook.statewide.beyond} of ${withOutlook.outlook.statewide.mandals} statewide`);
    await expect(frame.locator("#lgNote")).toContainText(viewport.width > 760 ? "not a forecast of rain" : "not a rain forecast");
    await expect(frame.getByRole("button", { name: "District", exact: true })).toBeHidden();
    // Each lit mandal's water sits below its own record rim.
    const below = await inner.evaluate(() => new Function("return M.every((m,f)=>curR[f]<0.99||curH[f]<hOut(m.o.r))")());
    expect(below).toBe(true);
    const framing = await inner.evaluate(() => new Function("const p=new THREE.Vector3();let minX=1,maxX=-1;for(let i=0;i<positions.length;i+=3){p.set(positions[i],positions[i+1],positions[i+2]).project(camera);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);}return {minX,maxX};")());
    expect(framing.minX).toBeGreaterThan(-1);
    expect(framing.maxX).toBeLessThan(1);
    await page.screenshot({ path: `/tmp/crystal-outlook-${viewport.width}.png` });

    await frame.getByRole("button", { name: "Dry winter", exact: true }).click();
    await expect(frame.locator("#oPast")).toHaveText(`${pastDry.length} / ${shown.length}`);
    await expect.poll(scene, { timeout: 8000 }).toEqual({ proj: 1, lit: pastDry.length });

    const index = withOutlook.mandals.findIndex(m => m.o && m.o.k === "x" && !m.o.s);
    const o = withOutlook.mandals[index].o!;
    await frame.getByLabel("Inspect a mandal").selectOption(String(index));
    await expect(frame.locator("#mcName")).toHaveText(withOutlook.mandals[index].n);
    await expect(frame.locator("#ocTier")).toContainText("Beyond its record");
    await expect(frame.locator("#ocV")).toHaveText(o.y.toFixed(1));
    await expect(frame.locator("#ocDelta")).toContainText(`${(o.y - o.r).toFixed(1)} m past its deepest May`);
    await expect(frame.locator("#ocSummer")).toHaveAttribute("href", "./summer/");
    await expect(frame.locator("#outlookProfile svg")).toBeVisible();
    await expect(frame.locator("#wellProfile")).toBeHidden();
    await page.screenshot({ path: `/tmp/crystal-outlook-mandal-${viewport.width}.png` });
    await frame.getByRole("button", { name: "Close mandal details" }).click();

    // Back to the measured view: no projection left on screen.
    await frame.getByRole("button", { name: "Water depth", exact: true }).click();
    await expect(frame.getByLabel("Year", { exact: true })).toHaveValue(String(withOutlook.years.length - 1));
    await expect.poll(scene, { timeout: 8000 }).toEqual({ proj: 0, lit: 0 });
    if (viewport.width > 760) await expect(frame.locator("#kCov")).toBeVisible();
    else await expect(frame.locator("#phoneStat")).toContainText("mean depth");
    await expect(frame.locator("#oPast")).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test("The Summer Outlook opens the 3D view straight into its outlook", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/summer/");
  const link = page.getByTestId("summer-3d-link");
  await expect(link).toHaveAttribute("href", /\/crystal\/\?mode=outlook$/);
  await link.click();
  const frame = page.frameLocator(".crystalFrame");
  await expect(frame.getByRole("button", { name: `May ${nextMay} outlook`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(frame.locator("#oPast")).toHaveText(`${pastTypical.length} / ${shown.length}`, { timeout: 10000 });
});

test("On a phone the scene comes first and the state fills the space the panels leave", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(String(error)));
  await page.goto("/crystal");
  const frame = page.frameLocator(".crystalFrame");
  await expect(frame.locator("#phoneStat")).toContainText("mean depth");
  // One line in place of the four stat cards; pinch replaces the zoom buttons; Reset stays.
  await expect(frame.locator("#kpis")).toBeHidden();
  await expect(frame.getByRole("button", { name: "Zoom in" })).toBeHidden();
  await expect(frame.getByRole("button", { name: "Reset view", exact: true })).toBeVisible();
  // The notes open from the key.
  await expect(frame.locator("#lgNote")).toBeHidden();
  await frame.getByRole("button", { name: "About this key" }).click();
  await expect(frame.locator("#lgNote")).toBeVisible();
  await frame.getByRole("button", { name: "About this key" }).click();
  await page.waitForTimeout(3200);
  const inner = page.frames().find(f => f.url().includes("water-crystal-3d"))!;
  const fill = () => inner.evaluate(() => new Function(`
    const p=new THREE.Vector3();let minX=1,maxX=-1,minY=1,maxY=-1;
    for(let i=0;i<positions.length;i+=3){p.set(positions[i],positions[i+1],positions[i+2]).project(camera);
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
    const h=innerHeight, top=(1-maxY)/2*h, bottom=(1-minY)/2*h;
    return {minX,maxX,top,bottom,band:phoneBand};`)()) as Promise<{ minX: number; maxX: number; top: number; bottom: number; band: { top: number; bottom: number } }>;
  const shape = await fill();
  expect(shape.minX).toBeGreaterThan(-1);
  expect(shape.maxX).toBeLessThan(1);
  expect(shape.top).toBeGreaterThanOrEqual(shape.band.top - 2);
  expect(shape.bottom).toBeLessThanOrEqual(shape.band.bottom + 2);
  expect(shape.bottom - shape.top).toBeGreaterThan(0.75 * (shape.band.bottom - shape.band.top));
  // A tapped mandal rises as a sheet, and the state refits above it.
  await frame.getByLabel("Inspect a mandal").selectOption("0");
  const sheet = (await frame.locator("#mCard").boundingBox())!;
  const frameBox = (await page.locator(".crystalFrame").boundingBox())!;
  // Boxes are in page coordinates; the scene's are the frame's own.
  expect(Math.round(sheet.y + sheet.height)).toBe(Math.round(frameBox.y + frameBox.height));
  await expect.poll(async () => (await fill()).bottom, { timeout: 5000 }).toBeLessThanOrEqual(sheet.y - frameBox.y);
  await frame.getByRole("button", { name: "Close mandal details" }).click();
  expect(errors).toEqual([]);
});
