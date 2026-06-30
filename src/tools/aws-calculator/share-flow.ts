import type { Page } from "playwright";
import { CALCULATOR_URL, dismissOverlays } from "./browser.js";

export async function getShareableUrl(page: Page): Promise<string> {
  let url = page.url();
  if (url.includes("id=")) return url;

  await page.goto(CALCULATOR_URL, { waitUntil: "load", timeout: 30_000 }).catch(() => {});
  await dismissOverlays(page);
  url = page.url();
  if (url.includes("id=")) return url;

  const shareBtn = page.locator(
    "button[data-cy=\"save-and-share\"], button:has-text(\"Share\"), a:has-text(\"Share\"), [aria-label*=\"Share\"]"
  ).first();
  try {
    await shareBtn.click({ timeout: 10000 });
    await page.waitForTimeout(2000);

    try {
      await page.locator("button[data-id=\"agree-continue\"], button:has-text(\"Agree and continue\")")
        .first().click({ force: true, timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch {}

    const readInput = page.locator("input[readonly]").first();
    if (await readInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const val = await readInput.inputValue();
      if (val.includes("id=")) return val;
    }

    const copyBtn = page.locator("button:has-text(\"Copy public link\")");
    if (await copyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyBtn.click();
      await page.waitForTimeout(2000);
    }

    const readInput2 = page.locator("input[readonly]").first();
    if (await readInput2.isVisible({ timeout: 2000 }).catch(() => false)) {
      const val = await readInput2.inputValue();
      if (val.includes("id=")) return val;
    }

    try {
      await page.waitForFunction(() => window.location.href.includes("id="), { timeout: 5000 });
      return page.url();
    } catch {}

    const found = await page.evaluate(() => {
      for (const el of document.querySelectorAll("input")) {
        const v = (el as HTMLInputElement).value || "";
        if (v.includes("id=")) return v;
      }
      return "";
    }).catch(() => "");
    if (found) return found;
  } catch {}

  return page.url();
}
