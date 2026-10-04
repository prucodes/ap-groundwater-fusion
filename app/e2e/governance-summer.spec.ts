import { expect, test } from "@playwright/test";
import outlookJson from "../data/summer_outlook.json";

/* The summer drinking-water outlook: the counts the pipeline published, the map
   coloured from the same tiers, and the record it carries. */

const outlook = outlookJson as unknown as {
  summary: { beyond: number; dry: number; within: number; beyondDeep: number };
  mandals: Array<{ tier: "beyond" | "dry" | "within" } | null>;
  backtest: { typicalErrorM: number };
};
const onMap = (tier: string) => outlook.mandals.filter(r => r?.tier === tier).length;

test("the summer outlook states its counts, maps the same tiers and shows its record", async ({ page }) => {
  await page.goto("/summer/");
  // The brief states the headline; the band beneath carries the figures.
  await expect(page.getByTestId("page-brief")).toContainText(`${outlook.summary.beyondDeep} mandals`);
  await expect(page.getByTestId("summer-summary")).toContainText(`${outlook.summary.beyond} mandals`);
  await expect(page.getByTestId("summer-summary")).toContainText(`${outlook.summary.dry} mandals`);
  const map = page.getByTestId("summer-map");
  await expect(map).toHaveAttribute("data-ready", "true");
  // Beyond its record: dark when it would also be 10 m or more down, light when shallower.
  await expect(map.locator('path[data-key="x"], path[data-key="s"]')).toHaveCount(onMap("beyond"));
  await expect(map.locator('path[data-key="d"]')).toHaveCount(onMap("dry"));
  await expect(page.getByTestId("summer-row").first()).toBeVisible();
  await expect(page.getByTestId("summer-record")).toContainText(`${outlook.backtest.typicalErrorM.toFixed(1)} m`);
});

test("the summer outlook fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/summer/");
  await expect(page.getByTestId("summer-map")).toHaveAttribute("data-ready", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
