import type { Page } from "@playwright/test";

/** Open every folded context chapter (ChapterFold), as a reader choosing "Open the chapter" would. */
export async function openChapters(page: Page) {
  await page.locator("details.chapterFold").first().waitFor({ state: "attached" });
  await page.evaluate(() => document.querySelectorAll<HTMLDetailsElement>("details.chapterFold").forEach(fold => { fold.open = true; }));
}
