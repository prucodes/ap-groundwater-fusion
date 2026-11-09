import { expect, test } from "@playwright/test";
test("a refiled mandal's old address forwards to its new one", async ({ page }) => {
  await page.goto("/mandals/ap-temp-mandal-ananthapuramu-atmakur-402/");
  await expect(page).toHaveURL(/ap-temp-mandal-sri-potti-sriramulu-nellore-atmakur-402\/$/);
});
