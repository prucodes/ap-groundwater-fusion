#!/usr/bin/env node
/**
 * Print the weekly digest (/digest/) to a one-page A4 PDF inside the built site,
 * at out/digest/ap-water-weekly-digest.pdf, so every deploy publishes this week's
 * sheet beside the page. Run after `npm run build:static`:
 *
 *   node scripts/print-digest.mjs --directory out --base /ap-groundwater-fusion
 *
 * --base is the PAGES_BASE_PATH the site was built with ("" for a local build).
 * It serves the build with scripts/serve-static.mjs on a loopback port, prints
 * with Playwright's Chromium, and checks the result is a single page: a digest
 * that spills onto a second sheet is reported, never silently shipped as one.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
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
const port = Number(flag("port", 3291));
const output = join(directory, "digest", "ap-water-weekly-digest.pdf");

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

const url = `http://127.0.0.1:${port}${base}/digest/`;
let browser;
try {
  await ready(url);
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: output, format: "A4", printBackground: true, preferCSSPageSize: true });
  const pages = (readFileSync(output, "latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log(`Printed ${url} to ${output}: ${pages} page${pages === 1 ? "" : "s"}`);
  if (pages !== 1) {
    console.error("The digest no longer fits one A4 sheet; shorten it before the next deploy.");
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  stop();
}
