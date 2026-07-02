import type { ScrapedDomain, DomainType } from "../utils/normalizer";

export interface FilteredDomain extends ScrapedDomain {
  opportunityScore: number;
  bucket: "trending" | "brandable" | "undervalued" | "standard" | "discard";
  isHot: boolean;
  googleResults: number;
  velocityScore: number;
  confidenceScore: number;
  liquidityScore: number;
  urgencyScore: number;
  badges: string[];
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

function computeExpectedValue(d: ScrapedDomain): number {
  const base = baseName(d);
  const lengthScore = base.length <= 8 ? 10 : base.length <= 12 ? 7 : 4;
  const wordBonus = PREMIUM_WORDS.some((w) => base.includes(w)) ? 200 : 0;
  const brandableBonus = d.isBrandable ? 300 : 0;
  return lengthScore * 50 + wordBonus + brandableBonus;
}

function computeUrgency(d: ScrapedDomain): number {
  if (d.daysToExpire === undefined) return 0;
  if (d.daysToExpire < 1) return 5;
  if (d.daysToExpire < 3) return 3;
  if (d.daysToExpire < 7) return 1;
  return 0;
}

function computeBadges(d: ScrapedDomain, bucket: string, urgency: number, validated: boolean): string[] {
  const badges: string[] = [];
  if (urgency >= 5) badges.push("🔥 Ending Soon");
  else if (urgency >= 3) badges.push("⏳ Expiring Soon");
  if (bucket === "undervalued") badges.push("💰 Undervalued");
  if (bucket === "trending") badges.push("📈 Trending");
  if (validated) badges.push("✅ Validated");
  if (d.traffic && d.traffic > 100) badges.push("📈 High Traffic");
  if (d.isBrandable) badges.push("🧠 Brandable");
  if (d.source === "godaddy") badges.push("🏷️ GoDaddy Auction");
  return badges.slice(0, 2);
}

function computeReasons(d: ScrapedDomain, bucket: string, urgency: number, expectedValue: number): string[] {
  const base = baseName(d);
  const r: string[] = [];
  if (base.length <= 8) r.push("Short & pronounceable");
  if (base.length >= 4 && base.length <= 10 && !base.includes("-") && !/\d/.test(base)) r.push("Startup-friendly name");
  if (PREMIUM_WORDS.some((w) => base.includes(w))) r.push("Contains premium keyword");
  if (d.tld === ".com") r.push("Premium .com TLD");
  if (d.tld === ".ai" || d.tld === ".io") r.push("Trending TLD");
  if (d.isBrandable) r.push("High brandability");
  if (d.price !== undefined && expectedValue > 0 && d.price < expectedValue * 0.4) r.push("Significantly underpriced");
  else if (d.price !== undefined && d.price < 300) r.push("Low price vs quality");
  if (d.traffic && d.traffic > 100) r.push("Has existing traffic");
  if (d.backlinks > 50) r.push("Established backlink profile");
  if (d.bids && d.bids > 3) r.push("Multiple active bids");
  if (urgency >= 3) r.push("Auction ending soon");
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
  return (d.price ? 5 : 0) + (d.traffic ? 3 : 0) + (d.backlinks ? 2 : 0) + (d.bids ? 2 : 0);
}

function isMarketValidated(d: ScrapedDomain): boolean {
  return !!(d.bids && d.bids > 3) || !!(d.backlinks > 50) || !!(d.traffic && d.traffic > 100);
}

function assignBucket(d: ScrapedDomain, liquidity: number, marketCount: number, urgency: number): FilteredDomain["bucket"] {
  if (d.domainType === "generated") {
    if (d.isBrandable && d.length <= 12 && d.score >= 70) return "brandable";
    return "discard";
  }

  const liquidityThreshold = marketCount < 20 ? 2 : 5;

  if (liquidity < liquidityThreshold) {
    if (urgency >= 3 && d.price) return "trending";
    return "standard";
  }

  if ((d.traffic && d.traffic > 50) || d.backlinks > 30) return "trending";
  if (urgency >= 3 && d.price) return "trending";

  const expectedValue = computeExpectedValue(d);
  const isRelativelyUndervalued = d.price !== undefined && expectedValue > 0 && d.price < expectedValue * 0.4;
  if (d.price !== undefined && (d.price < 300 || isRelativelyUndervalued) && d.score >= 10) return "undervalued";

  if (liquidity >= liquidityThreshold && d.price && d.daysToExpire !== undefined && d.daysToExpire < 7) return "trending";

  return "standard";
}

function computeVelocity(d: ScrapedDomain): number {
  return Math.round(((d.traffic || 0) * 0.6 + (d.backlinks || 0) * 0.4 + (d.bids || 0) * 5));
}

function computeConfidence(score: number, opportunityScore: number, domainType: DomainType): number {
  const raw = score * 0.6 + opportunityScore * 0.4;
  if (domainType === "generated") return Math.round(raw * 0.5);
  return Math.round(raw);
}

export function filterAndScore(domains: ScrapedDomain[], existingMarketCount: number = 0): FilteredDomain[] {
  const filtered = domains.filter(isSaaSFit);

  const upgraded = filtered.map((d) => ({
    ...d,
    score: upgradedScore(d),
    googleResults: 0,
    velocityScore: 0,
    confidenceScore: 0,
    opportunityScore: 0,
    urgencyScore: 0,
    bucket: "standard" as const,
    isHot: false,
    liquidityScore: 0,
    badges: [] as string[],
    reasons: [],
  }));

  const unique = new Map<string, FilteredDomain>();
  let marketCount = existingMarketCount;

  for (const d of upgraded) {
    if (d.domainType === "market") marketCount++;
  }

  for (const d of upgraded) {
    const existing = unique.get(d.name);
    if (!existing || (d.score || 0) > (existing.score || 0)) {
      const liquidity = computeLiquidity(d);
      const urgency = computeUrgency(d);
      const validated = isMarketValidated(d);
      const bucket = assignBucket(d, liquidity, marketCount, urgency);
      if (bucket === "discard") continue;
      const baseScore = d.score + (validated ? 5 : 0);
      const oppScore = baseScore + urgency + (isMarketValidated(d) ? 5 : 0);
      unique.set(d.name, {
        ...d,
        opportunityScore: oppScore,
        bucket,
        isHot: urgency >= 3,
        confidenceScore: computeConfidence(baseScore, oppScore, d.domainType),
        liquidityScore: liquidity,
        urgencyScore: urgency,
        velocityScore: computeVelocity(d),
        badges: computeBadges(d, bucket, urgency, validated),
        reasons: computeReasons(d, bucket, urgency, computeExpectedValue(d)),
      });
    }
  }

  return Array.from(unique.values());
}
