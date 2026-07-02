import type { ScrapedDomain } from "../utils/normalizer";

export interface FilteredDomain extends ScrapedDomain {
  opportunityScore: number;
  bucket: "trending" | "brandable" | "undervalued" | "standard";
  isHot: boolean;
}

function countVowels(s: string): number {
  return (s.match(/[aeiou]/gi) || []).length;
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

  return Math.round(Math.min(Math.max(s, 0), 100));
}

function assignBucket(d: ScrapedDomain): FilteredDomain["bucket"] {
  if (d.traffic && d.traffic > 100 && d.backlinks > 50) return "trending";
  if (d.isBrandable && d.length <= 12 && !d.name.includes("-") && !/\d/.test(d.name)) return "brandable";
  if (d.price !== undefined && d.price < 200 && d.score >= 50) return "undervalued";
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

export function filterAndScore(domains: ScrapedDomain[]): FilteredDomain[] {
  const filtered = domains.filter(isSaaSFit);

  const upgraded = filtered.map((d) => ({
    ...d,
    score: upgradedScore(d),
  }));

  const unique = new Map<string, FilteredDomain>();
  for (const d of upgraded) {
    const existing = unique.get(d.name);
    if (!existing || (d.score || 0) > (existing.score || 0)) {
      unique.set(d.name, {
        ...d,
        opportunityScore: d.score + (isHot(d) ? 3 : 0),
        bucket: assignBucket(d),
        isHot: isHot(d),
      });
    }
  }

  return Array.from(unique.values());
}
