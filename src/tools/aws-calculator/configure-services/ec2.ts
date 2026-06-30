import type { Page } from "playwright";
import { register } from "./index.js";

register("Amazon EC2", async (page: Page) => {
  await page.waitForTimeout(1000);
  const instanceInput = page.locator("input[aria-label*=\"Number of instances\" i]").first();
  if (await instanceInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await instanceInput.fill("1");
  }
});
