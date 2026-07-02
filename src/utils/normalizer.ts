export interface RawDomain {
  domain: string;
  source: string;
  price?: number;
  traffic?: number;
  backlinks?: number;
  expiryDate?: string;
  bids?: number;
  metadata?: Record<string, string>;
}

export type DomainType = "generated" | "market";

export interface ScrapedDomain {
  name: string;
  tld: string;
  length: number;
  source: string;
  price?: number;
  traffic?: number;
  backlinks: number;
  expiryDate?: Date;
  isBrandable: boolean;
  hasKeywords: boolean;
  score: number;
  domainType: DomainType;
  bids?: number;
  daysToExpire?: number;
}

const BRANDABLE_PATTERNS = [
  /^[aeiou][a-z]{2,5}[aeiou]/i,
  /^(my|get|go|try|use|buy)[a-z]{3,}$/i,
  /[aeiou]{2}[a-z]{2,}[aeiou]/i,
  /^(hi|lo|mi|no|so|bo|co|do|fo|mo|ro|vo)/i,
  /[aeiou][bcdfgklmnpstvz]{2,3}[aeiou]/i,
];

function isBrandable(name: string): boolean {
  return BRANDABLE_PATTERNS.some((p) => p.test(name));
}

const HIGH_VALUE_KEYWORDS = [
  "ai", "app", "cloud", "data", "dev", "pro", "hub", "lab", "net",
  "tech", "web", "shop", "pay", "go", "get", "try", "use",
  "travel", "health", "med", "fit", "bio", "fin", "trade", "invest",
];

function hasKeywords(name: string): boolean {
  return HIGH_VALUE_KEYWORDS.some((kw) => name.toLowerCase().includes(kw));
}

function computeScore(parts: { length: number; tld: string; brandable: boolean; hasKeywords: boolean; backlinks: number }): number {
  let score = 50;
  if (parts.length < 8) score += 20;
  else if (parts.length < 12) score += 10;
  else score -= 10;
  if (parts.tld === ".com") score += 20;
  else if (parts.tld === ".io" || parts.tld === ".ai") score += 15;
  else if ([".net", ".org"].includes(parts.tld)) score += 10;
  else score += 5;
  if (parts.brandable) score += 15;
  if (parts.hasKeywords) score += 15;
  score += Math.min(parts.backlinks * 0.5, 10);
  return Math.round(Math.min(Math.max(score, 0), 100));
}

export function normalizeDomain(raw: RawDomain): ScrapedDomain {
  let name = raw.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const dotIndex = name.lastIndexOf(".");
  const domainName = dotIndex > 0 ? name.substring(0, dotIndex) : name;
  const tld = dotIndex > 0 ? name.substring(dotIndex) : `.${name}`;

  const isMarket = raw.source !== "wordlist" && (!!raw.price || (raw.traffic ?? 0) > 0 || (raw.backlinks ?? 0) > 0);
  const expiry = raw.expiryDate ? new Date(raw.expiryDate) : undefined;
  const daysToExpire = expiry
    ? Math.max(0, Math.round((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : raw.source === "godaddy"
    ? 7
    : undefined;

  return {
    name,
    tld,
    length: name.length,
    source: raw.source,
    price: raw.price,
    traffic: raw.traffic,
    backlinks: raw.backlinks ?? 0,
    expiryDate: expiry,
    isBrandable: isBrandable(domainName),
    hasKeywords: hasKeywords(domainName),
    score: computeScore({
      length: domainName.length,
      tld,
      brandable: isBrandable(domainName),
      hasKeywords: hasKeywords(domainName),
      backlinks: raw.backlinks ?? 0,
    }),
    domainType: isMarket ? "market" : "generated",
    bids: raw.bids,
    daysToExpire,
  };
}
