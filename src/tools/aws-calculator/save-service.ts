import type { Page } from "playwright";

const SAVE_PATTERNS = [
  "Salvar e adicionar serviço",
  "Salvar e visualizar resumo",
  "Save and add service",
  "Save and view summary",
  "Save and add",
  "Add to estimate",
  "Save service",
  "Save",
  "Salvar",
  "Adicionar",
];

async function tryClickSaveButton(page: Page, timeout: number): Promise<boolean> {
  for (const pattern of SAVE_PATTERNS) {
    const btn = page.locator(`button:has-text("${pattern}")`).last();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click({ timeout });
      return true;
    }
  }
  const anySave = page.locator("button:has-text(\"Save\"), button:has-text(\"Add\"), button:has-text(\"Salvar\"), button:has-text(\"Adicionar\")");
  const count = await anySave.count();
  for (let i = count - 1; i >= 0; i--) {
    const btn = anySave.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout });
      return true;
    }
  }
  return false;
}

export async function clickSave(page: Page, isLast: boolean): Promise<boolean> {
  const primaryPattern = isLast ? "Salvar e visualizar resumo" : "Salvar e adicionar serviço";
  try {
    await page.locator(`button:has-text("${primaryPattern}")`).last().click({ timeout: 10000 });
    return true;
  } catch {
    if (await tryClickSaveButton(page, 8000)) return true;
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .filter(b => b.offsetParent !== null)
        .map(b => b.textContent?.trim())
        .filter(Boolean)
    );
    console.log(`[awsCalculator] no save button found. Available buttons:`, buttons);
    return false;
  }
}
