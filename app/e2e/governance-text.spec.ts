import { expect, test } from "@playwright/test";

/* A multi-line JSX text run that starts right after a closing tag loses its
   leading space in this build ("a percentile</strong>describes"). Nothing in
   the type-check or the layout catches it, so the rendered text is read. */

const PAGES = ["/", "/methodology/", "/nasa/", "/scenario/", "/monsoon/", "/drought/", "/constituencies/", "/constituencies/120/", "/agriculture/"];

for (const path of PAGES) {
  test(`no inline emphasis runs into the next word on ${path}`, async ({ page }) => {
    await page.goto(path);
    const joined = await page.evaluate(() => {
      const found: string[] = [];
      for (const element of Array.from(document.querySelectorAll("main strong, main em, main b, main a, main code"))) {
        if (getComputedStyle(element).display !== "inline") continue;
        const next = element.nextSibling;
        const text = next && next.nodeType === Node.TEXT_NODE ? next.textContent ?? "" : "";
        if (/^[A-Za-z0-9]/.test(text) && /[A-Za-z0-9.:)]$/.test(element.textContent ?? "")) {
          found.push(`${(element.textContent ?? "").slice(-24)}|${text.slice(0, 24)}`);
        }
      }
      return found;
    });
    expect(joined).toEqual([]);
  });
}
