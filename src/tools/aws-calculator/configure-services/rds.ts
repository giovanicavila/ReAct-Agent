import type { Page } from "playwright";
import { register } from "./index.js";

register("Amazon RDS for PostgreSQL", async (page: Page) => {
  await page.waitForTimeout(1000);
});
