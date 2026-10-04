import { expect, test } from "@playwright/test";

/* Every screen in the menu says what it is, what it says now and what to do with it,
   and the menu lists the screens by group, without the four it retired. */

const PAGES = ["/", "/changes/", "/monsoon/", "/drought/", "/map/", "/summer/", "/rabi/", "/agriculture/", "/districts/", "/constituencies/", "/mandals/", "/compare/", "/methodology/"];

for (const route of PAGES) {
  test(`${route} opens with its brief`, async ({ page }) => {
    await page.goto(route);
    const brief = page.getByTestId("page-brief");
    await expect(brief).toBeVisible();
    await expect(brief).toContainText("What this is");
    await expect(brief).toContainText("What to do with it");
  });
}

test("the menu is grouped by question and leaves out the retired screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/changes/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  for (const group of ["This week", "Water now", "Season ahead", "Farms", "Places"]) await expect(nav).toContainText(group);
  for (const retired of ["Review Queue", "Verify / Watchlist", "Executive Snapshot", "Reports"]) {
    await expect(nav.getByRole("link", { name: retired, exact: true })).toHaveCount(0);
  }
  // Evidence and tools stay one click away, and open by themselves on one of their pages.
  await expect(nav.getByRole("link", { name: "Methodology", exact: true })).toHaveCount(0);
  await nav.getByRole("button", { name: /Evidence/ }).click();
  await expect(nav.getByRole("link", { name: "Methodology", exact: true })).toBeVisible();
  await page.goto("/watchlist/");
  await expect(page.getByTestId("page-brief")).toContainText("field-teams list");
});
