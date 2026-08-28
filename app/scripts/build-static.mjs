#!/usr/bin/env node
/**
 * Static-export build for GitHub Pages.
 *
 * The app is normally a Node server build: three heavy routes are marked
 * `force-dynamic` on purpose (pre-rendering ~640 mandal pages pulls a 7 MB
 * observation series into every render), and /api/ai-brief runs server-side
 * because it holds a model API key.
 *
 * Static hosting has no server, so for this build only we:
 *   1. rewrite those `force-dynamic` literals to `force-static`
 *      (Next parses the value at compile time, so it cannot be an expression), and
 *   2. move app/api aside — `output: "export"` cannot emit a POST route handler.
 *
 * Both are restored in a finally block, so the working tree is left exactly as
 * it was found even if the build fails or the process is interrupted.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const DYNAMIC_PAGES = [
  "app/irrigation/page.tsx",
  "app/living-water-table/page.tsx",
  "app/mandals/[id]/page.tsx",
];
const API_DIR = join(APP_DIR, "app/api");
// Must live OUTSIDE the app router directory, or Next still treats it as a route.
const API_STASH = join(APP_DIR, ".api-static-build-stash");

const originals = new Map();
let apiMoved = false;

function restore() {
  for (const [file, text] of originals) writeFileSync(file, text);
  if (apiMoved && existsSync(API_STASH)) renameSync(API_STASH, API_DIR);
}

// Restore on Ctrl-C / kill as well as on normal completion.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

try {
  for (const relative of DYNAMIC_PAGES) {
    const file = join(APP_DIR, relative);
    const text = readFileSync(file, "utf8");
    if (!text.includes('export const dynamic = "force-dynamic";')) {
      throw new Error(
        `${relative} no longer contains the expected force-dynamic literal. ` +
          `Update scripts/build-static.mjs to match the new source.`,
      );
    }
    originals.set(file, text);
    writeFileSync(
      file,
      text.replace(
        'export const dynamic = "force-dynamic";',
        'export const dynamic = "force-static";',
      ),
    );
  }

  if (existsSync(API_DIR)) {
    if (existsSync(API_STASH)) {
      throw new Error(
        `${API_STASH} already exists — a previous build likely died mid-run. ` +
          `Move it back to app/api before rebuilding.`,
      );
    }
    renameSync(API_DIR, API_STASH);
    apiMoved = true;
  }

  execFileSync("npx", ["next", "build"], {
    cwd: APP_DIR,
    stdio: "inherit",
    env: { ...process.env, STATIC_EXPORT: "1" },
  });
} finally {
  restore();
}
