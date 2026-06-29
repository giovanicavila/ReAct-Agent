import type { Page } from "playwright";

export async function clickSave(page: Page, isLast: boolean): Promise<boolean> {
  try {
    if (isLast) {
      await page.locator("button:has-text(\"Save and view summary\")").last().click({ timeout: 10000 });
    } else {
      await page.locator("button:has-text(\"Save and add service\")").last().click({ timeout: 10000 });
    }
    return true;
  } catch {
    try {
      await page.locator("button:has-text(\"Save and view summary\")").last().click({ timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }
}
