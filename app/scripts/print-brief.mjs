#!/usr/bin/env node
/**
 * Print the six-page project brief (/brief/) to out/brief/ap-water-intelligence-brief.pdf,
 * so every deploy publishes a brief with this week's maps and figures. Run after
 * `npm run build:static`:
 *
 *   node scripts/print-brief.mjs --directory out --base /ap-groundwater-fusion
 *
 * --base is the PAGES_BASE_PATH the site was built with ("" for a local build).
 * Before printing it captures what the brief shows of the site itself: two 3D
 * renders (the latest month, and next May in a dry winter) and four page
 * screenshots, written beside the page as JPEGs. A render that fails is left
 * out and its frame hidden, never printed as a broken image.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const flag = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > -1 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
};
const directory = resolve(APP_DIR, flag("directory", "out"));
const base = flag("base", process.env.PAGES_BASE_PATH ?? "").replace(/\/$/, "");
const port = Number(flag("port", 3292));
const folder = join(directory, "brief");
const output = join(folder, "ap-water-intelligence-brief.pdf");
const origin = `http://127.0.0.1:${port}${base}`;

const server = spawn(process.execPath, [join(APP_DIR, "scripts/serve-static.mjs"), "--port", String(port), "--bind", "127.0.0.1", "--directory", directory, "--base", base || "/"], { stdio: "inherit" });
const stop = () => { if (!server.killed) server.kill(); };
process.on("exit", stop);

async function ready(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const answer = await fetch(url);
      if (answer.ok) return;
    } catch { /* not listening yet */ }
    await new Promise(done => setTimeout(done, 200));
  }
  throw new Error(`static server did not answer at ${url}`);
}

/** The 3D view with its panels hidden, zoomed in, cropped to the state. */
async function render3d(browser, query, dry, file, clip) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 1.5 });
  try {
    await page.goto(`${origin}/water-crystal-3d.html${query}`, { waitUntil: "load" });
    await page.waitForTimeout(5500);
    if (await page.locator("#fallback").isVisible()) throw new Error("WebGL unavailable");
    if (dry) { await page.getByRole("button", { name: "Dry winter" }).click(); await page.waitForTimeout(3000); }
    for (let i = 0; i < 2; i++) { await page.getByRole("button", { name: "Zoom in" }).click(); await page.waitForTimeout(300); }
    await page.waitForTimeout(900);
    await page.locator("#focusBtn").click();
    await page.evaluate(() => { for (const id of ["compass", "focusBtn", "probeTag", "probeLeader"]) { const el = document.getElementById(id); if (el) el.style.display = "none"; } });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(folder, file), type: "jpeg", quality: 82, clip });
    return true;
  } catch (error) {
    console.error(`3D render ${file} skipped: ${error.message}`);
    return false;
  } finally {
    await page.close();
  }
}

let browser;
try {
  await ready(`${origin}/brief/`);
  // SwiftShader stands in for a GPU on CI runners; the flag keeps it allowed.
  browser = await chromium.launch({ args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
  const shots = {
    "cover3d.jpg": await render3d(browser, "", false, "cover3d.jpg", { x: 53, y: 153, width: 1594, height: 834 }),
    "outlook3d.jpg": await render3d(browser, "?mode=outlook", true, "outlook3d.jpg", { x: 0, y: 280, width: 1700, height: 467 }),
  };
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const [key, route] of [["monsoon", "/monsoon/"], ["drought", "/drought/"], ["map", "/map/"], ["summer", "/summer/"]]) {
    try {
      await desk.goto(`${origin}${route}`, { waitUntil: "networkidle" });
      await desk.waitForTimeout(800);
      await desk.screenshot({ path: join(folder, `site-${key}.jpg`), type: "jpeg", quality: 78 });
      shots[`site-${key}.jpg`] = true;
    } catch (error) {
      console.error(`Screenshot of ${route} skipped: ${error.message}`);
      shots[`site-${key}.jpg`] = false;
    }
  }
  await desk.close();

  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${origin}/brief/`, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);
  const missing = Object.entries(shots).filter(([file, ok]) => !ok || !existsSync(join(folder, file))).map(([file]) => file);
  if (missing.length) {
    await page.addStyleTag({ content: missing.map(file => `img[src="./${file}"]{visibility:hidden}`).join("\n") });
    console.error(`Printed without: ${missing.join(", ")}`);
  }
  await page.waitForTimeout(400);
  await page.pdf({ path: output, format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  const pages = (readFileSync(output, "latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log(`Printed ${origin}/brief/ to ${output}: ${pages} page${pages === 1 ? "" : "s"}`);
  if (pages !== 6) {
    console.error("The brief no longer prints on six A4 sheets; a section has outgrown its page.");
    process.exitCode = 1;
  }
} finally {
  if (browser) await browser.close();
  stop();
}
