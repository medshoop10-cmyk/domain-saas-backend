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
const NICHE_KEYWORDS = ["ai", "tech", "data", "cloud", "pay", "health", "med", "bio", "fin", "crypto", "meta", "app", "hub", "lab"];

function dailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function nameHash(name: string): number {
  return ((name.charCodeAt(0) || 0) * 31 + (name.charCodeAt(name.length - 1) || 0) * 7) % 13;
}

function computeConfidenceLabel(d: any, synthetic: boolean): string {
  if (synthetic) return "Medium";
  if (d.confidenceScore >= 80) return "High";
  if (d.confidenceScore >= 50) return "Medium";
  return "Low";
}

function computeMarketLabel(d: any): { label: string; badge: string } {
  if (d.synthetic) return { label: "AI Estimated", badge: "🤖 AI Estimated Deal" };
  if (d.bids && d.bids > 0) return { label: `Current bid: $${d.price} (${d.bids} bids)`, badge: "🔥 Live Auction" };
  if (d.price) return { label: `Listed at $${d.price}`, badge: "🔥 Live Auction" };
  return { label: "Available", badge: "📋 Available" };
}

function computeBadges(d: any, synthetic: boolean): string[] {
  const badges: string[] = [];
  const { badge } = computeMarketLabel(d);
  badges.push(badge);
  if (d.urgencyScore >= 5) badges.push("🔥 Ending Soon");
  else if (d.urgencyScore >= 3) badges.push("⏳ Expiring Soon");
  if (d.bucket === "undervalued" && !synthetic) badges.push("💰 Undervalued");
  if (d.bucket === "trending") badges.push("📈 Trending");
  if (d.isBrandable && !synthetic) badges.push("🧠 Brandable");
  if (d.bids > 3) badges.push("🏆 Multiple Bids");
  if (d.velocityScore > 50) badges.push("⚡ Rising interest");
  return badges.slice(0, 3);
}

function computePriceRange(price: number | null | undefined, estimated: number): string {
  if (price) return `$${price}`;
  const low = Math.round(estimated * 0.6);
  const high = Math.round(estimated * 1.4);
  return `$${low} – $${high}`;
}

function computeResaleRange(estimated: number): string {
  const low = Math.round(estimated * 0.7);
  const high = Math.round(estimated * 1.3);
  return `$${low} – $${high}`;
}

function computeUndervaluedReason(d: any, estimatedResale: number): string | null {
  if (d.bucket !== "undervalued" && !d.synthetic) return null;
  const price = d.price;
  if (!price) return "Estimated below market value";
  if (estimatedResale > price * 2) return `Comparable names sell ~$${estimatedResale}`;
  return "Priced below intrinsic quality score";
}

function computeReasons(d: any, synthetic: boolean): string[] {
  const base = d.name.replace(/\..*$/, "").toLowerCase();
  const r: string[] = [];
  if (base.length <= 8) r.push("Short & pronounceable");
  if (PREMIUM_WORDS.has(base)) r.push("Contains premium keyword");
  if (d.tld === ".com") r.push("Premium .com TLD");
  if (d.tld === ".ai" || d.tld === ".io") r.push("Trending TLD");
  if (d.isBrandable) r.push("High brandability");
  if (!synthetic && d.price !== null && d.price < 300) r.push("Low price vs quality");
  if (d.traffic > 100) r.push("Has existing traffic");
  if (d.backlinks > 50) r.push("Established backlink profile");
  if (synthetic) r.push("Estimated based on length, TLD & keyword demand");
  return r.slice(0, 3);
}

function computeSellReasons(d: any, estimatedResale: number, synthetic: boolean): string[] {
  const base = d.name.replace(/\..*$/, "").toLowerCase();
  const r: string[] = [];
  const matched = NICHE_KEYWORDS.find((w) => base.includes(w));
  if (matched) {
    const range = computeResaleRange(estimatedResale);
    r.push(`Similar '${matched}' domains sell for ${range}`);
  }
  if (base.length <= 8) r.push("Short brandable names command premium prices");
  if (d.tld === ".com") r.push(".com domains hold strongest resale value");
  if (d.tld === ".ai" || d.tld === ".io") r.push("Trending TLD with growing demand");
  if (!synthetic && d.bids && d.bids > 0) r.push("Active bidding signals market validation");
  if (synthetic) r.push("AI estimated valuation based on market comps");
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
    let syntheticInjectedCount = 0;

    if (injectSynthetic && results.length < limit && generatedCount > 0) {
      const remaining = limit - results.length;
      const brandable = await prisma.domain.findMany({
        where: { domainType: "generated", bucket: "brandable" },
        orderBy: [{ confidenceScore: "desc" }, { score: "desc" }],
        take: remaining * 2,
        select: SELECT,
      });

      const brandableResults = brandable.slice(0, remaining).map((d) => {
        const estResale = computeEstimatedResale(d);
        return {
          ...d,
          synthetic: true,
          price: null,
          daysToExpire: 1 + Math.floor(Math.random() * 6),
          urgencyScore: 0,
          opportunityScore: d.score + 3,
          confidenceScore: Math.round((d.score * 0.6 + (d.score + 3) * 0.4) * 0.7),
          liquidityScore: 3,
          velocityScore: Math.round(Math.random() * 30),
          sellReasons: computeSellReasons(d, estResale, true),
          estimatedResale: estResale,
        };
      });

      syntheticInjectedCount = brandableResults.length;
      results = [...results, ...brandableResults];
    }

    const seed = dailySeed();
    const realCount = results.filter((r) => !r.synthetic).length;
    const estimatedCount = results.filter((r) => r.synthetic).length;

    const mapped = results.map((d) => {
      const hash = nameHash(d.name);
      const dailyVariance = ((hash + seed) % 7) - 3;
      const feedScore = (d.opportunityScore || 0) + (d.urgencyScore || 0) + ((d.velocityScore || 0) * 0.1) + dailyVariance;
      const synthetic = d.synthetic || false;
      const estResale = d.estimatedResale || computeEstimatedResale(d);
      const { label: marketLabel } = computeMarketLabel(d);
      const confidenceLabel = computeConfidenceLabel(d, synthetic);

      return {
        id: d.id,
        name: d.name,
        tld: d.tld,
        domain: d.name + d.tld,
        score: d.score,
        market: marketLabel,
        price: synthetic ? computePriceRange(null, estResale) : computePriceRange(d.price, estResale),
        estimatedResale: computeResaleRange(estResale),
        confidence: confidenceLabel,
        confidenceScore: d.confidenceScore,
        bucket: synthetic ? "estimated" : d.bucket,
        domainType: synthetic ? "estimated" : d.domainType,
        badges: computeBadges(d, synthetic),
        reasons: computeReasons(d, synthetic),
        sellReasons: d.sellReasons || computeSellReasons(d, estResale, synthetic),
        undervaluedReason: computeUndervaluedReason(d, estResale),
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
      realityRatio: { real: realCount, estimated: estimatedCount },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to build feed" });
  }
});

export default router;
