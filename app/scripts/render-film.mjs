#!/usr/bin/env node
/**
 * Record one of the site's films to MP4 in three shapes, inside the built site:
 *
 *   --film weekly        /weekly-film/   ->  out/films/weekly/ap-water-week-<shape>.mp4
 *   --film methodology   /methodology/   ->  out/films/methodology/ap-water-method-<shape>.mp4
 *
 *   landscape 1920x1080  meeting screens, slides
 *   square    1080x1080  messages and groups
 *   portrait  1080x1920  WhatsApp Status, phones
 *
 * and a manifest.json beside them, which the page's download row reads. Run after
 * `npm run build:static`:
 *
 *   node scripts/render-film.mjs --film weekly --directory out --base /ap-groundwater-fusion
 *
 * A film draws the frame for any moment (window.renderFilm(seconds), FilmPlayer.tsx), so
 * this steps through it 30 frames a second, screenshots each frame and pipes it to ffmpeg.
 * Nothing is recorded in real time, so a slow machine drops no frames. A frame identical
 * to the one before (a film holds still while a figure is read) is not photographed again.
 *
 * Before anything is encoded, every scene of every shape is checked at the moment it is
 * fully on screen: no text outside the safe area, none running out of its column, no two
 * pieces of text overlapping, none too small to read on a phone. A film that fails is
 * not published; the frames it was judged on are kept as a contact sheet per shape
 * (--evidence, default test-results/<film>-film) for a person to look at.
 *
 *   --qa-only       check and write the contact sheets, encode nothing
 *   --formats a,b   a subset of landscape,square,portrait
 */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
const port = Number(flag("port", 3293));
const FILMS = { weekly: { route: "/weekly-film/", file: "ap-water-week" }, methodology: { route: "/methodology/", file: "ap-water-method" } };
const filmName = flag("film", "weekly");
if (!(filmName in FILMS)) { console.error(`unknown film "${filmName}": choose from ${Object.keys(FILMS).join(", ")}`); process.exit(2); }
const { route, file: filePrefix } = FILMS[filmName];
const output = resolve(APP_DIR, flag("output", join(directory, "films", filmName)));
const evidence = resolve(APP_DIR, flag("evidence", `test-results/${filmName}-film`));
const qaOnly = process.argv.includes("--qa-only");
const FPS = 30;
const SIZE = { landscape: [1920, 1080], square: [1080, 1080], portrait: [1080, 1920] };
const formats = flag("formats", "landscape,square,portrait").split(",").filter(name => name in SIZE);
/** Text closer to the edge than this may sit under a phone's own controls or a projector's overscan. */
const SAFE = 40;
const MIN_TEXT_PX = 21;

const server = spawn(process.execPath, [join(APP_DIR, "scripts/serve-static.mjs"), "--port", String(port), "--bind", "127.0.0.1", "--directory", directory, "--base", base || "/"], { stdio: "inherit" });
const stop = () => { if (!server.killed) server.kill(); };
process.on("exit", stop);

async function ready(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not listening yet */ }
    await new Promise(done => setTimeout(done, 200));
  }
  throw new Error(`static server did not answer at ${url}`);
}

const run = (command, args) => new Promise((done, fail) => {
  const child = spawn(command, args, { stdio: ["ignore", "ignore", "inherit"] });
  child.on("error", fail);
  child.on("close", code => (code === 0 ? done() : fail(new Error(`${command} exited ${code}`))));
});

/** Runs in the page: every piece of visible text in the frame, judged where it stands. */
function inspect({ safe, minPx }) {
  const stage = document.querySelector("[data-film-stage]");
  const width = window.innerWidth, height = window.innerHeight;
  const shown = el => {
    for (let node = el; node && node !== stage.parentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) return false;
    }
    return true;
  };
  const pieces = [], walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, el = node.parentElement, text = node.textContent.trim();
    if (!text || !el || !shown(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    // A line's box is taller than its letters (room for accents and descenders that are rarely there),
    // so each is judged on the band the letters occupy.
    const lines = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1)
      .map(r => ({ left: r.left, top: r.top + r.height * 0.17, right: r.right, bottom: r.bottom - r.height * 0.17 }));
    if (!lines.length) continue;
    const svg = el instanceof SVGElement;
    const size = svg ? el.getBoundingClientRect().height / 1.18 : parseFloat(getComputedStyle(el).fontSize);
    const box = el.closest("[data-film-box]")?.getBoundingClientRect() ?? null;
    pieces.push({ el, text: text.slice(0, 60), lines, size, box });
  }
  const problems = [];
  for (const piece of pieces) {
    for (const line of piece.lines) {
      if (line.left < safe || line.top < safe || line.right > width - safe || line.bottom > height - safe) { problems.push(`outside the safe area: "${piece.text}"`); break; }
      if (piece.box && (line.left < piece.box.left - 2 || line.right > piece.box.right + 2 || line.top < piece.box.top - 2 || line.bottom > piece.box.bottom + 2)) { problems.push(`runs out of its column: "${piece.text}"`); break; }
    }
    if (piece.size < minPx) problems.push(`too small to read (${piece.size.toFixed(1)} px): "${piece.text}"`);
  }
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    const a = pieces[i], b = pieces[j];
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const hit = a.lines.some(p => b.lines.some(q => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 3 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 3));
    if (hit) problems.push(`overlap: "${a.text}" and "${b.text}"`);
  }
  return { texts: pieces.length, problems };
}

async function film(browser, format) {
  const [width, height] = SIZE[format];
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  // A returning visit, not a recording of the welcome.
  await context.addInitScript(() => localStorage.setItem("ap-gw-welcome-v1", "entered"));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}${base}${route}?capture=${format}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.filmReady === true, null, { timeout: 60000 });
  const meta = await page.evaluate(() => window.filmMeta);
  const frame = seconds => page.evaluate(time => window.renderFilm(time), seconds);
  const shot = () => page.screenshot({ type: "jpeg", quality: 92 });

  // Each scene as it arrives, once it is whole, and as it leaves; judged when whole.
  const frames = join(evidence, format);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const problems = [];
  let sheet = 0;
  for (const scene of meta.scenes) {
    const moments = [scene.start + 0.4, scene.start + scene.seconds - 0.62, scene.start + scene.seconds - 0.2];
    for (const [k, moment] of moments.entries()) {
      await frame(moment);
      writeFileSync(join(frames, `${String(sheet++).padStart(3, "0")}.jpg`), await shot());
      if (k !== 1) continue;
      const found = await page.evaluate(inspect, { safe: SAFE, minPx: MIN_TEXT_PX });
      if (!found.texts) problems.push(`${scene.id}: no text on screen`);
      problems.push(...found.problems.map(problem => `${scene.id}: ${problem}`));
    }
  }
  const tile = format === "portrait" ? 6 : 3, across = format === "portrait" ? 300 : 480;
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-framerate", "1", "-i", join(frames, "%03d.jpg"),
    "-vf", `scale=${across}:-1,tile=${tile}x${Math.ceil(sheet / tile)}:padding=6:color=0x202b33`, "-frames:v", "1", join(evidence, `contact-${format}.jpg`)]);
  if (errors.length) problems.push(...errors.map(message => `page error: ${message}`));
  if (problems.length || qaOnly) { await context.close(); return { format, problems, meta }; }

  mkdirSync(output, { recursive: true });
  const name = `${filePrefix}-${format}.mp4`, target = join(output, name), started = Date.now();
  const encoder = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0",
    // JPEG frames are full range; phones and WhatsApp expect broadcast range, tagged BT.709.
    "-vf", "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-movflags", "+faststart", "-an", target], { stdio: ["pipe", "inherit", "inherit"] });
  let broken = null;
  encoder.stdin.on("error", error => { broken = error; });
  const closed = once(encoder, "close");
  const total = Math.ceil(meta.seconds * FPS);
  let last = null, photographed = 0;
  await frame(-1); // so the first real frame is never taken for a repeat
  for (let i = 0; i < total; i++) {
    if (broken) throw broken;
    const { same } = await frame(i / FPS);
    if (!same || !last) { last = await shot(); photographed++; }
    if (!encoder.stdin.write(last)) await once(encoder.stdin, "drain");
  }
  encoder.stdin.end();
  const [code] = await closed;
  if (code !== 0) throw new Error(`ffmpeg exited ${code} for ${format}`);
  await context.close();
  const bytes = statSync(target).size;
  console.log(`${format}: ${total} frames (${photographed} photographed) in ${((Date.now() - started) / 1000).toFixed(0)} s, ${(bytes / 1e6).toFixed(1)} MB`);
  return { format, problems, meta, file: { format, file: name, bytes, width, height } };
}

let browser, failed = false;
try {
  await ready(`http://127.0.0.1:${port}${base}${route}`);
  mkdirSync(evidence, { recursive: true });
  browser = await chromium.launch();
  const results = await Promise.all(formats.map(format => film(browser, format)));
  const problems = results.flatMap(result => result.problems.map(problem => `${result.format} / ${problem}`));
  writeFileSync(join(evidence, "checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), formats, problems }, null, 2));
  if (problems.length) {
    failed = true;
    console.error(`The ${filmName} film was not recorded: ${problems.length} layout problem${problems.length === 1 ? "" : "s"}.\n  ${problems.join("\n  ")}\nContact sheets: ${evidence}`);
  } else if (qaOnly) {
    console.log(`The ${filmName} film checked in ${formats.length} shape${formats.length === 1 ? "" : "s"}: no layout problems. Contact sheets: ${evidence}`);
  } else {
    const { meta } = results[0];
    writeFileSync(join(output, "manifest.json"), JSON.stringify({ week: meta.week, seconds: meta.seconds, renderedAt: new Date().toISOString(), files: results.map(result => result.file) }, null, 2));
    console.log(`Recorded the ${filmName} film (${meta.week}) to ${output}`);
  }
} finally {
  await browser?.close();
  stop();
}
if (failed) process.exitCode = 1;
