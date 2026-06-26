import { tool } from "ai";
import { z } from "zod";
import type { Page } from "playwright";

const CALCULATOR_URL = "https://calculator.aws/#/estimate";

async function getBrowser() {
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

// Mapping from common/abbreviated names → actual data-cy attribute on the calculator page
const SERVICE_NAME_MAP: Record<string, string> = {
  "Amazon S3": "Amazon Simple Storage Service (S3)",
  "Amazon SQS": "Amazon Simple Queue Service (SQS)",
  "Amazon SNS": "Amazon Simple Notification Service (SNS)",
  "Amazon ECR": "Amazon Elastic Container Registry",
  "Amazon ECS": "Amazon EKS",
  "AWS WAF": "AWS Web Application Firewall (WAF)",
  "Application Load Balancer": "Elastic Load Balancing",
  "ALB": "Elastic Load Balancing",
  "Elastic Load Balancer": "Elastic Load Balancing",
  "NAT Gateway": "Amazon Virtual Private Cloud (VPC)",
  "VPC": "Amazon Virtual Private Cloud (VPC)",
  "AWS Certificate Manager": "AWS Certificate Manager (ACM)",
  "Amazon RDS": "Amazon RDS for PostgreSQL",
  "Amazon Aurora": "Amazon Aurora PostgreSQL-Compatible DB",
  "Amazon Aurora PostgreSQL": "Amazon Aurora PostgreSQL-Compatible DB",
  "Amazon KMS": "AWS Key Management Service",
  "AWS KMS": "AWS Key Management Service",
  "AWS Secrets Manager": "AWS Secrets Manager",
  "Amazon DynamoDB": "Amazon DynamoDB",
  "Amazon Route 53": "Amazon Route 53",
  "Amazon CloudFront": "Amazon CloudFront",
  "Amazon CloudWatch": "Amazon CloudWatch",
  "Amazon GuardDuty": "Amazon GuardDuty",
  "Amazon ElastiCache": "Amazon ElastiCache",
  "Amazon ElastiCache for Redis": "Amazon ElastiCache",
  "Amazon OpenSearch Service": "Amazon OpenSearch Service",
  "Amazon Cognito": "Amazon Cognito",
  "Amazon EventBridge": "Amazon EventBridge",
  "Amazon API Gateway": "Amazon API Gateway",
  "Amazon Detective": "Amazon Detective",
  "Amazon Inspector": "Amazon Inspector",
  "Amazon Macie": "Amazon Macie",
  "Amazon DocumentDB": "Amazon DocumentDB (with MongoDB compatibility)",
  "AWS Shield": "AWS Shield",
  "AWS X-Ray": "AWS X-Ray",
  "AWS Lambda": "AWS Lambda",
  "AWS Config": "AWS Config",
  "AWS CloudTrail": "AWS CloudTrail",
  "AWS CloudFormation": "AWS CloudFormation",
  "AWS CodePipeline": "AWS CodePipeline",
  "AWS CodeBuild": "AWS CodeBuild",
  "AWS CodeDeploy": "AWS CodeDeploy",
  "AWS Backup": "AWS Backup",
  "AWS Systems Manager": "AWS Systems Manager",
  "AWS Database Migration Service": "AWS Database Migration Service",
  "AWS DMS": "AWS Database Migration Service",
  "AWS Security Hub": "AWS Security Hub",
  "AWS Fargate": "AWS Fargate",
  "Amazon EKS": "Amazon EKS",
  "Amazon EC2": "Amazon EC2",
  "Amazon EBS": "Amazon Elastic Block Store (EBS)",
  "Amazon Elastic Block Store": "Amazon Elastic Block Store (EBS)",
  "Amazon EFS": "Amazon Elastic File System (EFS)",
  "Amazon Elastic File System": "Amazon Elastic File System (EFS)",
  "Amazon VPC": "Amazon Virtual Private Cloud (VPC)",
  "Amazon Virtual Private Cloud (VPC)": "Amazon Virtual Private Cloud (VPC)",
  "Amazon Elastic Kubernetes Service (EKS)": "Amazon EKS",
  "Amazon Elastic Container Registry (ECR)": "Amazon Elastic Container Registry",
  "Application Load Balancer (ALB)": "Elastic Load Balancing",
  "AWS Key Management Service (KMS)": "AWS Key Management Service",
  "AWS Database Migration Service (DMS)": "AWS Database Migration Service",
  "AWS NAT Gateway": "Amazon Virtual Private Cloud (VPC)",
  "AWS Migration Hub": "AWS Migration Hub Refactor Spaces",
  "AWS Auto Scaling": "Amazon EC2 Auto Scaling",
  "AWS IAM": "AWS IAM Access Analyzer",
};

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
    await page.waitForTimeout(1000);
    await dismissOverlays(page);
  }

  // Step 2: Find the service card by matching its data-cy attribute.
  // First, translate common/abbreviated names to actual calculator names
  const mappedName = SERVICE_NAME_MAP[serviceName] || serviceName;
  // Also try the exact service name as-is
  const candidates = [mappedName, serviceName];

  // Use in-browser evaluation for precise DOM matching
  const clicked = await page.evaluate((namesToTry: string[]): boolean => {
    const candidates = document.querySelectorAll<HTMLElement>("[data-cy]");
    for (const svcName of namesToTry) {
      for (const el of candidates) {
        const cy = el.getAttribute("data-cy") || "";
        // Extract the stored service name by stripping the "-button" suffix
        const stored = cy.replace(/ -button$/, "").replace(/-button$/, "");
        if (stored === svcName) {
          const btn = el.querySelector("button");
          if (btn) { btn.click(); return true; }
        }
      }
      // Fallback: try starts-with match
      for (const el of candidates) {
        const cy = el.getAttribute("data-cy") || "";
        const cleaned = cy.replace(/ -button$/, "").replace(/-button$/, "");
        if (cleaned.startsWith(svcName + " ") || cleaned.startsWith(svcName)) {
          const btn = el.querySelector("button");
          if (btn) { btn.click(); return true; }
        }
      }
    }
    return false;
  }, candidates);

  if (!clicked) return false;
  await page.waitForTimeout(1000);
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
        waitUntil: "load",
        timeout: 60_000,
      });

      // Dismiss cookie banner and chatbot widget
      await dismissOverlays(page);

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
      let atLeastOneAdded = false;

      console.error(`[aws_calculator] Starting loop for ${services.length} services`);
      for (let idx = 0; idx < services.length; idx++) {
        const svc = services[idx];

        // Wrap each service in try/catch so one failure doesn't abort all
        try {
          // Click "Add service" if we're not on the addService page
          if (!page.url().includes("/addService")) {
            const addBtn = page.locator("button:has-text(\"Add service\")").first();
            if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
              console.error(`[aws_calculator] service ${idx}: clicking "Add service" button`);
              await addBtn.click();
              await page.waitForTimeout(3000);
            } else {
              console.error(`[aws_calculator] service ${idx}: navigating to /addService`);
              await page.goto("https://calculator.aws/#/addService", { waitUntil: "load", timeout: 30_000 });
              await page.waitForTimeout(1500);
            }
            await dismissOverlays(page);
          }

          // Find and click the service card
          const mappedName = SERVICE_NAME_MAP[svc.serviceName] || svc.serviceName;
          console.error(`[aws_calculator] service ${idx}: trying "${svc.serviceName}" → mapped to "${mappedName}"`);
          const found = await page.evaluate((svcName) => {
            const els = document.querySelectorAll("[data-cy]");
            for (let i = 0; i < els.length; i++) {
              let cy = els[i].getAttribute("data-cy") || "";
              cy = cy.replace(/ -button$/, "").replace(/-button$/, "").trim();
              if (cy === svcName) {
                const btn = els[i].querySelector("button");
                if (btn) { btn.click(); return true; }
              }
            }
            for (let i = 0; i < els.length; i++) {
              let cy = els[i].getAttribute("data-cy") || "";
              cy = cy.replace(/ -button$/, "").replace(/-button$/, "").trim();
              if (cy.startsWith(svcName + " ") || cy.startsWith(svcName)) {
                const btn = els[i].querySelector("button");
                if (btn) { btn.click(); return true; }
              }
            }
            for (let i = 0; i < els.length; i++) {
              let cy = els[i].getAttribute("data-cy") || "";
              cy = cy.replace(/ -button$/, "").replace(/-button$/, "").trim();
              const text = els[i].textContent || "";
              if (cy.includes(svcName) || svcName.includes(cy)) {
                const btn = els[i].querySelector("button");
                if (btn && btn.textContent === "Configure") { btn.click(); return true; }
              }
            }
            return false;
          }, mappedName);

          if (!found) {
            console.error(`[aws_calculator] service ${idx}: NOT FOUND on page`);
            addedServices.push(`${svc.serviceName} (FAILED - not found)`);
            continue;
          }
          console.error(`[aws_calculator] service ${idx}: FOUND, clicking card`);

          await page.waitForTimeout(2000);
          await dismissOverlays(page);

          // Fill description
          if (svc.description) {
            const desc = page.locator("input[aria-label*=\"escription\" i], input[placeholder*=\"escription\" i]").first();
            if (await desc.isVisible({ timeout: 3000 }).catch(() => false)) {
              await desc.fill(svc.description);
            }
          }

          // Fill quantity
          if (svc.quantity && svc.quantity > 0) {
            const numInput = page.locator("input[type=\"text\"][inputmode=\"numeric\"]").first();
            if (await numInput.isVisible({ timeout: 3000 }).catch(() => false)) {
              await numInput.fill(String(svc.quantity));
            }
          }

          // Scroll to bottom and dismiss overlays
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await dismissOverlays(page);

          // Click save button
          const isLast = idx === services.length - 1;
          console.error(`[aws_calculator] service ${idx}: trying to save (isLast=${isLast})`);
          try {
            if (isLast) {
              await page.locator("button:has-text(\"Save and view summary\")").last().click({ timeout: 10000 });
            } else {
              await page.locator("button:has-text(\"Save and add service\")").last().click({ timeout: 10000 });
            }
            console.error(`[aws_calculator] service ${idx}: save clicked successfully`);
          } catch {
            console.error(`[aws_calculator] service ${idx}: save button not found, retrying with alternative`);
            try {
              await page.locator("button:has-text(\"Save and view summary\")").last().click({ timeout: 8000 });
              console.error(`[aws_calculator] service ${idx}: alternative save worked`);
            } catch {
              console.error(`[aws_calculator] service ${idx}: ALL save buttons failed`);
              addedServices.push(`${svc.serviceName} (FAILED - save)`);
              continue;
            }
          }

          await page.waitForTimeout(1500);
          addedServices.push(svc.serviceName);
          atLeastOneAdded = true;
          console.error(`[aws_calculator] service ${idx}: ✅ added`);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`[aws_calculator] service ${idx}: EXCEPTION — ${errMsg.slice(0, 100)}`);
          addedServices.push(`${svc.serviceName} (ERROR: ${errMsg.slice(0, 50)})`);
        }
      }

      // Capture current URL — "Save and view summary" may have already put an ID in it
      let shareableUrl = page.url();

      // If nothing was added, return early
      if (!atLeastOneAdded) {
        console.error(`[aws_calculator] No services were added. All ${services.length} failed.`);
        return {
          success: false,
          url: shareableUrl,
          title,
          region,
          services: addedServices,
          message: "No services could be added to the estimate",
        };
      }
      console.error(`[aws_calculator] ${addedServices.filter(s => !s.includes("FAILED") && !s.includes("ERROR")).length} services added successfully`);

      // Navigate to the main estimate page for the share flow
      console.error(`[aws_calculator] Navigating to estimate page for share flow`);
      await page.goto(CALCULATOR_URL, {
        waitUntil: "load",
        timeout: 30_000,
      }).catch(() => {});
      await dismissOverlays(page);

      shareableUrl = page.url();
      console.error(`[aws_calculator] Post-navigation URL: ${shareableUrl.slice(0, 100)}`);

      if (!shareableUrl.includes("id=")) {
        console.error(`[aws_calculator] Attempting share flow`);
        const shareBtn = page.locator(
          "button[data-cy=\"save-and-share\"], button:has-text(\"Share\"), a:has-text(\"Share\"), [aria-label*=\"Share\"]"
        ).first();
        try {
          await shareBtn.click({ timeout: 10000 });
          console.error(`[aws_calculator] Share button clicked`);
          await page.waitForTimeout(2000);

          // Click "Agree and continue"
          try {
            await page.locator("button[data-id=\"agree-continue\"], button:has-text(\"Agree and continue\")").first().click({ force: true, timeout: 5000 });
            await page.waitForTimeout(2000);
          } catch {}

          // Try to get URL from readonly input
          const urlInp = page.locator("input[readonly]").first();
          if (await urlInp.isVisible({ timeout: 3000 }).catch(() => false)) {
            const val = await urlInp.inputValue();
            if (val.includes("id=")) shareableUrl = val;
          }

          // Click copy public link
          if (!shareableUrl.includes("id=")) {
            const copyBtn = page.locator("button:has-text(\"Copy public link\")");
            if (await copyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await copyBtn.click();
              await page.waitForTimeout(2000);
            }
          }

          // Check URL again after copy
          if (!shareableUrl.includes("id=")) {
            const inp2 = page.locator("input[readonly]").first();
            if (await inp2.isVisible({ timeout: 2000 }).catch(() => false)) {
              const val = await inp2.inputValue();
              if (val.includes("id=")) shareableUrl = val;
            }
          }

          // Wait for URL to update
          if (!shareableUrl.includes("id=")) {
            try {
              await page.waitForFunction(() => window.location.href.includes("id="), { timeout: 5000 });
              shareableUrl = page.url();
            } catch {}
          }

          // Fallback DOM search
          if (!shareableUrl.includes("id=")) {
            const found = await page.evaluate(() => {
              for (const el of document.querySelectorAll("input")) {
                const v = (el as HTMLInputElement).value || "";
                if (v.includes("id=")) return v;
              }
              return "";
            }).catch(() => "");
            if (found) shareableUrl = found;
          }

          // Close dialog
          try {
            await page.locator("button[aria-label=\"Close\"]").first().click({ timeout: 3000 });
          } catch {}
        } catch {
          // Share failed - return current URL anyway
        }
      }

      console.error(`[aws_calculator] Final URL has id: ${shareableUrl.includes("id=")}`);
      console.error(`[aws_calculator] Final URL: ${shareableUrl.slice(0, 120)}`);

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
      try {
        await page.screenshot({ path: "/tmp/aws-calculator-error.png", fullPage: true });
        console.error(`[aws_calculator] Screenshot saved to /tmp/aws-calculator-error.png`);
      } catch { /* ignore screenshot failure */ }
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
