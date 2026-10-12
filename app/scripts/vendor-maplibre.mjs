#!/usr/bin/env node
/**
 * MapLibre 6 starts its tile worker as a module file beside its own bundle, which the
 * static export does not emit, so the basemap's worker 404ed. Copy the installed worker
 * into public/vendor at build time (never committed, so it always matches the package)
 * as .js, which every static host serves as JavaScript; vectorBasemap.ts points at it.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve("maplibre-gl/package.json"));
const out = join(APP_DIR, "public", "vendor");
mkdirSync(out, { recursive: true });
copyFileSync(join(pkg, "dist", "maplibre-gl-worker.mjs"), join(out, "maplibre-gl-worker.js"));
console.log("vendored maplibre-gl-worker.js");
