import type { Page } from "playwright";
import { register } from "./index.js";

register("Amazon Simple Storage Service (S3)", async (page: Page) => {
  await page.waitForTimeout(1000);
});
