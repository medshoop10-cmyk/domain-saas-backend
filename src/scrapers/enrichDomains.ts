import type { FilteredDomain } from "./filterDomains";

async function googleResultCount(domain: string): Promise<number> {
  try {
    const res = await fetch(`https://www.google.com/search?q=site:${domain}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();
    const match = html.match(/About ([\d,]+) results/);
    if (match) return parseInt(match[1].replace(/,/g, ""), 10);
    const simple = html.match(/([\d,]+) results/);
    if (simple) return parseInt(simple[1].replace(/,/g, ""), 10);
  } catch {}
  return 0;
}

const CACHE = new Map<string, { results: number; ts: number }>();
const CACHE_TTL = 86_400_000; // 24h

async function cachedGoogleCount(domain: string): Promise<number> {
  const cached = CACHE.get(domain);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.results;
  const results = await googleResultCount(domain);
  CACHE.set(domain, { results, ts: Date.now() });
  if (CACHE.size > 5000) {
    const keys = [...CACHE.keys()].slice(0, 1000);
    keys.forEach((k) => CACHE.delete(k));
  }
  return results;
}

export async function enrichDomain(d: FilteredDomain): Promise<{
  googleResults: number;
  velocityScore: number;
  confidenceScore: number;
}> {
  const googleResults = await cachedGoogleCount(d.name);
  const velocityScore = Math.round(
    ((d.traffic || 0) * 0.6 + (d.backlinks || 0) * 0.4)
  );
  const confidenceScore = Math.round(d.score * 0.6 + d.opportunityScore * 0.4);

  return {
    googleResults,
    velocityScore,
    confidenceScore,
  };
}

export async function enrichDomains(domains: FilteredDomain[]): Promise<FilteredDomain[]> {
  const enriched = await Promise.allSettled(
    domains.map(async (d) => {
      const meta = await enrichDomain(d);
      return { ...d, ...meta };
    })
  );
  return enriched
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<FilteredDomain>).value);
}
