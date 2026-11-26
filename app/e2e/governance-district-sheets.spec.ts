import { expect, test } from "@playwright/test";

/* One A4 sheet per district for its Collector (/districts/<slug>/sheet/). The sheets are
   only worth handing out if they agree with the State: their counts must add up to the
   Water Garden's, and every sheet must fit its page (the page hides what spills over). */

test("the Districts page leads to a sheet for every district", async ({ page }) => {
  await page.goto("/districts/");
  await page.getByTestId("district-sheets-link").click();
  await expect(page).toHaveURL(/\/districts\/sheets\/$/);
  const cards = page.getByTestId("district-sheet-card");
  await expect(cards).toHaveCount(28);
  await cards.first().getByRole("link").first().click();
  await expect(page.getByTestId("district-sheet")).toBeVisible();
  await expect(page.getByTestId("district-sheet-pdf")).toHaveAttribute("href", /district-sheet\.pdf$/);
});

test("the sheets add up to the State, and each fits its page", async ({ page }) => {
  test.setTimeout(180_000);
  const root = new URL(page.url() === "about:blank" ? "/" : page.url(), test.info().project.use.baseURL).pathname;
  await page.goto("/garden/");
  const stateDeeper = Number(await page.getByTestId("garden-deeper").innerText());
  const stateCompared = Number((await page.getByTestId("garden-hero").locator("h2").innerText()).match(/ of (\d+) droop/)![1]);
  const sheets: Array<{ route: string }> = await page.evaluate(async base => (await fetch(`${base}districts/sheets.json`)).json(), root);
  expect(sheets).toHaveLength(28);
  let deeper = 0, compared = 0;
  for (const { route } of sheets) {
    await page.goto(`/${route}/`);
    const sheet = page.getByTestId("district-sheet");
    deeper += Number(await sheet.getAttribute("data-deeper"));
    compared += Number(await sheet.getAttribute("data-compared"));
    const room = await sheet.evaluate(node => {
      const foot = node.lastElementChild!.getBoundingClientRect().top;
      return foot - Math.max(...[...node.children[1].querySelectorAll("*")].map(e => e.getBoundingClientRect().bottom));
    });
    expect(room, `${route} runs into its footer`).toBeGreaterThan(2);
  }
  expect(deeper).toBe(stateDeeper);
  expect(compared).toBe(stateCompared);
});
