import type { ScrapedDomain } from "../utils/normalizer";

export interface FilteredDomain extends ScrapedDomain {
  opportunityScore: number;
  bucket: "trending" | "brandable" | "undervalued" | "standard";
  isHot: boolean;
  googleResults: number;
  velocityScore: number;
  confidenceScore: number;
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

function looksLikeStartup(d: ScrapedDomain): boolean {
  const base = d.name.replace(/\..*$/, "").toLowerCase();
  return base.length <= 12 && !base.includes("-") && !/\d/.test(base);
}

export function isSaaSFit(d: ScrapedDomain): boolean {
  if (!d.name) return false;
  const base = d.name.replace(/\..*$/, "").toLowerCase();

  if (base.includes("-")) return false;
  if (base.length > 15) return false;
  if (/\d/.test(base)) return false;

  if (d.price !== undefined && d.price > 5000) return false;
  if (d.traffic !== undefined && d.traffic > 0 && d.traffic < 50) return false;

  const vowels = countVowels(base);
  if (vowels < 2) return false;

  return true;
}

export function computeTasteScore(d: ScrapedDomain): number {
  const base = d.name.replace(/\..*$/, "").toLowerCase();
  let score = 0;

  if (UGLY_PATTERN.test(base)) score -= 2;

  if (PREMIUM_WORDS.some((w) => base.includes(w))) score += 3;
  if (looksLikeStartup(d)) score += 4;

  return score;
}

function upgradedScore(d: ScrapedDomain): number {
  let s = d.score;
  const base = d.name.replace(/\..*$/, "").toLowerCase();

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

function assignBucket(d: ScrapedDomain): FilteredDomain["bucket"] {
  const base = d.name.replace(/\..*$/, "").toLowerCase();
  if (
    (d.traffic && d.traffic > 50) ||
    d.backlinks > 30
  ) return "trending";
  if (
    d.isBrandable &&
    d.length <= 12 &&
    !base.includes("-") &&
    !/\d/.test(base) &&
    d.score >= 70
  ) return "brandable";
  if (
    d.price !== undefined &&
    d.price < 300 &&
    d.score >= 10
  ) return "undervalued";
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
  return Math.round(
    ((d.traffic || 0) * 0.6 + (d.backlinks || 0) * 0.4)
  );
}

function computeConfidence(score: number, opportunityScore: number): number {
  return Math.round(score * 0.6 + opportunityScore * 0.4);
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
  }));

  const unique = new Map<string, FilteredDomain>();
  for (const d of upgraded) {
    const existing = unique.get(d.name);
    if (!existing || (d.score || 0) > (existing.score || 0)) {
      const oppScore = d.score + (isHot(d) ? 3 : 0);
      unique.set(d.name, {
        ...d,
        opportunityScore: oppScore,
        bucket: assignBucket(d),
        isHot: isHot(d),
        confidenceScore: computeConfidence(d.score, oppScore),
      });
    }
  }

  return Array.from(unique.values());
}
