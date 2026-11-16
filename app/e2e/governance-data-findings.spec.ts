import { expect, test } from "@playwright/test";
import sensors from "../data/gw_sensors_state.json";

test("This Week's field list reaches every mandal its count names", async ({ page }) => {
  await page.goto("/changes/");
  const count = Number((await page.getByTestId("weekly-field-priority").locator("strong").innerText()).match(/\d+/)![0]);
  const rows = page.getByTestId("field-teams").locator("tbody tr");
  await expect(rows).toHaveCount(count);
});

test("the place pages say what the water table reads now from today's sensors", async ({ page }) => {
  for (const path of ["/mandals/", "/map/", "/"]) {
    await page.goto(path);
    const brief = page.getByTestId("page-brief");
    await expect(brief).toContainText(`${sensors.state.active.toLocaleString("en-IN")} reporting sensors`);
    await expect(brief).not.toContainText("1,746 wells");
  }
});
