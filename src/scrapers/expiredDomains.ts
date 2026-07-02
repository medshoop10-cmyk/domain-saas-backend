import { launchBrowser, newPage, randomDelay } from "./antiBlock";
import { normalizeDomain } from "../utils/normalizer";
import type { ScrapedDomain } from "../utils/normalizer";

const TARGETS = [
  { label: "deleted .com", url: "https://www.expireddomains.net/deleted-com-domains/" },
  { label: "expired .com", url: "https://www.expireddomains.net/expired-com-domains/" },
  { label: "dropped .com", url: "https://www.expireddomains.net/dropped-com-domains/" },
];

export async function scrapeExpiredDomains(): Promise<ScrapedDomain[]> {
  const browser = await launchBrowser();
  const results: ScrapedDomain[] = [];
  const seen = new Set<string>();

  try {
    for (const target of TARGETS) {
      const { page, context } = await newPage(browser);
      try {
        console.log(`[ExpiredDomains] Scraping ${target.label}...`);
        await page.goto(target.url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(randomDelay(3000, 6000));

        const rows = await page.$$eval(
          "table.tablesorter tbody tr, table.base tbody tr, .domain-table tbody tr",
          (trs: any[]) =>
            trs.slice(0, 100).map((tr: any) => {
              const cells = tr.querySelectorAll("td");
              const text = (i: number) => cells[i]?.textContent?.trim() || "";
              const link = (i: number) => cells[i]?.querySelector("a")?.textContent?.trim() || "";
              return {
                domain: link(0) || text(0),
                traffic: text(2) || text(1),
                backlinks: text(3) || text(2),
                tld: text(1) || "",
              };
            })
        );

        for (const row of rows) {
          if (!row.domain || seen.has(row.domain)) continue;
          seen.add(row.domain);
          results.push(
            normalizeDomain({
              domain: row.domain,
              source: "expireddomains",
              backlinks: parseInt(row.backlinks.replace(/[^0-9]/g, "")) || 0,
              traffic: parseInt(row.traffic.replace(/[^0-9]/g, "")) || 0,
            })
          );
        }

        console.log(`[ExpiredDomains] ${target.label}: ${rows.length} domains`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[ExpiredDomains] Total: ${results.length} unique domains`);
  return results;
}
