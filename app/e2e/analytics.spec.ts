import { expect, test, type Page } from "@playwright/test";

/**
 * Visit counting, tested against the built static export.
 *
 * These run on 127.0.0.1, where count.js declines to count and this app therefore never
 * fetches it. That is the point rather than a limitation: the whole of this project's own
 * logic — which path is counted, which parameters are dropped, and counting an interaction
 * once — runs before count.js is involved, so it can be checked without a request leaving
 * the machine. Where the test needs to see what would be sent, it installs its own recorder
 * in place of count.js's function, exactly as count.js would.
 *
 * Paths here have no /ap-groundwater-fusion prefix because the layout tests build with
 * PAGES_BASE_PATH empty. On Pages that prefix is present and is what keeps this project's
 * rows apart from the others on the same GoatCounter site.
 */

type Sent = { path: string; title?: string; event?: boolean };

/** Stand in for count.js, which never loads on a local host. */
async function recordSends(page: Page) {
  await page.evaluate(() => {
    const sent: Sent[] = [];
    (window as unknown as { sent: Sent[] }).sent = sent;
    window.goatcounter.count = (vars: Sent) => void sent.push(vars);
  });
  return () => page.evaluate(() => (window as unknown as { sent: Sent[] }).sent);
}

test("counts the page, and not which place the reader picked", async ({ page }) => {
  await page.goto("/monsoon/?mandal=ATMAKUR&quality=low&theme=dark&surface=relief&view=2d");
  expect(await page.evaluate(() => window.goatcounter.path())).toBe("/monsoon/?view=2d");
});

test("makes no request to an outside service from a local build", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1")) outside.push(request.url());
  });
  await page.goto("/monsoon/");
  await page.waitForLoadState("load");
  expect(outside).toEqual([]);
  expect(await page.locator('script[src*="gc.zgo.at"]').count()).toBe(0);
});

/**
 * Wait until Next's router has written its own history entry. It reads the address before it
 * hydrates and writes that address back when hydration commits, so on a slow runner an address
 * the test set in between was put back to /monsoon/ and counted as a second move. A reader
 * cannot change routes before then: until hydration a link is a full page load.
 */
async function routerReady(page: Page) {
  await page.waitForFunction(() => history.state?.__NA === true);
}

test("counts a move to another page, dropping the theme it was opened with", async ({ page }) => {
  await page.goto("/monsoon/");
  await routerReady(page);
  const sent = await recordSends(page);
  await page.evaluate(() => history.pushState({}, "", "/districts/?theme=dark"));
  expect(await sent()).toEqual([{ path: "/districts/" }]);
  // The same screen again is the same screen, whatever else is in the address.
  await page.evaluate(() => history.replaceState({}, "", "/districts/?theme=light"));
  expect(await sent()).toHaveLength(1);
});

test("counts an interaction once, however many times a visit uses it", async ({ page }) => {
  await page.goto("/monsoon/");
  const sent = await recordSends(page);
  const play = page.getByRole("button", { name: "Play through the months" });
  await play.scrollIntoViewIfNeeded();
  await play.click();
  await page.getByRole("button", { name: "Pause months" }).click();
  await play.click();

  // Moved across rather than hovered per cell: the mandal outlines overlap, so a targeted
  // hover lands on a neighbour, and a reader moves a cursor over the map anyway.
  const map = page.locator("svg.rechargeMapSvg");
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  for (const step of [0.3, 0.5, 0.7]) {
    await page.mouse.move(box.x + box.width * step, box.y + box.height * 0.5);
  }

  const events = (await sent()).filter((row) => row.event);
  expect(events.filter((row) => row.path === "ap-gw/monsoon/pacific-play")).toHaveLength(1);
  expect(events.filter((row) => row.path === "ap-gw/monsoon/map-inspect")).toHaveLength(1);
  expect(events.every((row) => row.path.startsWith("ap-gw/monsoon/"))).toBe(true);
  expect(events.every((row) => (row.title ?? "").length > 12)).toBe(true);
});

test("holds an interaction that happens before count.js arrives", async ({ page }) => {
  await page.goto("/monsoon/");
  const volume = page.getByRole("button", { name: "Storage proxy" });
  await volume.scrollIntoViewIfNeeded();
  await volume.click();
  await volume.click();
  // count.js is never fetched here, so the click has to be waiting rather than gone.
  // Scrolling to the button passes the section markers, which queue up the same way.
  const pending = await page.evaluate(() => window.apgwCount?.pending);
  expect(pending).toContainEqual({
    name: "monsoon/map-volume",
    title: "Monsoon: coloured the map by water lost",
  });
  expect(pending!.filter((row) => row.name === "monsoon/map-volume")).toHaveLength(1);
});

test("records how far down a long page a visit actually read", async ({ page }) => {
  await page.goto("/monsoon/");
  const sent = await recordSends(page);
  const reached = async () =>
    (await sent()).map((row) => row.path).filter((path) => path.includes("reached-"));
  expect(await reached()).not.toContain("ap-gw/monsoon/reached-heat");

  await page.getByText("The other cost: heat").scrollIntoViewIfNeeded();
  await expect.poll(reached).toContain("ap-gw/monsoon/reached-heat");
  await page.getByText("Provisional groundwater review queue", { exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(reached).toContain("ap-gw/monsoon/reached-flagged");
});

test("does not invent the sections a visit skipped over", async ({ page }) => {
  await page.goto("/monsoon/");
  const sent = await recordSends(page);
  // A reader who jumps to the end has not read the middle, so the middle is not counted.
  // These are reach figures per section, which is why they need not fall in reading order.
  await page.getByText("Provisional groundwater review queue", { exact: true }).scrollIntoViewIfNeeded();
  await expect
    .poll(async () => (await sent()).map((row) => row.path))
    .toContain("ap-gw/monsoon/reached-flagged");
  expect((await sent()).map((row) => row.path)).not.toContain("ap-gw/monsoon/reached-heat");
});

test("records nothing for a browser that sends Global Privacy Control", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "globalPrivacyControl", { get: () => true }),
  );
  await page.goto("/monsoon/");
  expect(await page.evaluate(() => "goatcounter" in window)).toBe(false);
  // The page still has to work: every control calls countEvent unconditionally.
  const play = page.getByRole("button", { name: "Play through the months" });
  await play.scrollIntoViewIfNeeded();
  await play.click();
  await expect(page.getByRole("button", { name: "Pause months" })).toBeVisible();
  expect(await page.evaluate(() => window.apgwCount?.pending)).toBeUndefined();
});
