import { chromium } from "@playwright/test";
const routes = ["", "map", "mandals", "estimates", "districts", "watchlist", "alerts", "monsoon",
  "climate", "nasa", "readiness", "methodology", "reports", "snapshot", "compare", "scenario",
  "irrigation", "settings", "living-water-table", "crystal"];
const b = await chromium.launch();
const rows = [];
for (const r of routes) {
  for (const [name, w, h] of [["desktop", 1280, 900], ["phone", 375, 812]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e).slice(0, 70)));
    try {
      await p.goto(`http://127.0.0.1:3104/${r}/`, { timeout: 25000 });
      await p.waitForTimeout(1600);
      const d = await p.evaluate(() => {
        const sx = window.scrollX;
        window.scrollTo(document.documentElement.scrollWidth, 0);
        const over = window.scrollX - sx;
        window.scrollTo(sx, 0);
        // elements whose content is wider than their box and which clip it
        let clipped = 0, zero = 0, tiny = 0;
        document.querySelectorAll(".pageWrap *").forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") return;
          const rect = el.getBoundingClientRect();
          if (el.children.length === 0 && el.textContent.trim() && rect.width === 0 && rect.height === 0) zero++;
          if (/hidden|clip/.test(cs.overflowX) && el.scrollWidth - el.clientWidth > 2) clipped++;
          if (cs.fontSize && parseFloat(cs.fontSize) < 10 && el.textContent.trim().length > 3) tiny++;
        });
        return { over, clipped, zero, tiny, page: document.body.scrollHeight };
      });
      rows.push({ route: "/" + r, view: name, ...d, errs: errs.length });
    } catch (e) {
      rows.push({ route: "/" + r, view: name, over: "LOAD FAIL", clipped: 0, zero: 0, tiny: 0, page: 0, errs: 1 });
    }
    await p.close();
  }
}
await b.close();
const bad = rows.filter((r) => r.over !== 0 || r.zero || r.clipped || r.errs || r.tiny);
console.table(rows);
console.log("\nROUTES WITH FINDINGS:", bad.length);
