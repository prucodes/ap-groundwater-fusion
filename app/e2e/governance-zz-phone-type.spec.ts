import { expect, test } from "@playwright/test";

/* On a phone nothing a reader is meant to read drops below 11px. Labels written at 9 or 10px
   for a laptop column turn into specks at 390px wide, so each one is lifted at phone width
   (the floor blocks at the end of globals.css and the page modules, plus a few overrides next
   to their rules). Drawn text inside charts and maps scales with its drawing, and the films
   have their own frame, so both are left out. The Brief is laid out as an A4 sheet to print,
   and the laptop sizes are not touched by any of this. */

const PAGES = ["/", "/changes/", "/weekly-film/", "/garden/", "/districts/sheets/", "/map/", "/monsoon/", "/cyclones/", "/drought/", "/summer/", "/rabi/",
  "/agriculture/", "/districts/", "/constituencies/", "/facts/", "/field-report/", "/field-check/", "/digest/", "/nasa/", "/climate/",
  "/scenario/", "/irrigation/", "/estimates/", "/readiness/", "/compare/", "/methodology/", "/settings/", "/crystal/",
  "/living-water-table/", "/mandals/ap-temp-mandal-kurnool-alur-512/",
  // The 3D view runs in its own frame on /crystal/, so its HUD is checked on its own page.
  "/water-crystal-3d.html?static=1"];

test.use({ viewport: { width: 390, height: 844 } });

test("no text on a phone page is smaller than 11px", async ({ page }) => {
  test.setTimeout(240_000);
  const found: string[] = [];
  for (const route of PAGES) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    // Folded detail counts: open everything a reader could open.
    await page.evaluate(() => document.querySelectorAll("details").forEach(fold => { fold.open = true; }));
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const el = walker.currentNode.parentElement, text = (walker.currentNode.textContent ?? "").trim();
        if (!el || !text || el.closest("svg, [data-film-stage], .leaflet-container, script, style")) continue;
        if (el.getClientRects().length === 0) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        // 0px is text deliberately hidden behind a drawn stand-in (the 3D compass needle).
        if (size > 0 && size < 10.99) out.push(`${size}px "${text.slice(0, 32)}" (${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]})`);
      }
      return out;
    });
    for (const piece of small) found.push(`${route}: ${piece}`);
  }
  expect(found, found.join("\n")).toEqual([]);
});
