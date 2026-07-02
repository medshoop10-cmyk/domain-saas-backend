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

function computeConfidenceLabel(d: any): string {
  if (d.domainType === "generated") return "Medium";
  if (d.confidenceScore >= 80) return "High";
  if (d.confidenceScore >= 50) return "Medium";
  return "Low";
}

function computeMarketLabel(d: any): { label: string; badge: string } {
  if (d.bids && d.bids > 0) return { label: `Current bid: $${d.price} (${d.bids} bids)`, badge: "🔥 Live Auction" };
  if (d.price) return { label: `Listed at $${d.price}`, badge: "🔥 Live Auction" };
  return { label: "AI Estimated", badge: "🤖 AI Estimated Deal" };
}

function computeBadges(d: any): string[] {
  const badges: string[] = [];
  const { badge } = computeMarketLabel(d);
  badges.push(badge);
  if (d.urgencyScore >= 5) badges.push("🔥 Ending Soon");
  else if (d.urgencyScore >= 3) badges.push("⏳ Expiring Soon");
  if (d.bucket === "undervalued") badges.push("💰 Undervalued");
  if (d.bucket === "trending") badges.push("📈 Trending");
  if (d.traffic && d.traffic > 100) badges.push("📈 High Traffic");
  if (d.isBrandable) badges.push("🧠 Brandable");
  if (d.bids > 3) badges.push("🏆 Multiple Bids");
  return badges.slice(0, 3);
}

function computeResaleRange(estimated: number): string {
  const low = Math.round(estimated * 0.7);
  const high = Math.round(estimated * 1.3);
  return `$${low} – $${high}`;
}

function computeUndervaluedReason(d: any): string | null {
  if (d.bucket !== "undervalued") return null;
  const price = d.price;
  if (!price) return "Estimated below market value";
  const estResale = Math.max(100, Math.round(d.score * 12 + 500));
  if (estResale > price * 2) return `Comparable names sell ~$${estResale}`;
  return "Priced below intrinsic quality score";
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
  if (d.traffic && d.traffic > 100) r.push("Has existing traffic");
  if (d.backlinks > 50) r.push("Established backlink profile");
  return r.slice(0, 3);
}

router.get("/", optionalAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const [trending, brandable, undervalued] = await Promise.all([
      prisma.domain.findMany({
        where: { domainType: "market", bucket: "trending" },
        orderBy: [{ confidenceScore: "desc" }, { velocityScore: "desc" }, { opportunityScore: "desc" }, { score: "desc" }],
        take: 20,
        select: SELECT,
      }),
      prisma.domain.findMany({
        where: { domainType: "generated", bucket: "brandable" },
        orderBy: [{ confidenceScore: "desc" }, { opportunityScore: "desc" }, { score: "desc" }],
        take: 20,
        select: SELECT,
      }),
      prisma.domain.findMany({
        where: { domainType: "market", bucket: "undervalued" },
        orderBy: [{ confidenceScore: "desc" }, { opportunityScore: "desc" }, { score: "desc" }, { price: "asc" }],
        take: 20,
        select: SELECT,
      }),
    ]);

    const map = (d: any) => {
      const { label: marketLabel } = computeMarketLabel(d);
      const estResale = Math.max(100, Math.round(d.score * 12 + 500));
      return {
        ...d,
        domain: d.name + d.tld,
        market: marketLabel,
        estimatedResale: computeResaleRange(estResale),
        confidence: computeConfidenceLabel(d),
        badges: computeBadges(d),
        reasons: computeReasons(d),
        undervaluedReason: computeUndervaluedReason(d),
      };
    };

    res.json({
      trending: trending.map(map),
      brandable: brandable.map(map),
      undervalued: undervalued.map(map),
      total: 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch top picks" });
  }
});

export default router;
