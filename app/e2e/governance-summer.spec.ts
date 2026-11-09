import { expect, test } from "@playwright/test";
import outlookJson from "../data/summer_outlook.json";
import priorityJson from "../data/summer_priority.json";

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

test("the drinking-water priority list leads with the first group, folds the rest and downloads whole", async ({ page }) => {
  const p = priorityJson as unknown as { summary: Record<"first" | "next" | "watch", { mandals: number }>; mandals: Array<{ band: string; mandal: string }> };
  await page.goto("/summer/");
  const section = page.getByTestId("summer-priority");
  await expect(section).toContainText(`${p.summary.first.mandals} mandals`);
  const first = p.mandals.filter(r => r.band === "first");
  await expect(page.getByTestId("priority-first").locator(":scope > li")).toHaveCount(Math.min(10, first.length));
  await expect(page.getByTestId("priority-first").locator(":scope > li").first()).toContainText(first[0].mandal);
  // The rest are on the page, folded.
  await expect(page.getByTestId("priority-first-rest").locator("tbody tr")).toHaveCount(Math.max(0, first.length - 10));
  await expect(page.getByTestId("priority-next").locator("tbody tr")).toHaveCount(p.summary.next.mandals);
  const download = page.waitForEvent("download");
  await section.getByRole("button", { name: /Download the full list/ }).click();
  const file = await (await download).path();
  const text = require("fs").readFileSync(file, "utf8") as string;
  const rows = text.split("\n").filter(line => line && !line.startsWith("#"));
  expect(rows.length - 1).toBe(p.mandals.length);
  expect(rows[1]).toContain(first[0].mandal);
});
