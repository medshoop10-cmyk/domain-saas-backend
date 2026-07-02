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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function scrapeAllSources(): Promise<ScrapeResults> {
  const TIMEOUT = 25000;

  const [godaddy, expiredDomains, namecheap] = await Promise.allSettled([
    withTimeout(scrapeGoDaddy(), TIMEOUT, "GoDaddy"),
    withTimeout(scrapeExpiredDomains(), TIMEOUT, "ExpiredDomains"),
    withTimeout(scrapeNamecheap(), TIMEOUT, "Namecheap"),
  ]);

  if (godaddy.status === "rejected") console.warn("[Scraper] GoDaddy failed:", godaddy.reason);
  if (expiredDomains.status === "rejected") console.warn("[Scraper] ExpiredDomains failed:", expiredDomains.reason);
  if (namecheap.status === "rejected") console.warn("[Scraper] Namecheap failed:", namecheap.reason);

  return {
    godaddy: godaddy.status === "fulfilled" ? godaddy.value : [],
    expiredDomains: expiredDomains.status === "fulfilled" ? expiredDomains.value : [],
    namecheap: namecheap.status === "fulfilled" ? namecheap.value : [],
    total: (godaddy.status === "fulfilled" ? godaddy.value.length : 0) +
      (expiredDomains.status === "fulfilled" ? expiredDomains.value.length : 0) +
      (namecheap.status === "fulfilled" ? namecheap.value.length : 0),
  };
}
