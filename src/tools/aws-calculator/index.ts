import { tool } from "ai";
import { z } from "zod";
import { getBrowser, dismissOverlays, navigateToCalculator } from "./browser.js";
import { ensureOnAddServicePage, findAndClickServiceCard, fillDescription, fillQuantity } from "./add-service.js";
import { configureService } from "./configure-services/index.js";
import { clickSave } from "./save-service.js";
import { getShareableUrl } from "./share-flow.js";

import "./configure-services/ec2.js";
import "./configure-services/rds.js";
import "./configure-services/s3.js";

export const awsCalculatorTool = tool({
  description: `Navigate the AWS Pricing Calculator, add the specified services, and return a shareable estimate URL.`,
  parameters: z.object({
    services: z
      .array(
        z.object({
          serviceName: z.string().describe("Full AWS service name (e.g. 'Amazon EC2', 'Amazon RDS for PostgreSQL')"),
          quantity: z.number().optional().default(1).describe("Quantity"),
          description: z.string().optional().describe("Label for this service"),
        })
      )
      .min(1)
      .describe("AWS services to include in the estimate"),
    region: z.string().optional().default("US East (Ohio)").describe("AWS region"),
    title: z.string().optional().default("Architecture Estimate").describe("Estimate group name"),
  }),
  execute: async ({ services, region, title }) => {
    const { browser, page } = await getBrowser();

    try {
      await navigateToCalculator(page);

      const groupInput = page.locator("input[value=\"Group 1\"]").first();
      if (await groupInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await groupInput.fill(title);
      }

      const addedServices: string[] = [];
      let atLeastOneAdded = false;

      for (let idx = 0; idx < services.length; idx++) {
        const svc = services[idx];

        try {
          await ensureOnAddServicePage(page);

          const found = await findAndClickServiceCard(page, svc.serviceName);
          if (!found) {
            addedServices.push(`${svc.serviceName} (FAILED - not found)`);
            continue;
          }

          await page.waitForTimeout(2000);
          await dismissOverlays(page);

          if (svc.description) {
            await fillDescription(page, svc.description);
          }

          if (svc.quantity && svc.quantity > 0) {
            await fillQuantity(page, svc.quantity);
          }

          await configureService(page, svc.serviceName);

          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await dismissOverlays(page);

          const isLast = idx === services.length - 1;
          const saved = await clickSave(page, isLast);
          if (!saved) {
            addedServices.push(`${svc.serviceName} (FAILED - save)`);
            continue;
          }

          await page.waitForTimeout(1500);
          addedServices.push(svc.serviceName);
          atLeastOneAdded = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          addedServices.push(`${svc.serviceName} (ERROR: ${msg.slice(0, 50)})`);
        }
      }

      if (!atLeastOneAdded) {
        return {
          success: false,
          url: page.url(),
          title,
          region,
          services: addedServices,
          message: "No services could be added to the estimate",
        };
      }

      const shareableUrl = await getShareableUrl(page);

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
      } catch {}
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
