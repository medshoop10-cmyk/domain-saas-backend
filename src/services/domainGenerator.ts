const PREFIXES = [
  "get", "go", "my", "the", "try", "use", "buy", "find", "join", "wish",
  "hello", "hey", "hi", "love", "top", "best", "pro", "max", "ultra", "super",
  "mega", "neo", "new", "now", "on", "up", "we", "you", "a", "e", "i", "o",
  "zero", "one", "first", "true", "big", "tiny", "quick", "smart", "bright",
  "bold", "clear", "deep", "pure", "safe", "prime", "peak", "core", "vibe",
  "zen", "apex", "arc", "bee", "cub", "dot", "elf", "fly", "gig", "hub",
  "ink", "joy", "key", "log", "mix", "net", "odd", "pod", "red", "sky",
  "tap", "urn", "via", "web", "xen", "yes", "zag", "pix", "mod", "apt",
];

const SUFFIXES = [
  "ly", "ify", "ize", "hub", "lab", "pro", "io", "ix", "up", "go",
  "app", "tech", "soft", "ware", "nest", "spot", "zone", "mind", "wave",
  "flow", "sync", "link", "path", "base", "cast", "dock", "find", "gate",
  "grid", "lane", "lift", "line", "loop", "mark", "node", "peak", "port",
  "rise", "road", "side", "site", "span", "star", "view", "vine", "vista",
  "work", "yard", "ark", "bay", "bed", "bit", "box", "bud", "cap", "car",
  "day", "end", "fix", "fox", "gem", "hat", "hen", "key", "kit", "law",
  "lot", "map", "mix", "pad", "pen", "pin", "pit", "pot", "rag", "ram",
  "rat", "ray", "rig", "rod", "row", "rug", "saw", "say", "sea", "set",
  "sun", "tab", "tag", "tan", "tap", "tar", "tax", "tea", "tie", "tin",
  "tip", "toe", "ton", "top", "toy", "tub", "tug", "van", "vat", "wig",
  "win", "wing", "wire", "wit", "yap", "yen", "yip", "zap", "zen", "zig",
];

const TOPIC_WORDS: Record<string, string[]> = {
  travel: ["travel", "trip", "tour", "vacation", "journey", "wander", "roam", "explore", "adventure", "voyage", "cruise", "flight", "hotel", "stay", "beach", "mountain", "road", "map", "globe", "passport"],
  ai: ["ai", "intelligence", "neural", "deep", "learn", "smart", "cortex", "mind", "brain", "think", "cogni", "sense", "logic", "infer", "adapt", "evolve", "predict"],
  health: ["health", "wellness", "med", "care", "vital", "life", "heal", "cure", "fit", "strength", "active", "balance", "clean", "fresh", "pure", "glow", "calm"],
  finance: ["finance", "pay", "bank", "fund", "capital", "wealth", "invest", "money", "cash", "credit", "debt", "save", "earn", "grow", "trade", "stock", "bond", "asset"],
  crypto: ["crypto", "blockchain", "bitcoin", "chain", "token", "wallet", "mine", "stake", "yield", "pool", "swap", "defi", "nft", "meta", "web3"],
  food: ["food", "eat", "cook", "chef", "meal", "dish", "taste", "flavor", "spice", "bake", "roast", "grill", "fresh", "organic", "vegan", "grain", "feast"],
  fashion: ["fashion", "style", "wear", "apparel", "cloth", "trend", "vogue", "chic", "glam", "luxe", "look", "fit", "tailor", "thread", "hem", "sew"],
  music: ["music", "song", "tune", "beat", "rhythm", "melody", "note", "chord", "band", "jam", "studio", "mix", "track", "play", "audio", "sound", "echo"],
  gaming: ["game", "play", "fun", "arcade", "quest", "level", "boss", "pixel", "retro", "multi", "arena", "battle", "craft", "build", "raid", "guild"],
  realestate: ["home", "house", "land", "property", "estate", "rent", "lease", "buy", "sell", "agent", "mortgage", "loan", "equity", "title", "deed", "lot"],
  marketing: ["brand", "market", "ad", "promo", "campaign", "social", "media", "content", "seo", "growth", "traffic", "lead", "sales", "convert", "engage"],
  education: ["learn", "edu", "school", "study", "class", "course", "skill", "knowledge", "train", "lesson", "tutor", "guide", "book", "read", "write"],
  entrepreneur: ["startup", "founder", "venture", "scale", "launch", "build", "create", "innovate", "disrupt", "lead", "vision", "mission", "drive"],
};

const TLD_POOL = [".com", ".io", ".ai", ".app", ".co", ".net", ".org", ".dev", ".tech", ".site", ".online", ".store", ".blog", ".design", ".studio"];

let combinedWords: string[] = [];
for (const words of Object.values(TOPIC_WORDS)) {
  for (const w of words) {
    if (!combinedWords.includes(w)) combinedWords.push(w);
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function combine(): string {
  const style = Math.random();
  if (style < 0.3) {
    return pick(PREFIXES) + pick(combinedWords);
  }
  if (style < 0.6) {
    return pick(combinedWords) + pick(SUFFIXES);
  }
  return pick(combinedWords) + pick(combinedWords);
}

export function generateDomains(count: number): Array<{ name: string; tld: string; isBrandable: boolean }> {
  const seen = new Set<string>();
  const domains: Array<{ name: string; tld: string; isBrandable: boolean }> = [];

  while (domains.length < count) {
    const name = combine();
    if (seen.has(name)) continue;
    seen.add(name);

    const tld = pick(TLD_POOL);
    const isBrandable = name.length >= 4 && name.length <= 10 && !/[0-9]/.test(name);

    domains.push({ name, tld, isBrandable });
  }

  return domains;
}

export function getExpansionKeywords(query: string): string[] {
  const q = query.toLowerCase().trim();
  const results = new Set<string>();
  results.add(q);

  // Check direct topic match
  for (const [, words] of Object.entries(TOPIC_WORDS)) {
    if (words.includes(q)) {
      for (const w of words) results.add(w);
      // Add prefixed/suffixed variants
      for (const w of words) {
        if (w.length >= 3) {
          results.add(w.slice(0, -1) + "y");
          results.add(w.slice(0, -2) + "ify");
        }
      }
    }
  }

  // Check partial match (query is substring of a topic word)
  for (const [, words] of Object.entries(TOPIC_WORDS)) {
    for (const w of words) {
      if (w.includes(q) && w !== q) results.add(w);
    }
  }

  return Array.from(results).slice(0, 20);
}
