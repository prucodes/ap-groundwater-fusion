import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { WELCOME_STORAGE_KEY, WELCOME_STORAGE_VALUE } from "../lib/creator";

async function enter(page: Page, value = "PRUTHVI") {
  await page.getByLabel("Type PRUTHVI to enter").fill(value);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.locator(".shell")).toBeVisible();
}

async function continueIn(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".shell")).toBeVisible();
}

test("the home page asks for the creator name and remembers entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Every drop has a deeper story." })).toBeVisible();
  await expect(page.locator(".shell")).toHaveCount(0);
  await page.getByLabel("Type PRUTHVI to enter").fill("wrong");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByText("Type PRUTHVI to enter.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Type PRUTHVI to enter")).toBeFocused();
  await enter(page, "  PrUtHvI  ");
  await expect(page.locator("main.main")).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), WELCOME_STORAGE_KEY)).toBe(WELCOME_STORAGE_VALUE);
  await page.goto("/brief/");
  await expect(page.getByTestId("welcome")).toHaveCount(0);
});

test("a shared link shows the introduction once and opens its page with one tap", async ({ page }) => {
  await page.goto("/reports/?theme=dark#exports");
  await expect(page.getByRole("heading", { name: "Every drop has a deeper story." })).toBeVisible();
  await expect(page.locator(".shell")).toHaveCount(0);
  await expect(page.getByTestId("welcome")).toContainText("Pruthvi Yannam");
  await expect(page.getByLabel("Type PRUTHVI to enter")).toHaveCount(0);
  await expect(page.getByTestId("welcome")).toContainText("Reports");
  await continueIn(page);
  await expect(page).toHaveURL(/\/reports\/\?theme=dark#exports$/);
  await expect(page.locator("main.main")).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), WELCOME_STORAGE_KEY)).toBe(WELCOME_STORAGE_VALUE);
  await page.reload();
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.getByTestId("welcome")).toHaveCount(0);
  await page.locator(".creatorCredit").click();
  await expect(page.getByTestId("welcome")).toBeVisible();
  await page.getByRole("button", { name: "Return to your workspace" }).click();
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page).toHaveURL(/\/reports\/\?theme=dark#exports$/);
});

test("entry works when local storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage disabled", "SecurityError"); } });
  });
  await page.goto("/");
  await enter(page, "Pruthvi Yannam");
  await expect(page.locator(".appCreatorFooter")).toContainText("Pruthvi Yannam");
});

test("motion can be paused and reduced-motion visitors get a still entrance", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pause atmosphere animation" }).click();
  await expect(page.getByTestId("welcome")).toHaveAttribute("data-motion", "paused");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Resume atmosphere animation" })).toBeDisabled();
  const running = await page.getByTestId("welcome").evaluate(el => el.getAnimations({ subtree: true }).filter(animation => animation.playState === "running").length);
  expect(running).toBe(0);
  await enter(page);
});

test("entrance and export analytics never include entered text or report contents", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome")).toHaveAttribute("data-phase", "welcome");
  await expect.poll(() => page.evaluate(() => window.apgwCount?.pending?.map(row => row.name))).toContain("welcome/viewed");
  await page.getByLabel("Type PRUTHVI to enter").fill("unrelated-private-text");
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await enter(page);
  const typed = await page.evaluate(() => window.apgwCount?.pending);
  expect(typed?.filter(row => row.name === "welcome/entered")).toHaveLength(1);
  expect(JSON.stringify(typed)).not.toMatch(/unrelated-private-text|pruthvi/i);
  await page.evaluate(key => localStorage.removeItem(key), WELCOME_STORAGE_KEY);
  await page.goto("/reports/");
  await continueIn(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Mandal fusion table/ }).click();
  const file = await download;
  const text = await readFile((await file.path())!, "utf8");
  expect(text).toContain("Designed and built by Pruthvi Yannam");
  expect(text).toContain("APWRIMS");
  await expect.poll(() => page.evaluate(() => window.apgwCount?.pending?.map(row => row.name))).toContain("report/download");
  const pending = await page.evaluate(() => window.apgwCount?.pending);
  expect(pending?.filter(row => row.name === "welcome/continued")).toHaveLength(1);
  expect(pending?.filter(row => row.name === "app/opened")).toHaveLength(1);
  expect(JSON.stringify(pending)).not.toMatch(/unrelated-private-text|pruthvi|mandal_fusion/i);
});

test("privacy opt-out leaves entry usable and records no events", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { get: () => true }));
  await page.goto("/reports/");
  await continueIn(page);
  expect(await page.evaluate(() => window.apgwCount?.pending)).toBeUndefined();
  expect(await page.locator('script[src*="gc.zgo.at"]').count()).toBe(0);
});

test("server-rendered PDF links count their action without disclosing a filename", async ({ page }) => {
  await page.route("**/ap-water-intelligence-brief.pdf", route => route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\nTest download" }));
  await page.goto("/methodology/");
  await continueIn(page);
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("methodology-brief-pdf").click();
  await downloaded;
  const pending = await page.evaluate(() => window.apgwCount?.pending);
  expect(pending).toContainEqual({ name: "report/pdf-download", title: "Report: requested a PDF download" });
  expect(JSON.stringify(pending)).not.toContain("ap-water-intelligence-brief.pdf");
});

for (const width of [320, 375, 768, 1440]) {
  test(`entrance fits ${width}px and keeps its controls accessible`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Explore", exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const headingOverflow = await page.locator("#welcome-title").evaluate(el => el.scrollWidth - el.clientWidth);
    expect(headingOverflow).toBeLessThanOrEqual(1);
    const input = await page.getByLabel("Type PRUTHVI to enter").boundingBox();
    expect(input!.width).toBeGreaterThan(140);
    if (process.env.WELCOME_SCREENSHOTS) await page.screenshot({ path: `test-results/welcome-${width}.png`, fullPage: true, animations: "disabled" });
    await enter(page);
  });
}

test("a shared link to the brief fits a 320px phone and names the brief", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/brief/");
  await expect(page.getByTestId("welcome")).toContainText("Project brief");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await continueIn(page);
  await expect(page).toHaveURL(/\/brief\/$/);
});
