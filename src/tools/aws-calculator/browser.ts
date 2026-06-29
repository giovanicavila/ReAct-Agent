import type { Browser, Page } from "playwright";

const CALCULATOR_URL = "https://calculator.aws/#/estimate";

export async function getBrowser() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { browser, page };
}

export async function dismissOverlays(page: Page) {
  try {
    await page.locator("button:has-text(\"Accept\")").first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
  } catch {
  }
  await page.evaluate(() => {
    const chat = document.getElementById("chatbot-wrapper");
    if (chat) {
      chat.style.display = "none";
      chat.style.pointerEvents = "none";
    }
  }).catch(() => {});
}

export async function navigateToCalculator(page: Page) {
  await page.goto(CALCULATOR_URL, { waitUntil: "load", timeout: 60_000 });
  await dismissOverlays(page);
}

export async function navigateToAddService(page: Page) {
  await page.goto("https://calculator.aws/#/addService", { waitUntil: "load", timeout: 30_000 });
}

export { CALCULATOR_URL };
