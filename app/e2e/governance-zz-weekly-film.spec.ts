import { expect, test } from "@playwright/test";

/* The week as a one-minute film (/weekly-film/): the page plays it live, and the same
   player, stepped frame by frame, is what each deploy records to MP4. */

test("This Week leads to the film, and the film plays", async ({ page }) => {
  await page.goto("/changes/");
  await page.getByTestId("film-link").click();
  await expect(page).toHaveURL(/\/weekly-film\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "This week in a minute" })).toBeVisible();
  const film = page.getByTestId("weekly-film");
  // Before play: the title frame, and nothing moving.
  await expect(film).toContainText(/Week of \d{1,2} [A-Z][a-z]+ \d{4}/);
  const position = page.getByLabel("Film position");
  await expect(position).toHaveValue("0");
  await page.getByRole("button", { name: /Play this week's film/ }).click();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0.5);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const held = await position.inputValue();
  await page.waitForTimeout(300);
  await expect(position).toHaveValue(held);
});

test("the film says only what the site says: its sensor figure is the digest's", async ({ page }) => {
  await page.goto("/weekly-film/");
  const transcript = page.getByTestId("film-transcript");
  await transcript.locator("summary").click();
  const lines = transcript.locator("ol > li");
  expect(await lines.count()).toBeGreaterThanOrEqual(5);
  // Every figure carries a source and a date.
  for (const line of await lines.all()) await expect(line.locator("small")).toContainText(/ · as of /);
  // The fold glides open: for a moment after the click its words are not rendered and
  // innerText reads "", so wait for the line as a reader sees it before taking its figures.
  const first = lines.first().locator("p"), sentence = /reads ([\d.]+) m below ground, against ([\d.]+) m/;
  await expect(first).toHaveText(sentence, { useInnerText: true });
  const median = (await first.innerText()).match(sentence);
  expect(median).not.toBeNull();
  await page.goto("/digest/");
  await expect(page.getByTestId("digest")).toContainText(`${median![1]} m`);
  await expect(page.getByTestId("digest")).toContainText(`${median![2]} m a year ago`);
});

for (const [shape, width, height] of [["landscape", 1920, 1080], ["square", 1080, 1080], ["portrait", 1080, 1920]] as const) {
  test(`recording, ${shape}: the frame fills the screen and any moment gives the same picture twice`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/weekly-film/?capture=${shape}`);
    await page.waitForFunction(() => window.filmReady === true);
    const stage = page.getByTestId("weekly-film").locator("> div").first();
    expect(await stage.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    // No page furniture in a recording: the stage is the top of the page everywhere.
    for (const [x, y] of [[10, 10], [width - 10, 10], [10, height - 10], [width / 2, height / 2]]) {
      expect(await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('[data-testid="weekly-film"]'), [x, y])).toBe(true);
    }
    const meta = await page.evaluate(() => window.filmMeta!);
    expect(meta.seconds).toBeGreaterThan(40);
    expect(meta.seconds).toBeLessThan(95);
    expect(meta.scenes[0].id).toBe("open");
    expect(meta.scenes[meta.scenes.length - 1].id).toBe("close");
    // A moment mid-scene twice is the same frame; a moment later, while a figure is still arriving, is not.
    const second = meta.scenes[1];
    const calls = await page.evaluate(start => [window.renderFilm!(start + 0.6), window.renderFilm!(start + 0.6), window.renderFilm!(start + 0.8)], second.start);
    expect(calls.map(call => call.same)).toEqual([false, true, false]);
    expect(calls[0].scene).toBe(second.id);
    // Held frames repeat, so the recorder can skip them: late in the scene nothing moves.
    const held = await page.evaluate(scene => [window.renderFilm!(scene.start + scene.seconds - 1.2), window.renderFilm!(scene.start + scene.seconds - 1.0)], second);
    expect(held[1].same).toBe(true);
  });
}

test("each film offers a copy to forward, and the copy is there", async ({ page, request }) => {
  await page.goto("/monsoon/");
  const links = page.getByTestId("film-download");
  expect(await links.count()).toBeGreaterThanOrEqual(2);
  for (const link of await links.all()) {
    const href = await link.getAttribute("href");
    expect(href).toMatch(/-share\.mp4$/);
    await expect(link).toHaveAttribute("download", /\.mp4$/);
    const head = await request.head(new URL(href!, page.url()).toString());
    expect(head.status()).toBe(200);
    expect(Number(head.headers()["content-length"])).toBeGreaterThan(500_000);
  }
});
