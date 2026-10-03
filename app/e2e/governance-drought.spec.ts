import { expect, test } from "@playwright/test";
import summary from "../data/drought_watch_summary.json";

/* The Drought Watch reads every mandal against the national drought manual.
   Its numbers must be the published file's, its rules visible, and it must never
   read as a declaration. */

const state = summary.state;

test("the drought watch leads with the manual's numbers and its deadline", async ({ page }) => {
  await page.goto("/drought/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Drought Watch");
  await expect(page.getByTestId("drought-trigger1")).toContainText(String(state.trigger1));
  const command = page.getByRole("region", { name: /Manual for Drought Management/ });
  await expect(command).toContainText(`${state.counts.severe} read severe`);
  await expect(command).toContainText("not a declaration");
  await expect(command).toContainText("31 Oct");
  // The day count is recomputed in the browser, so it is a number, never blank.
  expect(Number(await page.getByTestId("drought-days").textContent())).toBeGreaterThanOrEqual(0);
});

test("the light-soil rule changes the map's counts and the matrix explains a mandal", async ({ page }) => {
  await page.goto("/drought/");
  const legend = page.getByTestId("drought-map").locator("xpath=..");
  await expect(legend).toContainText(`No trigger ${state.counts.noTrigger}`);
  await page.getByRole("button", { name: "3 weeks (light soils)" }).click();
  await expect(legend).toContainText(`No trigger ${state.countsLight.noTrigger}`);
  const matrix = page.getByRole("article", { name: /drought manual check/ });
  await expect(matrix).toContainText("Step 1 · Trigger 1");
  await expect(matrix).toContainText("Table 3.11");
  await expect(matrix).toContainText("Table 3.4");
  await page.getByRole("button", { name: "Vegetation (VCI)" }).click();
  await expect(page.getByTestId("drought-map")).toHaveAttribute("aria-label", /vegetation/i);
});

test("every district appears in the matrix and the method lists its interpretations", async ({ page }) => {
  await page.goto("/drought/");
  const table = page.getByTestId("drought-district-matrix");
  await expect(table.locator("tbody tr")).toHaveCount(summary.districts.length);
  const method = page.getByRole("region", { name: "How this page reads the manual" });
  await expect(method).toContainText("read as 'moderate or worse'");
  await expect(method).toContainText("Not a declaration");
});

test("a mandal page carries its own drought manual check", async ({ page }) => {
  await page.goto("/mandals/ap-temp-mandal-kurnool-alur-512/");
  const card = page.getByRole("region", { name: /Drought manual check/ });
  await expect(card).toContainText("Step 2 · Trigger 2");
  await expect(card.getByTestId("drought-verdict")).not.toBeEmpty();
  await expect(card).toContainText("not a declaration");
});

test("the sidebar and the overview lead to the drought watch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Drought Watch/ }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "This water year so far" })).toContainText(String(state.trigger1));
});
