import { expect, test, type Page } from "@playwright/test";

/* The Water Garden (/garden/): every mandal a plant, drooping where its water stands below
   its usual for the month. The picture is only worth having if it is the figure, so the
   plants drawn on each side must be exactly the counts the page prints, in every year. */

/** What the garden's canvases say they drew, summed over the rows. */
const drawn = (page: Page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll<HTMLCanvasElement>('[data-testid="water-garden"] canvas')];
  const sum = (name: string) => rows.reduce((total, row) => total + Number(row.getAttribute(`data-${name}`)), 0);
  return { rows: rows.length, deeper: sum("deeper"), shallower: sum("shallower"), steady: sum("steady"), none: sum("none") };
});
const grown = (page: Page) => expect(page.getByTestId("water-garden")).toHaveAttribute("data-ready", "done", { timeout: 20000 });

test("the garden drawn is the figure printed, this year and any other", async ({ page }) => {
  await page.goto("/garden/");
  const garden = page.getByTestId("water-garden");
  await garden.scrollIntoViewIfNeeded();
  await grown(page);
  const hero = Number(await page.getByTestId("garden-deeper").innerText());
  const counts = page.getByTestId("garden-counts");
  let plants = await drawn(page);
  expect(plants.deeper).toBe(hero);
  expect(plants.deeper).toBe(Number(await counts.getAttribute("data-deeper")));
  expect(plants.shallower).toBe(Number(await page.getByTestId("garden-shallower").innerText()));
  // Every mandal is a plant: the drawn plants add up to the State's mandals in the data.
  const data = await page.evaluate(async () => (await fetch(`${location.pathname.replace(/garden\/$/, "")}garden/data.json`)).json());
  expect(plants.deeper + plants.shallower + plants.steady + plants.none).toBe(data.plants.length);

  // Another year, from the slider: the picture and the counts move together.
  const years = page.getByTestId("garden-years");
  await years.fill("3");
  await expect(page.getByTestId("garden-year")).toHaveText(`${data.monthName} ${data.steps[3].year}`);
  plants = await drawn(page);
  expect(plants.deeper).toBe(Number(await counts.getAttribute("data-deeper")));
  expect(plants.shallower).toBe(Number(await counts.getAttribute("data-shallower")));
  expect(plants.steady).toBe(Number(await counts.getAttribute("data-steady")));
});

test("playing runs through every year and comes to rest on the latest", async ({ page }) => {
  await page.goto("/garden/");
  await page.getByTestId("water-garden").scrollIntoViewIfNeeded();
  await grown(page);
  const year = page.getByTestId("garden-year"), latest = await year.innerText();
  await page.getByTestId("garden-play").click();
  await expect(year).not.toHaveText(latest);
  await expect(page.getByTestId("garden-play")).toHaveAttribute("aria-pressed", "false", { timeout: 30000 });
  await expect(year).toHaveText(latest);
  const plants = await drawn(page);
  expect(plants.deeper).toBe(Number(await page.getByTestId("garden-deeper").innerText()));
});

test("a plant answers to the pointer and opens its mandal", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/garden/");
  const row = page.locator('[data-testid="water-garden"] canvas').first();
  await row.scrollIntoViewIfNeeded();
  await grown(page);
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3);
  const tip = page.getByTestId("garden-tip");
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(/m below ground|Not read/);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
  await expect(page).toHaveURL(/\/mandals\/ap-temp-mandal-/);
});

test("on a phone each region is its own row, inside the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/garden/");
  await page.getByTestId("water-garden").scrollIntoViewIfNeeded();
  await grown(page);
  expect((await drawn(page)).rows).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("with reduced motion the garden is there at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/garden/");
  await expect(page.getByTestId("water-garden")).toHaveAttribute("data-ready", "done", { timeout: 5000 });
});

test("the garden's film plays", async ({ page }) => {
  await page.goto("/garden/");
  const film = page.getByTestId("garden-film");
  await film.scrollIntoViewIfNeeded();
  const position = page.getByLabel("Film position");
  await page.getByRole("button", { name: /Play the water garden film/ }).click();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0.5);
  await expect(film).toContainText("Every mandal is a sorghum plant");
});
