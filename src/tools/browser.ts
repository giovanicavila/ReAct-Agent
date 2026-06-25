import { tool } from "ai";
import { z } from "zod";

/**
 * Lazily imports Playwright so the module loads even if Playwright
 * isn't installed (fails only when the tool is actually called).
 */
async function getPage() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  });
  const page = await context.newPage();
  return { browser, page };
}

export const browseTool = tool({
  description:
    "Open a URL in a real browser and return its text content. Use this for JS-rendered pages, SPAs, or when search snippets aren't enough.",
  parameters: z.object({
    url: z.string().url().describe("The URL to open"),
    wait_for: z
      .enum(["load", "domcontentloaded", "networkidle"])
      .optional()
      .default("domcontentloaded")
      .describe("When to consider the page ready"),
    selector: z
      .string()
      .optional()
      .describe(
        "Optional CSS selector — if provided, only the matched element's text is returned"
      ),
  }),
  execute: async ({ url, wait_for, selector }) => {
    const { browser, page } = await getPage();

    try {
      await page.goto(url, { waitUntil: wait_for, timeout: 30_000 });

      let text: string;
      if (selector) {
        const el = page.locator(selector).first();
        text = await el.innerText({ timeout: 10_000 });
      } else {
        // Remove noise: scripts, styles, nav, footer
        text = await page.evaluate(() => {
          const remove = document.querySelectorAll(
            "script,style,nav,footer,header,aside,[aria-hidden='true']"
          );
          remove.forEach((el) => el.remove());
          return document.body?.innerText ?? "";
        });
      }

      // Trim to ~4k chars so we don't blow the context window
      const trimmed = text.replace(/\s{3,}/g, "\n\n").trim().slice(0, 4000);

      return { url, content: trimmed, truncated: text.length > 4000 };
    } finally {
      await browser.close();
    }
  },
});
