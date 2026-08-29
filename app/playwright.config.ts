import { defineConfig, devices } from "@playwright/test";

/**
 * Layout regression tests.
 *
 * These run against the built static export, served as plain files — the same
 * artifact that ships to GitHub Pages. Running them against `next dev` was
 * unreliable: its HMR websocket fails under Playwright and the page never
 * hydrates, so interactive assertions failed against a page whose handlers
 * were never attached.
 *
 * PAGES_BASE_PATH is set empty so routes are served from the server root
 * rather than under the Pages project subpath.
 */
export default defineConfig({
  testDir: "./e2e",
  // Layout assertions are deterministic; a retry would only mask flakiness.
  retries: 0,
  reporter: process.env.CI ? "list" : "line",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "off",
  },
  projects: [
    {
      name: "phone",
      testMatch: /phone-layout\.spec\.ts/,
      // Pixel 5 is Chromium-based, so the whole suite needs one browser
      // download instead of pulling WebKit in as well for CI.
      use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "desktop",
      testMatch: /desktop-layout\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command:
          "PAGES_BASE_PATH= npm run build:static && python3 -m http.server 3100 --bind 127.0.0.1 --directory out",
        url: "http://127.0.0.1:3100/",
        // Exporting ~670 mandal pages takes a while on a cold build.
        timeout: 600_000,
        reuseExistingServer: !process.env.CI,
      },
});
