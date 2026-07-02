import * as cheerio from "cheerio";

interface ScrapedDomain {
  name: string;
  tld: string;
  backlinks?: number;
  traffic?: number;
}

export async function scrapeFreshDrop(): Promise<ScrapedDomain[]> {
  try {
    const response = await fetch("https://www.freshdrop.com", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`FreshDrop returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    return parseFreshDropHtml(html);
  } catch (err) {
    console.warn("FreshDrop scrape failed:", (err as Error).message);
    return [];
  }
}

function parseFreshDropHtml(html: string): ScrapedDomain[] {
  const $ = cheerio.load(html);
  const domains: ScrapedDomain[] = [];

  $("table tr, .domain-row, .domain-item, [class*='domain']").each((_: number, el: any) => {
    const text = $(el).text().trim();
    const match = text.match(/([a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9])\.(com|io|ai|app|co|net|org|dev|tech|site|online|store)/i);
    if (!match) return;

    const name = match[1].toLowerCase();
    const tld = "." + match[2].toLowerCase();
    if (name.length < 2) return;

    domains.push({ name, tld });
  });

  return domains;
}

export async function scrapeExpiredDomainsNet(): Promise<ScrapedDomain[]> {
  const sources = [
    "https://www.expireddomains.net/expired-domains/",
    "https://www.expireddomains.net/deleted-domains/",
  ];

  for (const url of sources) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://www.expireddomains.net/",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) continue;

      const html = await response.text();
      const domains = parseExpiredDomainsTable(html);
      if (domains.length > 0) return domains;
    } catch {
      continue;
    }
  }

  return [];
}

function parseExpiredDomainsTable(html: string): ScrapedDomain[] {
  const $ = cheerio.load(html);
  const domains: ScrapedDomain[] = [];

  $("table tr").each((_: number, row: any) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const text = $(cells[1] || cells[0]).text().trim();
    const match = text.match(/([a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9])\s*\.\s*(com|io|ai|app|co|net|org|dev|tech|site|online|store)/i);
    if (!match) return;

    const name = match[1].toLowerCase().replace(/[^a-z0-9-]/g, "");
    const tld = "." + match[2].toLowerCase();
    if (name.length < 2) return;

    const blText = $(cells[5])?.text()?.replace(/[^0-9]/g, "") || "0";
    const backlinks = parseInt(blText, 10);

    domains.push({ name, tld, backlinks: isNaN(backlinks) ? 0 : backlinks });
  });

  return domains;
}

export async function scrapeAllSources(): Promise<ScrapedDomain[]> {
  const [freshDrop, expiredNet] = await Promise.all([
    scrapeFreshDrop().catch(() => [] as ScrapedDomain[]),
    scrapeExpiredDomainsNet().catch(() => [] as ScrapedDomain[]),
  ]);

  const seen = new Set<string>();
  const all: ScrapedDomain[] = [];

  for (const d of [...freshDrop, ...expiredNet]) {
    const key = `${d.name}${d.tld}`;
    if (!seen.has(key)) {
      seen.add(key);
      all.push(d);
    }
  }

  console.log(`Scraped ${freshDrop.length} from FreshDrop, ${expiredNet.length} from ExpiredDomains.net`);
  return all;
}
