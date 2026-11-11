import { expect, test } from "@playwright/test";

test("a mandal page offers its season as one picture, in Telugu or English", async ({ page }) => {
  await page.goto("/mandals/ap-temp-mandal-markapuram-giddalur-371/");
  const card = page.getByTestId("mandal-share-card");
  await expect(card).toContainText("One picture for WhatsApp");
  await expect(card.getByRole("button", { name: "తెలుగు" })).toHaveAttribute("aria-pressed", "true");
  const preview = page.getByTestId("share-card-preview");
  await expect(preview).toHaveAttribute("src", /^data:image\/png;base64,/);
  const telugu = await preview.getAttribute("src");
  await card.getByRole("button", { name: "English" }).click();
  await expect(preview).toHaveAttribute("alt", /in English/);
  expect(await preview.getAttribute("src")).not.toBe(telugu);
  const download = page.waitForEvent("download");
  await page.getByTestId("share-card-save").click();
  expect((await download).suggestedFilename()).toBe("giddalur-groundwater.png");
});
