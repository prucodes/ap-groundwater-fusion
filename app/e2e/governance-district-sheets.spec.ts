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

test("the sheets add up to the State, each Telugu sheet matches its English one, and each fits its page", async ({ page }) => {
  test.setTimeout(300_000);
  const root = new URL(page.url() === "about:blank" ? "/" : page.url(), test.info().project.use.baseURL).pathname;
  await page.goto("/garden/");
  const stateDeeper = Number(await page.getByTestId("garden-deeper").innerText());
  const stateCompared = Number((await page.getByTestId("garden-hero").locator("h2").innerText()).match(/ of (\d+) droop/)![1]);
  const sheets: Array<{ route: string }> = await page.evaluate(async base => (await fetch(`${base}districts/sheets.json`)).json(), root);
  expect(sheets).toHaveLength(56);
  let deeper = 0, compared = 0;
  const english = new Map<string, string>();
  for (const { route } of sheets) {
    await page.goto(`/${route}/`);
    await page.evaluate(() => document.fonts.ready);
    const sheet = page.getByTestId("district-sheet");
    const counts = `${await sheet.getAttribute("data-deeper")}/${await sheet.getAttribute("data-compared")}`;
    if (route.endsWith("/te")) {
      expect(await sheet.getAttribute("data-lang")).toBe("te");
      expect(counts, `${route} says what its English sheet says`).toBe(english.get(route.replace(/\/te$/, "")));
    } else english.set(route, counts);
    if (!route.endsWith("/te")) deeper += Number(await sheet.getAttribute("data-deeper"));
    // Every mandal stands as a borewell in the strip.
    const drawn = Number(await page.getByTestId("district-sheet-bores").locator("svg").getAttribute("data-borewells"));
    expect(drawn, `${route} draws a borewell for each mandal`).toBeGreaterThanOrEqual(Number(await sheet.getAttribute("data-compared")));
    if (!route.endsWith("/te")) compared += Number(await sheet.getAttribute("data-compared"));
    const room = await sheet.evaluate(node => {
      const foot = node.lastElementChild!.getBoundingClientRect().top;
      return foot - Math.max(...[...node.children[1].querySelectorAll("*")].map(e => e.getBoundingClientRect().bottom));
    });
    expect(room, `${route} runs into its footer`).toBeGreaterThan(2);
  }
  expect(deeper).toBe(stateDeeper);
  expect(compared).toBe(stateCompared);
});
