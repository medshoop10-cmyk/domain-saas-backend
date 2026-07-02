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
} as const;

router.get("/", optionalAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const [trending, brandable, undervalued, total] = await Promise.all([
      prisma.domain.findMany({
        where: {
          domainType: "market",
          bucket: "trending",
        },
        orderBy: [
          { confidenceScore: "desc" },
          { velocityScore: "desc" },
          { opportunityScore: "desc" },
          { score: "desc" },
        ],
        take: 20,
        select: SELECT,
      }),
      prisma.domain.findMany({
        where: {
          domainType: "generated",
          bucket: "brandable",
        },
        orderBy: [
          { confidenceScore: "desc" },
          { opportunityScore: "desc" },
          { score: "desc" },
        ],
        take: 20,
        select: SELECT,
      }),
      prisma.domain.findMany({
        where: {
          domainType: "market",
          bucket: "undervalued",
        },
        orderBy: [
          { confidenceScore: "desc" },
          { opportunityScore: "desc" },
          { score: "desc" },
          { price: "asc" },
        ],
        take: 20,
        select: SELECT,
      }),
      prisma.domain.count(),
    ]);

    const map = (d: any) => ({ ...d, domain: d.name + d.tld });

    res.json({
      trending: trending.map(map),
      brandable: brandable.map(map),
      undervalued: undervalued.map(map),
      total,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch top picks" });
  }
});

export default router;
