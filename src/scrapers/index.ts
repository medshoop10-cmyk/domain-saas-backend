import { scrapeGoDaddy } from "./godaddy";
import { scrapeExpiredDomains } from "./expiredDomains";
import { scrapeNamecheap } from "./namecheap";
import type { ScrapedDomain } from "../utils/normalizer";

export type { ScrapedDomain };

export interface ScrapeResults {
  godaddy: ScrapedDomain[];
  expiredDomains: ScrapedDomain[];
  namecheap: ScrapedDomain[];
  total: number;
}

export async function scrapeAllSources(): Promise<ScrapeResults> {
  const [godaddy, expiredDomains, namecheap] = await Promise.allSettled([
    scrapeGoDaddy(),
    scrapeExpiredDomains(),
    scrapeNamecheap(),
  ]);

  return {
    godaddy: godaddy.status === "fulfilled" ? godaddy.value : [],
    expiredDomains: expiredDomains.status === "fulfilled" ? expiredDomains.value : [],
    namecheap: namecheap.status === "fulfilled" ? namecheap.value : [],
    total: (godaddy.status === "fulfilled" ? godaddy.value.length : 0) +
      (expiredDomains.status === "fulfilled" ? expiredDomains.value.length : 0) +
      (namecheap.status === "fulfilled" ? namecheap.value.length : 0),
  };
}
