/** @type {import('next').NextConfig} */

// Static-export mode (GitHub Pages). Enabled by STATIC_EXPORT=1 via
// `npm run build:static`. The default build stays a Node server build so the
// server-backed AI brief and on-demand routes keep working when self-hosted.
const isStaticExport = process.env.STATIC_EXPORT === "1";

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/,
// so every asset and link needs that prefix. Override with PAGES_BASE_PATH
// (use "" for a user/organisation site or a custom domain).
const basePath =
  process.env.PAGES_BASE_PATH !== undefined
    ? process.env.PAGES_BASE_PATH
    : "/ap-groundwater-fusion";

const nextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        basePath,
        // Trailing slashes make Pages resolve /route/ -> /route/index.html.
        trailingSlash: true,
        // No Next image optimisation server exists on Pages.
        images: { unoptimized: true },
      }
    : { output: "standalone" }),
  // Hide the dev-mode build indicator (bottom-left) in demos.
  devIndicators: false,
  // Pin the workspace root to this app dir so Next doesn't infer it from a
  // stray parent lockfile (silences the multi-lockfile root warning).
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  env: {
    // Read by the client so server-backed features can degrade honestly
    // instead of firing a fetch that will 404 on static hosting.
    NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? "1" : "",
    NEXT_PUBLIC_BASE_PATH: isStaticExport ? basePath : "",
  },
};

export default nextConfig;
