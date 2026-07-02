import type { ScrapedDomain, DomainType } from "../utils/normalizer";

export interface FilteredDomain extends ScrapedDomain {
  opportunityScore: number;
  bucket: "trending" | "brandable" | "undervalued" | "standard" | "discard";
  isHot: boolean;
  googleResults: number;
  velocityScore: number;
  confidenceScore: number;
  liquidityScore: number;
  reasons: string[];
}

const PREMIUM_WORDS = [
  "ai", "tech", "cloud", "data", "app", "hub",
  "lab", "pay", "flow", "base", "stack",
  "peak", "nexus", "core", "prime", "pulse",
];

const UGLY_PATTERN = /[^aeiou]{4,}/i;

function countVowels(s: string): number {
  return (s.match(/[aeiou]/gi) || []).length;
}

function baseName(d: ScrapedDomain): string {
  return d.name.replace(/\..*$/, "").toLowerCase();
}

export function isSaaSFit(d: ScrapedDomain): boolean {
  if (!d.name) return false;
  const base = baseName(d);

  if (base.includes("-")) return false;
  if (base.length > 15) return false;
  if (/\d/.test(base)) return false;

  if (d.price !== undefined && d.price > 5000) return false;
  if (d.traffic !== undefined && d.traffic > 0 && d.traffic < 50) return false;

  const vowels = countVowels(base);
  if (vowels < 2) return false;

  return true;
}

function computeTasteScore(d: ScrapedDomain): number {
  const base = baseName(d);
  let s = 0;

  if (UGLY_PATTERN.test(base)) s -= 2;
  if (PREMIUM_WORDS.some((w) => base.includes(w))) s += 3;
  if (base.length <= 12 && !base.includes("-") && !/\d/.test(base)) s += 4;

  return s;
}

function computeReasons(d: ScrapedDomain, bucket: string, liquidity: number): string[] {
  const base = baseName(d);
  const r: string[] = [];

  if (base.length <= 8) r.push("Short & pronounceable");
  if (base.length >= 4 && base.length <= 10 && !base.includes("-") && !/\d/.test(base)) r.push("Startup-friendly name");
  if (PREMIUM_WORDS.some((w) => base.includes(w))) r.push("Contains premium keyword");
  if (d.tld === ".com") r.push("Premium .com TLD");
  if (d.tld === ".ai" || d.tld === ".io") r.push("Trending TLD");
  if (d.isBrandable) r.push("High brandability");
  if (d.price !== undefined && d.price < 300) r.push("Low price vs quality");
  if (d.traffic && d.traffic > 100) r.push("Has existing traffic");
  if (d.backlinks > 50) r.push("Established backlink profile");
  if (liquidity > 5) r.push("Real market signals detected");
  if (bucket === "undervalued") r.push("Undervalued opportunity");
  if (bucket === "trending") r.push("Trending domain");
  if (d.source === "godaddy") r.push("Available on GoDaddy Auctions");
  if (d.source === "namecheap") r.push("Listed on Namecheap Marketplace");

  return r.slice(0, 3);
}

function upgradedScore(d: ScrapedDomain): number {
  let s = d.score;
  const base = baseName(d);

  if (base.length <= 10) s += 3;
  if (!base.includes("-")) s += 2;
  if (!/\d/.test(base)) s += 2;
  if (d.traffic && d.traffic > 100) s += 3;
  if (d.backlinks > 50) s += 2;
  if (d.price !== undefined && d.price < 200) s += 2;
  if (d.tld === ".com") s += 3;
  if (d.isBrandable) s += 3;
  s += computeTasteScore(d);

  return Math.round(Math.min(Math.max(s, 0), 100));
}

function computeLiquidity(d: ScrapedDomain): number {
  return (d.price ? 5 : 0) + (d.traffic ? 3 : 0) + (d.backlinks ? 2 : 0);
}

function hasMinimumSignal(d: ScrapedDomain): boolean {
  return !!(d.price || (d.traffic ?? 0) > 0 || (d.backlinks ?? 0) > 0);
}

function assignBucket(d: ScrapedDomain, liquidity: number): FilteredDomain["bucket"] {
  if (d.domainType === "generated") {
    if (d.isBrandable && d.length <= 12 && d.score >= 70) return "brandable";
    return "discard";
  }

  if (liquidity < 5) return "standard";

  if ((d.traffic && d.traffic > 50) || d.backlinks > 30) return "trending";
  if (d.price !== undefined && d.price < 300 && d.score >= 10) return "undervalued";
  return "standard";
}

function isHot(d: ScrapedDomain): boolean {
  if (d.expiryDate) {
    const hoursLeft = (d.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursLeft < 24;
  }
  if (d.source === "godaddy" && d.price !== undefined && d.price < 100) return true;
  return false;
}

function computeVelocity(d: ScrapedDomain): number {
  return Math.round(((d.traffic || 0) * 0.6 + (d.backlinks || 0) * 0.4));
}

function computeConfidence(score: number, opportunityScore: number, domainType: DomainType): number {
  const raw = score * 0.6 + opportunityScore * 0.4;
  if (domainType === "generated") return Math.round(raw * 0.5);
  return Math.round(raw);
}

export function filterAndScore(domains: ScrapedDomain[]): FilteredDomain[] {
  const filtered = domains.filter(isSaaSFit);

  const upgraded = filtered.map((d) => ({
    ...d,
    score: upgradedScore(d),
    googleResults: 0,
    velocityScore: computeVelocity(d),
    confidenceScore: 0,
    opportunityScore: 0,
    bucket: "standard" as const,
    isHot: false,
    liquidityScore: 0,
    reasons: [],
  }));

  const unique = new Map<string, FilteredDomain>();
  for (const d of upgraded) {
    const existing = unique.get(d.name);
    if (!existing || (d.score || 0) > (existing.score || 0)) {
      const oppScore = d.score + (isHot(d) ? 3 : 0);
      const liquidity = computeLiquidity(d);
      const bucket = assignBucket(d, liquidity);
      if (bucket === "discard") continue;
      unique.set(d.name, {
        ...d,
        opportunityScore: oppScore,
        bucket,
        isHot: isHot(d),
        confidenceScore: computeConfidence(d.score, oppScore, d.domainType),
        liquidityScore: liquidity,
        reasons: computeReasons(d, bucket, liquidity),
      });
    }
  }

  return Array.from(unique.values());
}
