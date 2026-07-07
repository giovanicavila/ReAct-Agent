import type { Page } from "playwright";
import { CALCULATOR_URL, dismissOverlays } from "./browser.js";

const SHARE_SELECTORS = [
  "button[data-cy=\"save-and-share\"]",
  "button[data-testid*=\"share\"]",
  "[data-testid*=\"share\"] button",
  "button:has-text(\"Share\")",
  "button:has-text(\"Compartilhar\")",
  "button:has-text(\"Export\")",
  "button:has-text(\"Exportar\")",
  "a:has-text(\"Share\")",
  "a:has-text(\"Compartilhar\")",
  "[aria-label*=\"share\" i]",
  "[aria-label*=\"export\" i]",
  "button[class*=\"share\"]",
  "button[class*=\"Share\"]",
  "[class*=\"share\"] button",
  "button[class*=\"ShareLink\"]",
  "button svg",
  "button:has(svg)",
];

const AGREE_SELECTORS = [
  "button:has-text(\"Agree and continue\")",
  "button:has-text(\"Concordo e continuar\")",
  "button:has-text(\"I agree\")",
  "button:has-text(\"Concordo\")",
  "button:has-text(\"Generate public link\")",
  "button:has-text(\"Create public link\")",
  "button:has-text(\"Generate link\")",
  "button:has-text(\"Continue\")",
  "button:has-text(\"Continuar\")",
  "button:has-text(\"Confirm\")",
  "button:has-text(\"Confirmar\")",
  "[data-cy*=\"agree\"] button",
  "[data-cy*=\"confirm\"] button",
  "label:has-text(\"I agree\")",
  "label:has-text(\"Concordo\")",
];

const COPY_SELECTORS = [
  "button:has-text(\"Copy link\")",
  "button:has-text(\"Copy public link\")",
  "button:has-text(\"Copiar link\")",
  "button:has-text(\"Copy\")",
  "button:has-text(\"Copiar\")",
  "button[data-cy*=\"copy\"]",
  "button[aria-label*=\"copy\" i]",
];

async function findVisible(page: Page, selectors: string[], timeout = 2000) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      if (await loc.isVisible({ timeout }).catch(() => false)) {
        return loc;
      }
    } catch {}
  }
  return null;
}

async function navigateToEstimate(page: Page) {
  const cur = page.url();
  if (cur.includes("/#/estimate")) return;
  await page.evaluate(() => { window.location.hash = "#/estimate"; });
  await page.waitForTimeout(3000);
  await dismissOverlays(page);
}

async function extractUrl(page: Page): Promise<string | null> {
  const url = page.url();
  if (url.includes("id=")) return url;

  const fromInput = await page.evaluate(() => {
    for (const el of document.querySelectorAll("input")) {
      const v = (el as HTMLInputElement).value || "";
      if (v.includes("id=")) return v;
    }
    for (const el of document.querySelectorAll("[href*=\"id=\"]")) {
      const h = (el as HTMLAnchorElement).href || "";
      if (h.includes("id=")) return h;
    }
    for (const el of document.querySelectorAll("[aria-label*=\"link\" i], [class*=\"link-url\"], [class*=\"share-link\"]")) {
      const t = el.textContent || (el as HTMLInputElement).value || "";
      if (t.includes("id=")) return t;
    }
    for (const el of document.querySelectorAll("*")) {
      const m = el.textContent?.match(/https?:\/\/calculator\.aws\/[^\s\"'>]+id=[^\s\"'>]+/);
      if (m) return m[0];
    }
    for (const el of document.querySelectorAll("*")) {
      const m = el.textContent?.match(/https?:\/\/[^\s\"'>]+id=[^\s\"'>]+/);
      if (m && m[0].includes("calculator")) return m[0];
    }
    try {
      const ls = Object.entries(localStorage).map(([k, v]) => `${k}=${v}`).join("|");
      const m = ls.match(/id=[a-zA-Z0-9_-]+/);
      if (m) return `https://calculator.aws/#/estimate?${m[0]}`;
    } catch {}
    try {
      const ss = Object.entries(sessionStorage).map(([k, v]) => `${k}=${v}`).join("|");
      const m = ss.match(/id=[a-zA-Z0-9_-]+/);
      if (m) return `https://calculator.aws/#/estimate?${m[0]}`;
    } catch {}
    return "";
  }).catch(() => "");
  if (fromInput) return fromInput;

  return null;
}

function pageDump(page: Page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")]
      .filter(b => b.offsetParent !== null)
      .map(b => ({
        t: b.textContent?.trim().slice(0, 60),
        cy: b.getAttribute("data-cy"),
        tid: b.getAttribute("data-testid"),
        cls: b.className.slice(0, 60),
        aria: b.getAttribute("aria-label"),
      }));
    const inputs = [...document.querySelectorAll("input")].map(i => ({
      v: (i as HTMLInputElement).value?.slice(0, 80),
      ro: i.hasAttribute("readonly"),
      ph: i.getAttribute("placeholder"),
      aria: i.getAttribute("aria-label"),
    }));
    const allText = document.body?.innerText?.slice(0, 3000) || "";
    const heading = document.querySelector("h1, h2, h3, h4")?.textContent?.trim();
    const hash = window.location.hash;
    return { buttons, inputs, allText, heading, hash };
  });
}

export async function getShareableUrl(page: Page): Promise<string> {
  let url = page.url();
  console.log(`[awsCalculator] getShareableUrl start: ${url}`);
  if (url.includes("id=")) return url;

  await page.waitForTimeout(3000);
  await navigateToEstimate(page);
  url = page.url();
  console.log(`[awsCalculator] after hash nav: ${url}`);
  if (url.includes("id=")) return url;

  for (let attempt = 0; attempt < 3; attempt++) {
    console.log(`[awsCalculator] share attempt ${attempt + 1}`);

    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1500);

      const shareBtn = await findVisible(page, SHARE_SELECTORS);
      if (!shareBtn) {
        console.log(`[awsCalculator] share btn not found, url: ${page.url()}`);
        const dump = await pageDump(page);
        console.log(`[awsCalculator] page dump:`, JSON.stringify(dump).slice(0, 3000));
        await page.screenshot({ path: "/tmp/aws-calc-debug.png" }).catch(() => {});
        await navigateToEstimate(page);
        continue;
      }
      console.log(`[awsCalculator] clicking share btn`);
      await shareBtn.click({ timeout: 10000 }).catch(e => {
        console.log(`[awsCalculator] share click error: ${e}`);
      });
      await page.waitForTimeout(4000);

      const agreeBtn = await findVisible(page, AGREE_SELECTORS);
      if (agreeBtn) {
        console.log("[awsCalculator] clicking agree");
        await agreeBtn.click({ force: true, timeout: 10000 }).catch(() => {});
      } else {
        console.log("[awsCalculator] agree btn not found");
      }

      console.log("[awsCalculator] polling for link...");
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(1000);
        const found = await extractUrl(page);
        if (found) {
          console.log(`[awsCalculator] link found: ${found}`);
          return found;
        }
      }

      const copyBtn = await findVisible(page, COPY_SELECTORS, 2000);
      if (copyBtn) {
        console.log("[awsCalculator] clicking copy btn");
        await copyBtn.click();
        await page.waitForTimeout(2000);
        const found = await extractUrl(page);
        if (found) return found;
      }

      url = page.url();
      if (url.includes("id=")) return url;
    } catch (e) {
      console.log(`[awsCalculator] attempt ${attempt + 1} error: ${e}`);
    }

    await navigateToEstimate(page);
  }

  console.log(`[awsCalculator] share flow failed, dumping page...`);
  const dump = await pageDump(page).catch(() => null);
  console.log(`[awsCalculator] final dump:`, JSON.stringify(dump).slice(0, 4000));
  await page.screenshot({ path: "/tmp/aws-calc-final.png" }).catch(() => {});

  return page.url();
}
