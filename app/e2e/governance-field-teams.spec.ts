import { expect, test } from "@playwright/test";

/* This Week: where field teams would learn most. Mandals where four or more of
   six published signals point to stress, shown signal by signal, for
   verification visits; never a ranking of need. */

test("the field-teams list shows each signal, most agreement first, and says what it is not", async ({ page }) => {
  await page.goto("/changes/");
  const section = page.getByTestId("field-teams");
  await expect(section).toContainText("not a ranking of need, an allocation or a declaration");
  await expect(section).toContainText("The signals are not all independent");
  const rows = section.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(15);
  let previous = 7;
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    await expect(row.locator("td[data-state]")).toHaveCount(6);
    const lit = await row.locator('td[data-state="yes"]').count();
    expect(lit).toBeGreaterThanOrEqual(4);
    expect(lit).toBeLessThanOrEqual(previous);
    await expect(row.locator("td").nth(6)).toContainText(String(lit));
    previous = lit;
  }
  // Every mandal with a groundwater record links to it.
  const link = rows.first().locator("th a");
  if (await link.count()) {
    await link.click();
    await expect(page).toHaveURL(/\/mandals\//);
  }
});

test("the field-teams list fits a phone without the page scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/changes/");
  await page.getByTestId("field-teams").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
