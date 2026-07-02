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

function computeBadges(d: any): string[] {
  const badges: string[] = [];
  if (d.urgencyScore >= 5) badges.push("🔥 Ending Soon");
  else if (d.urgencyScore >= 3) badges.push("⏳ Expiring Soon");
  if (d.bucket === "undervalued") badges.push("💰 Undervalued");
  if (d.bucket === "trending") badges.push("📈 Trending");
  if (d.traffic && d.traffic > 100) badges.push("📈 High Traffic");
  if (d.isBrandable) badges.push("🧠 Brandable");
  if (d.bids > 3) badges.push("🏆 Multiple Bids");
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

    const map = (d: any) => ({
      ...d,
      domain: d.name + d.tld,
      badges: computeBadges(d),
      reasons: computeReasons(d),
    });

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
