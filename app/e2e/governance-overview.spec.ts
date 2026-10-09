import { expect, test } from "@playwright/test";
import watch from "../data/monsoon_watch.json";
import summer from "../data/summer_outlook.json";

/* The overview leads with four lines, one figure each, and keeps every other
   number one click away; the project brief is a page and a PDF; the long pages
   keep their section menus in reach as they scroll. */

test("the overview opens on four headline cards, with the full figures folded", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Andhra Pradesh water this week");
  const lines = page.getByRole("region", { name: "This week in four lines" });
  const cards = lines.getByRole("link");
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(1)).toContainText(`${watch.recharge.fallingPct}%`);
  await expect(cards.nth(3)).toContainText(String(summer.summary.beyond));
  await expect(cards.nth(3)).toHaveAttribute("href", /\/summer\/?$/);
  // The headline cards come before the map; the model's numbers wait behind one click.
  const map = page.locator(".overviewMapLead");
  expect((await lines.boundingBox())!.y).toBeLessThan((await map.boundingBox())!.y);
  const more = page.locator("details.overviewMore");
  await expect(more).not.toHaveAttribute("open", "");
  await expect(more.getByText("Median Modelled Nowcast")).toBeHidden();
  await more.locator("summary").click();
  await expect(more.getByText("Median Modelled Nowcast")).toBeVisible();
  await expect(more).toContainText("Accuracy by depth");
});

test("the project brief is a six-sheet page with this week's maps, and Methodology offers its PDF", async ({ page }) => {
  await page.goto("/brief/");
  await expect(page.getByTestId("brief-sheet")).toHaveCount(6);
  await expect(page.locator("svg[aria-hidden='true'] path").first()).toBeAttached();
  await expect(page.getByTestId("brief-sheet").nth(4)).toContainText(`${summer.summary.beyond}mandals past their deepest May`);
  await expect(page.getByTestId("brief-pdf")).toHaveAttribute("href", /\/brief\/ap-water-intelligence-brief\.pdf$/);
  await page.goto("/methodology/");
  await expect(page.getByTestId("methodology-brief-pdf")).toHaveAttribute("href", /\/brief\/ap-water-intelligence-brief\.pdf$/);
  await expect(page.getByRole("link", { name: /Read it on screen/ })).toHaveAttribute("href", /\/brief\/?$/);
});

for (const viewport of [{ width: 1440, height: 900, top: 0 }, { width: 390, height: 844, top: 56 }]) {
  test(`long pages keep their section menu in reach as they scroll at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [route, name] of [["/drought/", "Drought sections"], ["/monsoon/", "Monsoon sections"], ["/agriculture/", "Agriculture sections"]] as const) {
      await page.goto(route);
      const nav = page.getByRole("navigation", { name });
      await expect(nav).toBeVisible();
      // A busy runner can drop a wheel that lands as the page first paints, so scroll until
      // the menu reaches the top. A menu that did not stick would scroll past it and never settle.
      await expect.poll(async () => {
        const y = Math.round((await nav.boundingBox())!.y);
        if (y > viewport.top) await page.mouse.wheel(0, 2400);
        return y;
      }, { timeout: 8000 }).toBe(viewport.top);
      // On a phone the menu is one line that scrolls, never a block down the screen.
      if (viewport.width < 640) expect((await nav.boundingBox())!.height).toBeLessThan(60);
    }
  });
}

test("no page of the brief runs into its footer when printed", async ({ page }) => {
  // Measured as scripts/print-brief.mjs prints: after the network is idle and every face has loaded,
  // since a fallback font would wrap differently and the PDF is never printed with one.
  await page.goto("/brief/", { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map(face => face.load().catch(() => undefined)));
    await document.fonts.ready;
  });
  // Each sheet is a fixed A4 page with overflow hidden: text that does not fit is cut off
  // silently rather than adding a page, so measure the lowest content against the footer.
  const gaps = await page.$$eval('[data-testid="brief-sheet"]', sheets => sheets.map(sheet => {
    const foot = sheet.querySelector('[class*="pfoot"]')?.getBoundingClientRect();
    let lowest = 0;
    const reach = (box: DOMRect) => { if (box.width && box.height) lowest = Math.max(lowest, box.bottom); };
    for (const el of sheet.querySelectorAll("*")) {
      if (el.closest('[class*="pfoot"]') || (el.closest("svg") && el.tagName !== "svg")) continue;
      if (el.children.length && !["svg", "IMG", "TR"].includes(el.tagName)) continue;
      reach(el.getBoundingClientRect());
    }
    // Every line of text too: a paragraph holding a bold run is not a leaf, and its last line
    // once rested on page 3's footer while only the bold first line was measured.
    const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || node.parentElement?.closest('[class*="pfoot"]')) continue;
      range.selectNodeContents(node);
      reach(range.getBoundingClientRect());
    }
    return foot ? foot.top - lowest : sheet.getBoundingClientRect().bottom - lowest;
  }));
  // Clear of the footer's rule by about 1.5 mm, not just short of it: a line resting on the rule
  // still reads as cramped on paper.
  gaps.forEach((gap, index) => expect(gap, `sheet ${index + 1} crowds its footer`).toBeGreaterThanOrEqual(6));
});
