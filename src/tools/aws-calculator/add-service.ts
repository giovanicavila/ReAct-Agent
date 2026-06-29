import type { Page } from "playwright";
import { SERVICE_NAME_MAP } from "./name-map.js";
import { dismissOverlays, navigateToAddService } from "./browser.js";

export async function findAndClickServiceCard(page: Page, serviceName: string): Promise<boolean> {
  const mappedName = SERVICE_NAME_MAP[serviceName] || serviceName;

  const found = await page.evaluate((name) => {
    const els = document.querySelectorAll("[data-cy]");
    for (let i = 0; i < els.length; i++) {
      let cy = els[i].getAttribute("data-cy") || "";
      cy = cy.replace(/ -button$/, "").replace(/-button$/, "").trim();
      if (cy === name) {
        const btn = els[i].querySelector("button");
        if (btn) { btn.click(); return true; }
      }
    }
    for (let i = 0; i < els.length; i++) {
      let cy = els[i].getAttribute("data-cy") || "";
      cy = cy.replace(/ -button$/, "").replace(/-button$/, "").trim();
      if (cy.startsWith(name + " ") || cy.startsWith(name)) {
        const btn = els[i].querySelector("button");
        if (btn) { btn.click(); return true; }
      }
    }
    for (let i = 0; i < els.length; i++) {
      let cy = els[i].getAttribute("data-cy") || "";
      cy = cy.replace(/ -button$/, "").replace(/-button$/, "").trim();
      if (cy.includes(name) || name.includes(cy)) {
        const btn = els[i].querySelector("button");
        if (btn && btn.textContent === "Configure") { btn.click(); return true; }
      }
    }
    return false;
  }, mappedName);

  return found;
}

export async function ensureOnAddServicePage(page: Page) {
  if (page.url().includes("/addService")) return;
  const addBtn = page.locator("button:has-text(\"Add service\")").first();
  if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await addBtn.click();
    await page.waitForTimeout(3000);
  } else {
    await navigateToAddService(page);
    await page.waitForTimeout(1500);
  }
  await dismissOverlays(page);
}

export async function fillDescription(page: Page, description: string) {
  const desc = page.locator("input[aria-label*=\"escription\" i], input[placeholder*=\"escription\" i]").first();
  if (await desc.isVisible({ timeout: 3000 }).catch(() => false)) {
    await desc.fill(description);
  }
}

export async function fillQuantity(page: Page, quantity: number) {
  const numInput = page.locator("input[type=\"text\"][inputmode=\"numeric\"]").first();
  if (await numInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await numInput.fill(String(quantity));
  }
}
