import { tool } from "ai";
import { z } from "zod";
import type { Page } from "playwright";

const CALCULATOR_URL = "https://calculator.aws/#/estimate";

async function getBrowser() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  return { browser, page };
}

async function dismissOverlays(page: Page) {
  // Accept cookie banner if visible
  try {
    await page.locator("button:has-text(\"Accept\")").first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
  } catch {
    // No cookie banner or already accepted
  }
  // Hide the AWS chatbot widget that intercepts pointer events
  await page.evaluate(() => {
    const chat = document.getElementById("chatbot-wrapper");
    if (chat) {
      chat.style.display = "none";
      chat.style.pointerEvents = "none";
    }
  }).catch(() => {});
}

async function addService(
  page: Page,
  serviceName: string,
  quantity?: number,
  description?: string
): Promise<boolean> {
  // Accept cookies in case a new banner appeared after page navigation
  await dismissOverlays(page);

  // Step 1: Navigate to the add service page if not already there
  if (!page.url().includes("/addService")) {
    const addSvcBtn = page.locator("button:has-text(\"Add service\")").first();
    if (!(await addSvcBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      return false;
    }
    await addSvcBtn.click();
    await page.waitForTimeout(3000);
    await dismissOverlays(page);
  }

  // Step 2: Find the service card by matching its data-cy attribute.
  // AWS Calculator uses `data-cy="${serviceName}-button"` or `data-cy="${serviceName} -button"`.
  // Use in-browser evaluation for precise name matching (avoids substring collisions like
  // "Amazon EC2" matching "Windows Server and SQL Server on Amazon EC2").
  const clicked = await page.evaluate((svcName: string): boolean => {
    const candidates = document.querySelectorAll<HTMLElement>("[data-cy]");
    for (const el of candidates) {
      const cy = el.getAttribute("data-cy") || "";
      // Extract the stored service name by stripping the "-button" suffix
      const stored = cy.replace(/ -button$/, "").replace(/-button$/, "");
      if (stored === svcName) {
        const btn = el.querySelector("button");
        if (btn) { btn.click(); return true; }
      }
    }
    // Fallback: try starts-with match (handles sub-services like "Amazon RDS for PostgreSQL")
    for (const el of candidates) {
      const cy = el.getAttribute("data-cy") || "";
      const cleaned = cy.replace(/ -button$/, "").replace(/-button$/, "");
      if (cleaned.startsWith(svcName + " ") || cleaned.startsWith(svcName)) {
        const btn = el.querySelector("button");
        if (btn) { btn.click(); return true; }
      }
    }
    return false;
  }, serviceName);

  if (!clicked) return false;
  await page.waitForTimeout(3000);
  await dismissOverlays(page);

  // Step 3: Fill config form
  if (description) {
    const descInput = page
      .locator("input[aria-label*=\"escription\" i], input[placeholder*=\"escription\" i]")
      .first();
    if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await descInput.fill(description);
    }
  }

  if (quantity && quantity > 0) {
    // Try to find a quantity/number input (not the description input)
    const numberInputs = page.locator(
      "input[type=\"text\"][inputmode=\"numeric\"], input[aria-label*=\"Number\" i], input[aria-label*=\"Quantity\" i], input[aria-label*=\"Count\" i], input[aria-label*=\"amount\" i]"
    );
    const numCount = await numberInputs.count();
    for (let i = 0; i < numCount; i++) {
      const inp = numberInputs.nth(i);
      const label = (await inp.getAttribute("aria-label")) || "";
      const placeholder = (await inp.getAttribute("placeholder")) || "";
      const id = (await inp.getAttribute("id")) || "";

      const labelEl = page.locator(`label[for="${id}"]`);
      const labelText = await labelEl.innerText().catch(() => "");

      const contextText = `${label} ${placeholder} ${labelText}`.toLowerCase();
      if (
        contextText.includes("number") ||
        contextText.includes("quantity") ||
        contextText.includes("count") ||
        contextText.includes("amount") ||
        contextText.includes("server") ||
        contextText.includes("instance") ||
        contextText.includes("unit")
      ) {
        await inp.fill(String(quantity));
        break;
      }
    }

    // Fallback: fill first relevant text input
    if (numCount === 0) {
      const allTextInputs = page.locator(
        "input[type=\"text\"]:visible, input:not([type]):visible"
      );
      const allCount = await allTextInputs.count();
      for (let i = 0; i < allCount; i++) {
        const inp = allTextInputs.nth(i);
        const ph = await inp.getAttribute("placeholder");
        if (ph && /\d/.test(ph || "")) {
          await inp.fill(String(quantity));
          break;
        }
      }
    }
  }

  return true;
}

export const awsCalculatorTool = tool({
  description: `Navigate the AWS Pricing Calculator, add the specified services, and return a shareable estimate URL. Use this when the user wants to estimate AWS architecture costs.`,
  parameters: z.object({
    services: z
      .array(
        z.object({
          serviceName: z
            .string()
            .describe(
              "Full AWS service name (e.g. 'Amazon EC2', 'Amazon RDS for PostgreSQL')"
            ),
          quantity: z
            .number()
            .optional()
            .default(1)
            .describe("Quantity"),
          description: z
            .string()
            .optional()
            .describe("Label for this service"),
        })
      )
      .min(1)
      .describe("AWS services to include in the estimate"),
    region: z
      .string()
      .optional()
      .default("US East (Ohio)")
      .describe("AWS region"),
    title: z
      .string()
      .optional()
      .default("Architecture Estimate")
      .describe("Estimate group name"),
  }),
  execute: async ({ services, region, title }) => {
    const { browser, page } = await getBrowser();

    try {
      // Navigate to the calculator
      await page.goto(CALCULATOR_URL, {
        waitUntil: "networkidle",
        timeout: 60_000,
      });
      await page.waitForTimeout(3000);

      // Dismiss cookie banner and chatbot widget
      await dismissOverlays(page);
      await page.waitForTimeout(1000);

      // Set the region on the add service page if needed
      // (Each service config page also has a region selector)

      // Rename the default group
      const groupInput = page
        .locator("input[value=\"Group 1\"]")
        .first();
      if (await groupInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await groupInput.fill(title);
      }

      const addedServices: string[] = [];

      for (let idx = 0; idx < services.length; idx++) {
        const svc = services[idx];
        const ok = await addService(
          page,
          svc.serviceName,
          svc.quantity,
          svc.description
        );

        if (!ok) {
          // Try navigating directly to addService page and retry
          await page.goto(`${CALCULATOR_URL}`, {
            waitUntil: "networkidle",
          });
          await page.waitForTimeout(2000);
          await dismissOverlays(page);
          const retryOk = await addService(
            page,
            svc.serviceName,
            svc.quantity,
            svc.description
          );
          if (!retryOk) {
            addedServices.push(`${svc.serviceName} (FAILED - not found)`);
            continue;
          }
        }

        // Dismiss any cookie banner that appeared after navigating to the config page
        await dismissOverlays(page);

        // Scroll to the bottom so the save buttons are in view, then dismiss overlays
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
        await dismissOverlays(page);

        // Save the service (use last button instance — top buttons may have zero size)
        const saveAndAdd = page
          .locator("button:has-text(\"Save and add service\")")
          .last();
        const saveAndSummary = page
          .locator("button:has-text(\"Save and view summary\")")
          .last();

        const isLast = idx === services.length - 1;

        if (isLast) {
          try {
            await saveAndSummary.click({ timeout: 10000 });
          } catch {
            try {
              await saveAndAdd.click({ timeout: 8000 });
            } catch {
              // neither button found
            }
          }
        } else {
          try {
            await saveAndAdd.click({ timeout: 10000 });
          } catch {
            try {
              await saveAndSummary.click({ timeout: 8000 });
            } catch {
              // neither button found
            }
          }
        }

        await page.waitForTimeout(3000);
        addedServices.push(svc.serviceName);

        // Navigate back to the main estimate page for the next service
        if (!isLast) {
          await page.goto(CALCULATOR_URL, {
            waitUntil: "networkidle",
            timeout: 30_000,
          });
          await page.waitForTimeout(2000);
          await dismissOverlays(page);
        }
      }

      // Capture current URL — "Save and view summary" may have already put an ID in it
      let shareableUrl = page.url();

      // If the current URL doesn't have an ID yet, navigate to the main estimate page
      // and try the Share flow to generate a public link
      if (!shareableUrl.includes("id=")) {
        await page.goto(CALCULATOR_URL, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        await page.waitForTimeout(3000);
        await dismissOverlays(page);

        const shareBtn = page.locator(
          "button[data-cy=\"save-and-share\"], button:has-text(\"Share\"), a:has-text(\"Share\"), [aria-label*=\"Share\"]"
        ).first();
        try {
          await shareBtn.click({ timeout: 10000 });

          // Wait for the share modal/dialog to appear
          await page.waitForTimeout(3000);

          // Step 1: Click "Agree and continue" (force to bypass chatbot overlay)
          const agreeBtn = page.locator(
            "button[data-id=\"agree-continue\"], button[aria-label*=\"Agree and continue\"], button:has-text(\"Agree and continue\")"
          ).first();
          try {
            await agreeBtn.click({ force: true, timeout: 8000 });
            await page.waitForTimeout(3000);
          } catch {
            // Agree button not found or not clickable
          }

          // Step 2: After agreeing, the shareable URL input might already be visible
          // Check for a readonly input containing a URL (common AWS pattern)
          const urlInput = page.locator("input[readonly]").first();
          if (
            await urlInput.isVisible({ timeout: 3000 }).catch(() => false)
          ) {
            const val = await urlInput.inputValue();
            if (val.includes("calculator.aws") || val.includes("id=")) {
              shareableUrl = val;
            }
          }

          // Step 3: Click "Copy public link" to generate/copy the URL
          if (!shareableUrl.includes("id=")) {
            const copyBtn = page.locator(
              "button.clipboard-button, button[aria-label*=\"Copy public link\"], button:has-text(\"Copy public link\")"
            );
            if (
              await copyBtn.isVisible({ timeout: 5000 }).catch(() => false)
            ) {
              await copyBtn.click();
              await page.waitForTimeout(3000);
            }
          }

          // Step 4: Try reading the URL input again after copy
          if (!shareableUrl.includes("id=")) {
            const urlInput2 = page.locator("input[readonly]").first();
            if (
              await urlInput2.isVisible({ timeout: 2000 }).catch(() => false)
            ) {
              const val = await urlInput2.inputValue();
              if (val.includes("id=")) shareableUrl = val;
            }
          }

          // Step 5: Wait for the page URL to update with ?id=
          if (!shareableUrl.includes("id=")) {
            try {
              await page.waitForFunction(
                () => window.location.href.includes("id="),
                { timeout: 5000 }
              );
              shareableUrl = page.url();
            } catch {
              // URL didn't update
            }
          }

          // Step 6: Fallback — thorough DOM search
          if (!shareableUrl.includes("id=")) {
            const found = await page.evaluate(() => {
              const isValidUrl = (s: string) =>
                s.includes("calculator.aws") || s.startsWith("http");
              for (const el of document.querySelectorAll("input, textarea")) {
                const v = (el as HTMLInputElement).value || "";
                if (v.includes("id=") && isValidUrl(v)) return v;
              }
              for (const el of document.querySelectorAll("*")) {
                if (el.children.length === 0) {
                  const t = (el as HTMLElement).innerText || "";
                  if (t.includes("id=") && isValidUrl(t)) return t.trim();
                }
              }
              return "";
            }).catch(() => "");
            if (found) shareableUrl = found;
          }

          // Step 7: Fallback — clipboard
          if (!shareableUrl.includes("id=")) {
            try {
              const clip = await page.evaluate(() =>
                navigator.clipboard.readText().catch(() => "")
              );
              if (clip && clip.includes("id=")) shareableUrl = clip;
            } catch {
              // clipboard read failed
            }
          }

          // Close the share dialog
          const closeBtn = page
            .locator(
              "button[aria-label=\"Close\"], button:has-text(\"Close\"), [aria-label=\"Close\"]"
            )
            .first();
          if (
            await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)
          ) {
            await closeBtn.click();
          }
        } catch {
          // Share button not found or not clickable
        }
      }

      return {
        success: true,
        url: shareableUrl,
        title,
        region,
        services: addedServices,
        message: `Estimate "${title}" created with ${addedServices.length} service(s) in ${region}.`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        url: page.url(),
        services: [],
        message: `Failed to create estimate: ${msg}`,
        error: msg,
      };
    } finally {
      await browser.close();
    }
  },
});
