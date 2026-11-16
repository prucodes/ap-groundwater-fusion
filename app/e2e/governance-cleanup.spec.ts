import { expect, test } from "@playwright/test";

test("overview links to the complete field register instead of a competing table", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "This week in four lines" })).toBeVisible();
  await expect(page.getByText("Top Mandals to Verify", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /Open the complete field-team register/ }).click();
  await expect(page).toHaveURL(/\/changes\/#field-teams$/);
});

test("methodology keeps technical methods available with working deep links", async ({ page }) => {
  await page.goto("/methodology/");
  await expect(page.locator("#method-field-week")).toBeHidden();
  await page.goto("/methodology/#method-field-week");
  await expect(page.locator("#method-field-week")).toBeVisible();
});

for (const [from, to] of [["alerts", "/changes/#field-teams"], ["snapshot", "/digest/"]]) {
  test(`${from} opens its current replacement`, async ({ page }) => {
    await page.goto(`/${from}/`);
    await expect(page).toHaveURL(to);
  });
}

test("the watchlist stays as the full, district-filterable mandal list", async ({ page }) => {
  await page.goto("/watchlist/");
  const district = await page.getByLabel("District", { exact: true }).locator("option").nth(1).getAttribute("value");
  await page.goto(`/watchlist/?district=${encodeURIComponent(district!)}`);
  await expect(page.getByLabel("District", { exact: true })).toHaveValue(district!);
  await expect(page.locator(".watchlistTableScroll tbody tr").first()).toBeVisible();
});
