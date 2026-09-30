/**
 * Static file server for the layout tests, with Range request support.
 *
 * `python3 -m http.server`, which this replaced, ignores the Range header: it answers every
 * request with 200 and the whole file, and never sends Accept-Ranges. Chromium then reports
 * the monsoon film as unseekable — `video.seekable` comes back as [[0, 0]] on a 178 s video —
 * and silently discards `currentTime = 18.44`, leaving `seeking` false and the position at 0.
 * The chapter-seek assertions failed for that reason and not for anything in the app: GitHub
 * Pages answers the same request with 206 and `accept-ranges: bytes`, so seeking works in
 * production. This server behaves the way Pages does.
 *
 * Deliberately minimal: it serves one directory of already-built files to a test browser on
 * the loopback interface. No directory listing, no compression, no caching.
 *
 * Usage mirrors the flags it replaced:
 *   node scripts/serve-static.mjs --port 3100 --bind 127.0.0.1 --directory out
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join, normalize, resolve, sep } from "node:path";

const flag = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const port = Number(flag("port", 3100));
const host = flag("bind", "127.0.0.1");
const root = resolve(flag("directory", "out"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const typeOf = (path) => {
  const dot = path.lastIndexOf(".");
  return (dot > -1 && TYPES[path.slice(dot).toLowerCase()]) || "application/octet-stream";
};

/** The file a URL path names, or null if it escapes the served directory or is not a file. */
async function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  const candidate = resolve(join(root, normalize(decoded)));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  try {
    const found = await stat(candidate);
    // The export uses trailing slashes, so a directory means its index.html.
    if (found.isDirectory()) {
      const index = join(candidate, "index.html");
      return { path: index, size: (await stat(index)).size };
    }
    return { path: candidate, size: found.size };
  } catch {
    return null;
  }
}

/**
 * One byte range from a Range header, or null to send the whole file, or "unsatisfiable".
 * Only a single range is handled; a media element asks for no more than that.
 */
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  let start;
  let end;
  if (rawStart === "") {
    // A suffix range: the last N bytes.
    const length = Number(rawEnd);
    if (length === 0) return "unsatisfiable";
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start > end || start >= size) return "unsatisfiable";
  return { start, end };
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" }).end();
    return;
  }
  const file = await resolveFile(request.url ?? "/");
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : "Not found");
    return;
  }

  const headers = { "content-type": typeOf(file.path), "accept-ranges": "bytes" };
  const range = parseRange(request.headers.range, file.size);

  if (range === "unsatisfiable") {
    response.writeHead(416, { ...headers, "content-range": `bytes */${file.size}` }).end();
    return;
  }
  const { start, end } = range ?? { start: 0, end: file.size - 1 };
  const partial = range !== null;
  response.writeHead(partial ? 206 : 200, {
    ...headers,
    "content-length": String(end - start + 1),
    ...(partial ? { "content-range": `bytes ${start}-${end}/${file.size}` } : {}),
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(file.path, { start, end });
  // A browser abandons media requests constantly as it seeks; that is not an error.
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
});

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}/ with Range support`);
});
