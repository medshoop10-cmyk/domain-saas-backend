import { launchBrowser, newPage, randomDelay } from "./antiBlock";
import { normalizeDomain } from "../utils/normalizer";
import type { ScrapedDomain } from "../utils/normalizer";

export async function scrapeGoDaddy(maxPages: number = 3): Promise<ScrapedDomain[]> {
  const browser = await launchBrowser();
  const results: ScrapedDomain[] = [];
  const seen = new Set<string>();

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const { page, context } = await newPage(browser);
      try {
        const url = pageNum === 1
          ? "https://auctions.godaddy.com/"
          : `https://auctions.godaddy.com/?page=${pageNum}`;

        console.log(`[GoDaddy] Navigating to page ${pageNum}...`);
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(randomDelay(2000, 4000));

        const items = await page.$$eval(".domain-row, [class*='auction-item'], .search-result", (rows: any[]) =>
          rows.map((row: any) => ({
            name: row.querySelector("[class*='domain']")?.textContent?.trim() || "",
            price: row.querySelector("[class*='price'], [class*='bid']")?.textContent?.trim() || "",
            bids: row.querySelector("[class*='bids']")?.textContent?.trim() || "",
            timeLeft: row.querySelector("[class*='time']")?.textContent?.trim() || "",
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
              source: "godaddy",
              price: priceMatch ? parseFloat(priceMatch) : undefined,
              metadata: { bids: item.bids || "", timeLeft: item.timeLeft || "" },
            })
          );
        }

        console.log(`[GoDaddy] Page ${pageNum}: ${items.length} items found`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[GoDaddy] Total: ${results.length} unique domains`);
  return results;
}
