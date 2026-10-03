import { expect, test } from "@playwright/test";
import constituencies from "../data/constituencies.json";
import summary from "../data/gw_state_summary.json";

/* The State's own geography and well readings: constituencies, the State
   network's latest reading on mandal pages, and its statewide line. */

test("every constituency is on the map and in the table, and a click explains it", async ({ page }) => {
  await page.goto("/constituencies/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Constituencies");
  const drawn = constituencies.constituencies.filter(c => c.rings && c.rings.length).length;
  await expect(page.getByTestId("constituency-map").locator("path[role=\"button\"]")).toHaveCount(drawn);
  await expect(page.getByTestId("constituency-table").locator("tbody tr")).toHaveCount(constituencies.constituencies.length);
  const rows = page.getByTestId("constituency-table").locator("tbody tr");
  // Serial numbers run 1..N in the table's current order.
  await expect(rows.first().locator("td").first()).toHaveText("1");
  await expect(rows.last().locator("td").first()).toHaveText(String(constituencies.constituencies.length));
  const first = rows.first();
  const name = (await first.locator("td").nth(1).innerText()).trim();
  await first.click();
  await expect(page.getByTestId("constituency-panel")).toContainText(name);
  await expect(page.getByTestId("constituency-panel")).toContainText("mandals:");
  await page.getByRole("button", { name: "Fall since May (State wells)" }).click();
  await expect(page.getByTestId("constituency-map")).toHaveAttribute("aria-label", /fall since may/i);
  await expect(page.locator("main")).toContainText("not a declaration");
});

test("a mandal page shows the State network's latest reading and its constituency", async ({ page }) => {
  await page.goto("/mandals/ap-temp-mandal-kurnool-alur-512/");
  const card = page.getByRole("region", { name: /latest reading/ });
  await expect(card.getByTestId("state-reading")).toContainText("Since May");
  await expect(card).toContainText("not merged into it");
  await expect(card).toContainText("Assembly constituency");
});

test("the overview and monsoon page carry the State wells line", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("state-network-cell")).toContainText(`${summary.state!.stationsTotal.toLocaleString("en-US")} stations`);
  await page.goto("/monsoon/");
  await expect(page.getByTestId("state-network-stat")).toContainText(`of ${summary.summary.withChange} mandals deeper than in May`);
});

test("each constituency has a one-page brief that prints on its own", async ({ page }) => {
  const seat = constituencies.constituencies.find(c => c.code === "120")!;
  await page.goto("/constituencies/");
  await page.getByTestId("constituency-table").getByText(seat.ac, { exact: true }).click();
  await page.getByRole("link", { name: "Open the one-page brief →" }).click();
  await expect(page).toHaveURL(/\/constituencies\/120\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(seat.ac);
  await expect(page.getByRole("region", { name: "Headline figures" })).toContainText("Groundwater in stress");
  await expect(page.getByRole("region", { name: "What the figures say" })).toContainText("assessed mandal");
  await expect(page.locator("article table tbody tr")).toHaveCount(seat.mandals.length);
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  await expect(page.locator("article footer")).toContainText("not a declaration");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
  await expect(page.locator("article h1")).toBeVisible();
  await expect(page.locator(".mobileBar")).toBeHidden();
});
