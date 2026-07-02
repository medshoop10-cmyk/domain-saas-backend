import { scrapeAllSources } from "../scrapers";
import { upsertScrapedDomains } from "../scrapers/upsertDomains";

export async function runDailyScrape(): Promise<{ total: number; inserted: number; updated: number }> {
  console.log("[DailyScrape] Starting Playwright pipeline...");
  const scraped = await scrapeAllSources();
  console.log(`[DailyScrape] Scraped ${scraped.total} total:`, {
    godaddy: scraped.godaddy.length,
    expiredDomains: scraped.expiredDomains.length,
    namecheap: scraped.namecheap.length,
  });
  const result = await upsertScrapedDomains([
    ...scraped.godaddy,
    ...scraped.expiredDomains,
    ...scraped.namecheap,
  ]);
  console.log(`[DailyScrape] DB result: ${result.inserted} new, ${result.updated} updated`);
  return { total: scraped.total, ...result };
}
