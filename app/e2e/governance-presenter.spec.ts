import { expect, test } from "@playwright/test";

/* The presenter (/present/): eight steps moved from the keyboard or a clicker. Its words
   name counts the visuals then show, so the countdown must land on the number it names. */

test("the presenter steps with the keys, and its countdown lands on the counts it names", async ({ page }) => {
  await page.goto("/present/");
  const deck = page.getByTestId("presenter"), title = page.getByTestId("presenter-title");
  await expect(page.getByTestId("water-garden")).toHaveAttribute("data-ready", "done", { timeout: 20000 });
  await expect(title).toContainText("mandals stand deeper than their usual");

  await page.keyboard.press("3");
  await expect(deck).toHaveAttribute("data-step", "3");
  await page.keyboard.press("ArrowRight");
  const bores = page.getByTestId("district-bores");
  await expect(bores).toHaveAttribute("data-month", /-05$/, { timeout: 20000 });
  const typical = Number((await title.textContent())!.match(/typical winter, (\d+) of/)![1]);
  await expect(bores).toHaveAttribute("data-dry", String(typical));

  await page.keyboard.press("PageDown");
  await expect(bores).toHaveAttribute("data-winter", "dry");
  const dry = Number((await title.textContent())!.match(/dry winter, (\d+)/)![1]);
  await expect(bores).toHaveAttribute("data-dry", String(dry));

  await page.keyboard.press("End");
  await expect(deck).toHaveAttribute("data-step", "8");
  await page.keyboard.press("ArrowLeft");
  await expect(deck).toHaveAttribute("data-step", "7");
  await expect(page).toHaveURL(/#7$/);
});
