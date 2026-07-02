import { launchBrowser, newPage, randomDelay } from "./antiBlock";
import { normalizeDomain } from "../utils/normalizer";
import type { ScrapedDomain } from "../utils/normalizer";

export async function scrapeNamecheap(): Promise<ScrapedDomain[]> {
  const browser = await launchBrowser();
  const results: ScrapedDomain[] = [];
  const seen = new Set<string>();

  try {
    const { page, context } = await newPage(browser);
    try {
      console.log(`[Namecheap] Navigating to marketplace...`);
      await page.goto("https://www.namecheap.com/marketplace/", {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await page.waitForTimeout(randomDelay(3000, 5000));

      const items = await page.$$eval(
        ".listing-item, .marketplace-item, [class*='listing']",
        (cards: any[]) =>
          cards.slice(0, 100).map((card: any) => ({
            name: card.querySelector("[class*='name'], [class*='title'], .domain-name")?.textContent?.trim() || "",
            price: card.querySelector("[class*='price'], .price, [class*='amount']")?.textContent?.trim() || "",
          })).filter((d: any) => d.name)
      );

      for (const item of items) {
        const domainName = item.name.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
        if (!domainName || seen.has(domainName)) continue;
        seen.add(domainName);

        const priceMatch = item.price?.replace(/[^0-9.]/g, "");
        results.push(
          normalizeDomain({
            domain: domainName,
            source: "namecheap",
            price: priceMatch ? parseFloat(priceMatch) : undefined,
          })
        );
      }

      console.log(`[Namecheap] ${items.length} items found`);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`[Namecheap] Total: ${results.length} unique domains`);
  return results;
}
