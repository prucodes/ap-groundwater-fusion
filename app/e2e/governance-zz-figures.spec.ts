import { expect, test } from "@playwright/test";

/* A figure is shown to the precision that means something: a depth of 1.0174 m, a share of
   0.9279 or a district centroid to the metre say more than the measurement knows and read
   as carelessness. On every page a reader is pointed to, no figure of 0.1 or more carries
   three or more decimals. Smaller numbers keep theirs (a p-value of 0.055, a change in NDVI
   of 0.003, a grid of 0.0417°), and code blocks (the AWARE export preview) are data, not prose. */

const PAGES = ["/", "/changes/", "/weekly-film/", "/garden/", "/monsoon/", "/cyclones/", "/drought/", "/map/", "/summer/", "/rabi/", "/agriculture/",
  "/districts/", "/constituencies/", "/facts/", "/field-report/", "/digest/", "/estimates/", "/nasa/", "/climate/", "/scenario/",
  "/irrigation/", "/readiness/", "/compare/", "/methodology/", "/brief/", "/settings/"];

test("no page shows a figure to more precision than it has", async ({ page }) => {
  test.setTimeout(180_000);
  const found: string[] = [];
  for (const route of PAGES) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    // Folded detail counts: open everything a reader could open.
    await page.evaluate(() => document.querySelectorAll("details").forEach(fold => { fold.open = true; }));
    // Each piece of text on its own, so neighbouring table cells never run together into one number.
    const text = await page.evaluate(() => {
      const root = document.querySelector("main") ?? document.body, pieces: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement?.closest("pre, code, script, style, svg, [data-film-stage]")) continue;
        pieces.push(node.textContent ?? "");
      }
      return pieces.join(" | ");
    });
    for (const match of text.matchAll(/(?<![\d.,\-#])(\d{1,4})\.(\d{3,})(?![\d])/g)) {
      if (Number(match[1]) === 0 && Number(`0.${match[2]}`) < 0.1) continue;
      found.push(`${route}: "${text.slice(Math.max(0, match.index! - 40), match.index! + match[0].length + 12).replace(/\s+/g, " ")}"`);
    }
  }
  expect(found, found.join("\n")).toEqual([]);
});
