import { expect, test } from "@playwright/test";

/* Every screen in the menu says what it is, what it says now and what to do with it,
   and the menu lists the screens by group, without the four it retired. */

const PAGES = ["/", "/changes/", "/monsoon/", "/cyclones/", "/drought/", "/map/", "/summer/", "/rabi/", "/agriculture/", "/districts/", "/constituencies/", "/mandals/", "/compare/", "/methodology/"];

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
  for (const group of ["This week", "Watches", "Outlooks", "Farms", "Places"]) await expect(nav).toContainText(group);
  for (const retired of ["Review Queue", "Verify / Watchlist", "Executive Snapshot", "Reports", "Mandal Watchlist"]) {
    await expect(nav.getByRole("link", { name: retired, exact: true })).toHaveCount(0);
  }
  // Evidence and tools stay one click away, and open by themselves on one of their pages.
  await expect(nav.getByRole("link", { name: "Methodology", exact: true })).toHaveCount(0);
  await nav.getByRole("button", { name: /Evidence/ }).click();
  await expect(nav.getByRole("link", { name: "Methodology", exact: true })).toBeVisible();
  // The mandal watchlist is retired too: This Week's field-team register does its job, and its address leads there.
  await expect(nav.getByRole("link", { name: "Mandal Watchlist", exact: true })).toHaveCount(0);
});

/* What to take into a meeting is in the menu, open, not behind a link in a paragraph: the
   presenter and the district sheets. On the sheets page only its own entry lights, not Districts. */
test("the menu lists the presenter and the district sheets for meetings", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/districts/sheets/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toContainText("For meetings");
  const sheets = nav.getByRole("link", { name: "District sheets", exact: true });
  await expect(sheets).toBeVisible();
  // One entry lights: District sheets, not Districts as well (whose group stays folded here).
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(sheets).toHaveAttribute("aria-current", "page");
  const presenter = nav.getByRole("link", { name: "Presenter", exact: true });
  await expect(presenter).toBeVisible();
  await presenter.click();
  await expect(page).toHaveURL(/\/present\/?/);
  await expect(page.getByTestId("presenter")).toBeVisible();
});
