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
  await expect(page.getByTestId("garden-play")).toHaveAttribute("aria-pressed", "false", { timeout: 45000 });
  await expect(year).toHaveText(latest);
  const plants = await drawn(page);
  expect(plants.deeper).toBe(Number(await page.getByTestId("garden-deeper").innerText()));
});

test("each October names the monsoon before it, and the rain falls between years", async ({ page }) => {
  await page.goto("/garden/");
  await page.getByTestId("water-garden").scrollIntoViewIfNeeded();
  await grown(page);
  const data = await page.evaluate(async () => (await fetch(`${location.pathname.replace(/garden\/$/, "")}garden/data.json`)).json());
  const last = data.steps[data.steps.length - 1], season = data.rain[last.index];
  expect(data.rain).toHaveLength(data.years.length);
  await expect(page.getByTestId("garden-monsoon")).toContainText(`Monsoon ${season.year}`);
  // Playing, each year's monsoon falls before its October arrives.
  await page.getByTestId("garden-play").click();
  await expect(page.getByTestId("garden-year")).toHaveText(/^Monsoon \d{4}$/, { timeout: 5000 });
  await page.getByTestId("garden-play").click();
});

test("a district close up as borewells: one per mandal, the dry and trickling ones its mandals below usual", async ({ page }) => {
  await page.goto("/garden/");
  await page.getByTestId("water-garden").scrollIntoViewIfNeeded();
  await grown(page);
  const data = await page.evaluate(async () => (await fetch(`${location.pathname.replace(/garden\/$/, "")}garden/data.json`)).json());
  const bores = page.getByTestId("district-bores");
  const below = (district: string, index: number) => data.plants.filter((p: any[]) => p[2] === district && p[4][index] !== null && p[5] !== null && Math.round((p[4][index] - p[5]) * 100) > 10).length;
  const check = async (index: number) => {
    const district = (await bores.getAttribute("data-district"))!;
    await expect(bores.locator("svg[data-borewells]")).toHaveAttribute("data-borewells", String(data.plants.filter((p: any[]) => p[2] === district).length));
    expect(Number(await bores.getAttribute("data-dry")) + Number(await bores.getAttribute("data-trickle"))).toBe(below(district, index));
  };
  const last = data.steps[data.steps.length - 1];
  await check(last.index);
  await page.getByTestId("district-bores-pick").selectOption("Sri Sathya Sai");
  await expect(bores).toHaveAttribute("data-district", "Sri Sathya Sai");
  await check(last.index);
  // The borewells follow the field's year.
  await page.getByTestId("garden-years").fill("8");
  await expect(page.getByTestId("garden-year")).toHaveText(`${data.monthName} ${data.steps[8].year}`);
  await check(data.steps[8].index);
});

test("the summer countdown ends in May on the Summer Outlook's own count, typical and dry winter", async ({ page }) => {
  await page.goto("/garden/");
  await page.getByTestId("water-garden").scrollIntoViewIfNeeded();
  await grown(page);
  const data = await page.evaluate(async () => (await fetch(`${location.pathname.replace(/garden\/$/, "")}garden/data.json`)).json());
  const bores = page.getByTestId("district-bores");
  await page.getByTestId("district-bores-pick").selectOption("Sri Sathya Sai");
  await page.getByTestId("district-bores-countdown").click();
  await expect(bores).toHaveAttribute("data-mode", "summer");
  await expect(bores).toHaveAttribute("data-month", data.summer.anchor);
  await page.getByTestId("district-bores-month").fill(String(data.summer.months.length));
  await expect(bores).toHaveAttribute("data-month", data.summer.target);
  // Past the record in May: the outlook's "beyond" mandals on a typical winter, and with its "dry" ones on a dry winter.
  const past = (w: number) => data.plants.filter((p: any[], i: number) => p[2] === "Sri Sathya Sai" && data.summer.plants[i] && data.summer.plants[i][w].at(-1) > data.summer.plants[i][0]).length;
  await expect(bores).toHaveAttribute("data-dry", String(past(1)));
  await page.getByTestId("district-bores-dry").click();
  await expect(bores).toHaveAttribute("data-dry", String(past(2)));
  expect(past(2)).toBeGreaterThanOrEqual(past(1));
});

test("a plant answers to the pointer, zooms to its district's borewells, and its bore opens the mandal", async ({ page }) => {
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
  const district = (await tip.locator("small").first().innerText()).trim();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
  const bores = page.getByTestId("district-bores");
  await expect(bores).toHaveAttribute("data-district", district);
  const picked = bores.locator("[data-selected] a");
  await expect(picked).toHaveCount(1);
  // Clicks wait until the zoom has finished: during a view transition the page is a picture.
  await expect(page.getByTestId("water-garden")).not.toHaveAttribute("data-zooming", /.*/);
  // The bore itself keeps moving (its water runs), so click its name, which stands still.
  await picked.locator("text").click({ force: true });
  await expect(page).toHaveURL(/\/mandals\/ap-temp-mandal-/);
  await expect(page.locator("h2", { hasText: "Mandal" }).first()).toBeVisible();
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
