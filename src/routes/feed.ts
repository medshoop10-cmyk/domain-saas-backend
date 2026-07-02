import { Router, Response } from "express";
import prisma from "../config/database";
import { optionalAuth, AuthRequest } from "../middleware/auth";

const router = Router();

const SELECT = {
  id: true, name: true, tld: true, length: true,
  score: true, isBrandable: true, hasKeywords: true,
  backlinks: true, source: true, price: true, traffic: true,
  opportunityScore: true, bucket: true,
  velocityScore: true, confidenceScore: true,
  liquidityScore: true, domainType: true,
  urgencyScore: true, bids: true, daysToExpire: true,
} as const;

const PREMIUM_WORDS = new Set(["ai", "tech", "cloud", "data", "app", "hub", "lab", "pay", "flow", "base", "stack", "peak", "nexus", "core", "prime", "pulse"]);

function dailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function nameHash(name: string): number {
  return ((name.charCodeAt(0) || 0) * 31 + (name.charCodeAt(name.length - 1) || 0) * 7) % 13;
}

function computeBadges(d: any): string[] {
  const badges: string[] = [];
  if (d.urgencyScore >= 5) badges.push("🔥 Ending Soon");
  else if (d.urgencyScore >= 3) badges.push("⏳ Expiring Soon");
  if (d.bucket === "undervalued") badges.push("💰 Undervalued");
  if (d.bucket === "trending") badges.push("📈 Trending");
  if (d.synthetic) badges.push("🤖 AI Estimated Deal");
  if (d.isBrandable) badges.push("🧠 Brandable");
  if (d.bids > 3) badges.push("🏆 Multiple Bids");
  if (d.velocityScore > 50) badges.push("⚡ Rising interest");
  return badges.slice(0, 2);
}

function computeReasons(d: any): string[] {
  const base = d.name.replace(/\..*$/, "").toLowerCase();
  const r: string[] = [];
  if (base.length <= 8) r.push("Short & pronounceable");
  if (PREMIUM_WORDS.has(base)) r.push("Contains premium keyword");
  if (d.tld === ".com") r.push("Premium .com TLD");
  if (d.tld === ".ai" || d.tld === ".io") r.push("Trending TLD");
  if (d.isBrandable) r.push("High brandability");
  if (d.price !== null && d.price < 300) r.push("Low price vs quality");
  if (d.traffic > 100) r.push("Has existing traffic");
  if (d.backlinks > 50) r.push("Established backlink profile");
  return r.slice(0, 3);
}

function computeSellReasons(d: any, estimatedResale: number): string[] {
  const base = d.name.replace(/\..*$/, "").toLowerCase();
  const r: string[] = [];
  const niches = ["ai", "tech", "data", "cloud", "pay", "health", "med", "bio", "fin", "crypto", "meta", "app", "hub", "lab"];
  const matched = niches.find((w) => base.includes(w));
  if (matched) {
    const range = estimatedResale < 500 ? "$200–$800" : estimatedResale < 1500 ? "$500–$2,500" : "$1,000–$5,000+";
    r.push(`Similar '${matched}' domains sell for ${range}`);
  }
  if (base.length <= 8) r.push("Short brandable names command premium prices");
  if (d.tld === ".com") r.push(".com domains hold strongest resale value");
  r.push("Strong keyword demand in current market");
  return r.slice(0, 2);
}

function computeEstimatedResale(d: any): number {
  const base = d.name.replace(/\..*$/, "").toLowerCase();
  const lengthScore = base.length <= 8 ? 10 : base.length <= 12 ? 7 : 4;
  const wordBonus = PREMIUM_WORDS.has(base) ? 2 : 0;
  const brandableBonus = d.isBrandable ? 3 : 1;
  const tldBonus = d.tld === ".com" ? 3 : d.tld === ".ai" || d.tld === ".io" ? 2 : 1;
  const nicheMultiplier = ["ai", "tech", "data", "cloud", "pay", "health"].some((w) => base.includes(w)) ? 1.5 : 1;
  const baseValue = (lengthScore * 100 + wordBonus * 400 + brandableBonus * 300 + tldBonus * 100) * nicheMultiplier;
  return Math.max(100, Math.round(baseValue));
}

router.get("/", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);
    const page = Math.max(0, parseInt(req.query.page as string) || 0);
    const skip = page * limit;

    const marketCount = await prisma.domain.count({ where: { domainType: "market" } });
    const generatedCount = await prisma.domain.count({ where: { domainType: "generated" } });
    const injectSynthetic = marketCount < 10;

    const marketDomains = await prisma.domain.findMany({
      where: { domainType: "market", bucket: { not: "standard" } },
      orderBy: [{ confidenceScore: "desc" }, { velocityScore: "desc" }, { opportunityScore: "desc" }],
      take: injectSynthetic ? limit : limit * 2,
      select: SELECT,
    });

    let results: any[] = marketDomains.map((d) => ({ ...d, synthetic: false }));

    if (injectSynthetic && results.length < limit && generatedCount > 0) {
      const remaining = limit - results.length;
      const brandable = await prisma.domain.findMany({
        where: { domainType: "generated", bucket: "brandable" },
        orderBy: [{ confidenceScore: "desc" }, { score: "desc" }],
        take: remaining * 2,
        select: SELECT,
      });

      const brandableResults = brandable.slice(0, remaining).map((d) => {
        const base = d.name.replace(/\..*$/, "");
        const lengthScore = base.length <= 8 ? 10 : base.length <= 12 ? 7 : 4;
        const wordBonus = PREMIUM_WORDS.has(base) ? 2 : 0;
        const brandableBonus = d.isBrandable ? 3 : 0;
        const tldBonus = d.tld === ".com" ? 3 : d.tld === ".ai" || d.tld === ".io" ? 2 : 0;
        const syntheticPrice = lengthScore * 50 + wordBonus * 200 + brandableBonus * 200 + tldBonus * 100 + Math.round(Math.random() * 100 - 50);
        const daysToExp = 1 + Math.floor(Math.random() * 6);
        const urgency = daysToExp < 1 ? 5 : daysToExp < 3 ? 3 : daysToExp < 7 ? 1 : 0;
        const oppScore = d.score + urgency + 5;
        const estResale = computeEstimatedResale(d);
        return {
          ...d,
          synthetic: true,
          price: Math.max(50, syntheticPrice),
          daysToExpire: daysToExp,
          urgencyScore: urgency,
          opportunityScore: oppScore,
          confidenceScore: Math.round((d.score * 0.6 + oppScore * 0.4) * 0.7),
          liquidityScore: 3,
          velocityScore: Math.round(Math.random() * 30),
          sellReasons: computeSellReasons(d, estResale),
          estimatedResale: estResale,
        };
      });
      results = [...results, ...brandableResults];
    }

    const seed = dailySeed();
    const mapped = results.map((d) => {
      const hash = nameHash(d.name);
      const dailyVariance = ((hash + seed) % 7) - 3;
      const feedScore = (d.opportunityScore || 0) + (d.urgencyScore || 0) + ((d.velocityScore || 0) * 0.1) + dailyVariance;
      return {
        id: d.id,
        name: d.name,
        tld: d.tld,
        domain: d.name + d.tld,
        score: d.score,
        price: d.price,
        traffic: d.traffic,
        backlinks: d.backlinks,
        source: d.source,
        bucket: d.bucket,
        domainType: d.domainType,
        synthetic: d.synthetic || false,
        opportunityScore: d.opportunityScore,
        urgencyScore: d.urgencyScore,
        confidenceScore: d.confidenceScore,
        liquidityScore: d.liquidityScore,
        velocityScore: d.velocityScore,
        estimatedResale: d.estimatedResale || computeEstimatedResale(d),
        badges: computeBadges(d),
        reasons: computeReasons(d),
        sellReasons: d.sellReasons || computeSellReasons(d, d.estimatedResale || computeEstimatedResale(d)),
        feedScore: Math.round(feedScore * 10) / 10,
      };
    });

    mapped.sort((a, b) => b.feedScore - a.feedScore);

    const paginated = mapped.slice(skip, skip + limit);

    res.json({
      feed: paginated,
      total: results.length,
      page,
      limit,
      syntheticInjected: injectSynthetic,
      marketCount,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to build feed" });
  }
});

export default router;
