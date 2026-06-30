interface ScoreResult {
  score: number;
  breakdown: {
    length: number;
    brandability: number;
    keyword: number;
    simplicity: number;
    tld: number;
  };
}

const BRANDABLE_WORDS = [
  "hub", "lab", "pro", "go", "app", "zen", "box", "io", "ai", "ly",
  "jet", "sky", "neo", "vox", "max", "tix", "kit", "bit", "mono", "solo",
];

const HIGH_VALUE_TLDS = [".com", ".io", ".ai", ".app", ".co", ".org", ".dev", ".net"];

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function isBrandable(name: string): boolean {
  const lower = name.toLowerCase();
  if (BRANDABLE_WORDS.some((w) => lower.endsWith(w) || lower.startsWith(w))) return true;
  if (lower.length <= 6 && /^[a-z]+$/.test(lower)) return true;
  return false;
}

function countSyllables(name: string): number {
  let count = 0;
  let prevVowel = false;
  for (const char of name.toLowerCase()) {
    const isVowel = VOWELS.has(char);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }
  return Math.max(1, count);
}

export function scoreDomain(name: string, tld: string): ScoreResult {
  const namePart = name.toLowerCase();

  // Length score (5-8 chars is ideal)
  const length = namePart.length;
  let lengthScore = 0;
  if (length >= 4 && length <= 6) lengthScore = 30;
  else if (length >= 7 && length <= 8) lengthScore = 25;
  else if (length >= 9 && length <= 10) lengthScore = 15;
  else if (length <= 3) lengthScore = 10;
  else lengthScore = 5;

  // Brandability score
  const brandable = isBrandable(namePart);
  let brandabilityScore = brandable ? 25 : 0;

  // Keyword score
  let keywordScore = 0;
  if (/[aeiou]{2,}/.test(namePart)) keywordScore += 5;
  if (/^[a-z]+$/.test(namePart)) keywordScore += 5;
  if (namePart.length >= 3) keywordScore += 5;
  if (namePart !== namePart.toLowerCase()) keywordScore += 5;

  // Simplicity (no hyphens, no numbers, easy to spell)
  let simplicityScore = 20;
  if (namePart.includes("-")) simplicityScore -= 5;
  if (/\d/.test(namePart)) simplicityScore -= 5;
  if (countSyllables(namePart) > 4) simplicityScore -= 5;
  if (/(.)\1{2,}/.test(namePart)) simplicityScore -= 5;

  // TLD score
  const tldScore = HIGH_VALUE_TLDS.includes(tld.toLowerCase()) ? 20 : 10;

  const score = Math.min(100, Math.max(0, lengthScore + brandabilityScore + keywordScore + simplicityScore + tldScore));

  return {
    score,
    breakdown: {
      length: lengthScore,
      brandability: brandabilityScore,
      keyword: keywordScore,
      simplicity: simplicityScore,
      tld: tldScore,
    },
  };
}
