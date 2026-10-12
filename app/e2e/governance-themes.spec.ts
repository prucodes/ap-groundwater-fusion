import { expect, test } from "@playwright/test";

// The dark theme, page by page: it must survive hydration (a build-day date in the Field
// Report once made React rebuild the page and drop it), the page's own ground must be dark,
// and no surface may glare light: Leaflet's #ddd backdrop, the light wetness tags and an
// inverted sort pill all did. The Brief and Digest are A4 paper by design and are not here.
const PAGES = ["/", "/monsoon/", "/drought/", "/summer/", "/nasa/", "/field-report/", "/constituencies/", "/compare/", "/estimates/", "/scenario/"];

for (const path of PAGES) {
  test(`the dark theme holds on ${path} with no light surface`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(`${path}?theme=dark`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    expect(errors, "the page threw while loading").toEqual([]);
    const found = await page.evaluate(() => {
      const parse = (c: string) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
      };
      const lum = (c: { r: number; g: number; b: number }) => {
        const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const ground = parse(getComputedStyle(document.documentElement).backgroundColor);
      const light: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        if (el.closest("svg") || ["IMG", "VIDEO", "CANVAS", "IFRAME", "INPUT"].includes(el.tagName)) continue;
        const box = el.getBoundingClientRect();
        if (box.width * box.height < 600) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) continue;
        const bg = parse(style.backgroundColor);
        if (bg && bg.a >= 0.6 && lum(bg) > 0.7) light.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${style.backgroundColor}`);
      }
      return { theme: document.documentElement.dataset.theme, ground: ground ? lum(ground) : 1, light: light.slice(0, 5) };
    });
    expect(found.theme, "the theme was dropped after load").toBe("dark");
    expect(found.ground, "the page's own ground is light").toBeLessThan(0.05);
    expect(found.light, "light surfaces on the dark theme").toEqual([]);
  });
}

// The light theme's type: footnotes, units and signal-coloured text once sat at 2.5-3:1 on white
// (#8a97a8 grey, #12b5cb cyan, the status green and amber). Nothing that is read may fall
// below 3:1 against what is actually behind it. Text over a gradient, the faint step numerals
// (a watermark beside real headings) and a video's fallback text are not measured.
for (const path of PAGES) {
  test(`light-theme type on ${path} reads at 3:1 or better`, async ({ page }) => {
    await page.goto(`${path}?theme=light`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const faint = await page.evaluate(() => {
      const parse = (c: string) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
      };
      const lum = (c: { r: number; g: number; b: number }) => {
        const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const behind = (el: Element) => {
        for (let e: Element | null = el; e; e = e.parentElement) {
          const style = getComputedStyle(e);
          const c = parse(style.backgroundColor);
          if (c && c.a >= 0.5) return c;
          if (style.backgroundImage !== "none") return null;
        }
        return parse(getComputedStyle(document.documentElement).backgroundColor);
      };
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        if (el.closest("svg, video") || String(el.className).includes("stepNumber")) continue;
        if (![...el.childNodes].some(n => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1)) continue;
        const box = el.getBoundingClientRect(), style = getComputedStyle(el);
        if (!box.width || !box.height || style.visibility === "hidden" || Number(style.opacity) < 0.05) continue;
        const fg = parse(style.color), bg = behind(el);
        if (!fg || !bg) continue;
        const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (hi + 0.05) / (lo + 0.05);
        if (ratio < 3) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} "${(el.textContent ?? "").trim().slice(0, 30)}" ${ratio.toFixed(2)}`);
      }
      return out.slice(0, 5);
    });
    expect(faint, "light-theme text below 3:1").toEqual([]);
  });
}
