import { expect, test } from "@playwright/test";
import modelCard from "../data/model_card.json";

/* How the site works, as a film on the Methodology page: one drop of rain followed from the
   cloud to the page. It stands where the old five-box flow chart stood; before play, the
   whole picture is in view and reads as that chart. */

const TEST = modelCard.evaluations.temporalNowcast;
const KINDS = ["Measured", "Modelled", "Worked out from wells", "Context only", "What comes out"];

test("the film stands where the flow chart stood, and plays", async ({ page }) => {
  await page.goto("/methodology/");
  const card = page.getByTestId("method-film-card");
  await expect(card.locator("#method-film-title")).toHaveText("How it works");
  await expect(page.locator(".methodFlow, .methodNode")).toHaveCount(0);
  const film = page.getByTestId("methodology-film");
  // Before play: the title over the whole picture, with its seven numbered stops.
  await expect(film).toContainText("From rain to a reading");
  for (const stop of ["1", "4", "7"]) await expect(film.locator("svg text", { hasText: new RegExp(`^${stop}$`) })).toHaveCount(1);
  const position = card.getByLabel("Film position");
  await card.getByRole("button", { name: /Play the film of how this works/ }).click();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(0.5);
  await card.getByRole("button", { name: "Pause", exact: true }).click();
});

test("the seven steps are there in words, and quote the published accuracy", async ({ page }) => {
  await page.goto("/methodology/");
  const steps = page.getByTestId("method-steps");
  await steps.locator("summary").click();
  const lines = steps.locator("ol > li");
  await expect(lines).toHaveCount(7);
  await expect(lines.last()).toBeVisible();
  // Every step says what kind of knowledge it is, and where it comes from.
  for (const line of await lines.all()) {
    expect(KINDS).toContain(await line.locator("em").textContent());
    expect(((await line.locator("small").textContent()) ?? "").length).toBeGreaterThan(10);
  }
  // The model's line is the model card's: the same error, the same baseline, the same count.
  const model = lines.nth(5);
  await expect(model).toContainText(`${TEST.sampleCount.toLocaleString("en-IN")} readings`);
  await expect(model).toContainText(`off by ${TEST.model.maeM.toFixed(1)} m`);
  await expect(model).toContainText(`misses by ${TEST.lastReadingBaseline.maeM.toFixed(1)} m`);
  // And it does not flatter itself: the baseline quoted is the hard one, not last year's level.
  expect(TEST.lastReadingBaseline.maeM).toBeLessThan(TEST.baseline.maeM);
});

for (const [shape, width, height] of [["landscape", 1920, 1080], ["square", 1080, 1080], ["portrait", 1080, 1920]] as const) {
  test(`recording, ${shape}: seven stops between a title and a close, the same picture for the same moment`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/methodology/?capture=${shape}`);
    await page.waitForFunction(() => window.filmReady === true);
    const stage = page.locator("[data-film-stage]");
    expect(await stage.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    for (const [x, y] of [[10, 10], [width - 10, 10], [10, height - 10], [width / 2, height / 2]]) {
      expect(await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('[data-testid="methodology-film"]'), [x, y])).toBe(true);
    }
    const meta = await page.evaluate(() => window.filmMeta!);
    expect(meta.scenes.map(scene => scene.id)).toEqual(["open", "rain", "soil", "recharge", "well", "orbit", "model", "output", "close"]);
    expect(meta.seconds).toBeGreaterThan(40);
    expect(meta.seconds).toBeLessThan(75);
    // The site's scroll reveals keep out of a film: nothing on the stage is waiting to be drawn.
    expect(await stage.locator("[data-draw]").count()).toBe(0);
    // Mid-journey the camera is moving; held on a stop, nothing is.
    const well = meta.scenes[4];
    const moving = await page.evaluate(start => [window.renderFilm!(start + 0.5), window.renderFilm!(start + 0.5), window.renderFilm!(start + 0.9)], well.start);
    expect(moving.map(call => call.same)).toEqual([false, true, false]);
    const held = await page.evaluate(scene => [window.renderFilm!(scene.start + scene.seconds - 1.4), window.renderFilm!(scene.start + scene.seconds - 1.2)], well);
    expect(held[1].same).toBe(true);
    // At the model's stop the frame carries the model card's own figure.
    const model = meta.scenes[6];
    await page.evaluate(scene => window.renderFilm!(scene.start + scene.seconds - 1), model);
    await expect(stage).toContainText(`off by ${TEST.model.maeM.toFixed(1)} m`);
  });
}
