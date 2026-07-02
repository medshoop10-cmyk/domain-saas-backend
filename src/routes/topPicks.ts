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
} as const;

const BASE: any = {};

router.get("/", optionalAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const [trending, brandable, undervalued, total] = await Promise.all([
      prisma.domain.findMany({
        where: {
          OR: [
            { bucket: "trending" },
            { traffic: { gt: 50 }, bucket: "standard" },
            { backlinks: { gt: 30 }, bucket: "standard" },
          ],
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
          OR: [
            { bucket: "brandable" },
            {
              isBrandable: true,
              length: { lte: 12 },
              score: { gte: 70 },
              bucket: "standard",
            },
          ],
          isBrandable: true,
          length: { lte: 12 },
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
          OR: [
            { bucket: "undervalued" },
            {
              price: { not: null, lte: 300 },
              score: { gte: 10 },
              bucket: "standard",
            },
          ],
          price: { not: null, lte: 300 },
          NOT: { price: null },
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
