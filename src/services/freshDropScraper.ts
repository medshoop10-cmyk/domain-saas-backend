interface ScrapedDomain {
  name: string;
  tld: string;
  backlinks?: number;
  traffic?: number;
}

function extractDomainsFromText(text: string): ScrapedDomain[] {
  const domains: ScrapedDomain[] = [];
  const seen = new Set<string>();

  const regex = /\b([a-z0-9][a-z0-9-]{1,61}[a-z0-9])\.(com|io|ai|app|co|net|org|dev|tech|site|online|store)\b/gi;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    const tld = "." + match[2].toLowerCase();
    if (name.length < 3 || name.includes("xn--")) continue;

    const key = name + tld;
    if (!seen.has(key)) {
      seen.add(key);
      domains.push({ name, tld });
    }
  }

  return domains;
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
    return extractDomainsFromText(html);
  } catch (err) {
    console.warn("FreshDrop scrape failed:", (err as Error).message);
    return [];
  }
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
      const domains = extractDomainsFromText(html);
      if (domains.length > 0) return domains;
    } catch {
      continue;
    }
  }

  return [];
}

export async function scrapeJustDropped(): Promise<ScrapedDomain[]> {
  try {
    const response = await fetch("https://justdropped.com/feed/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return [];
    const text = await response.text();
    return extractDomainsFromText(text);
  } catch {
    return [];
  }
}

export async function scrapeAllSources(): Promise<ScrapedDomain[]> {
  const [freshDrop, expiredNet, justDropped] = await Promise.all([
    scrapeFreshDrop().catch(() => [] as ScrapedDomain[]),
    scrapeExpiredDomainsNet().catch(() => [] as ScrapedDomain[]),
    scrapeJustDropped().catch(() => [] as ScrapedDomain[]),
  ]);

  const seen = new Set<string>();
  const all: ScrapedDomain[] = [];

  for (const d of [...freshDrop, ...expiredNet, ...justDropped]) {
    const key = `${d.name}${d.tld}`;
    if (!seen.has(key)) {
      seen.add(key);
      all.push(d);
    }
  }

  console.log(`Scraped: ${freshDrop.length} FreshDrop, ${expiredNet.length} ExpiredDomains, ${justDropped.length} JustDropped`);
  return all;
}
