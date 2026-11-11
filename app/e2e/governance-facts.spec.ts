import { expect, test } from "@playwright/test";

test("In Numbers gives each figure with its source, date and a link", async ({ page }) => {
  await page.goto("/facts/");
  const facts = page.getByTestId("fact");
  expect(await facts.count()).toBeGreaterThanOrEqual(8);
  const first = facts.first();
  await expect(first).toContainText(/as of \w+ \d{4}/);
  await expect(first.getByRole("link", { name: "where it comes from →" })).toBeVisible();
  const id = await first.getAttribute("id");
  await expect(first.getByRole("link", { name: "Link to this fact" })).toHaveAttribute("href", `#${id}`);
  await expect(page.getByRole("navigation").getByRole("link", { name: "In Numbers" })).toBeVisible();
});

test("the field check lists the mandals to sound, with the forecast to test and a sheet to fill", async ({ page }) => {
  await page.goto("/field-report/");
  const check = page.getByTestId("field-check");
  await expect(check).toContainText(/\d+ mandals where a tape in a well would test our numbers/);
  await expect(check).toContainText("Nothing on this site has been checked on the ground yet");
  await expect(check).toContainText(/\d+ where the model is least sure/);
  const download = page.waitForEvent("download");
  await check.getByRole("button", { name: "Download the field sheet (CSV)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("ap-groundwater-field-check.csv");
  const text = require("fs").readFileSync(await file.path(), "utf8") as string;
  expect(text).toContain("depth_to_water_m,hours_since_pumping");
});
