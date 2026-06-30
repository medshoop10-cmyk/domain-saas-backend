import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import redis from "../config/redis";
import { optionalAuth, AuthRequest } from "../middleware/auth";
import { checkUsageLimit } from "../middleware/checkUsageLimit";
import { recordSearch } from "../services/trending";

const router = Router();

const searchSchema = z.object({
  q: z.string().optional(),
  tld: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  minLength: z.coerce.number().min(1).optional(),
  maxLength: z.coerce.number().min(1).optional(),
  sortBy: z.enum(["score", "length", "createdAt", "name"]).optional().default("score"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  brandable: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
});

router.get("/search", optionalAuth, checkUsageLimit("search"), async (req: AuthRequest, res: Response) => {
  try {
    const params = searchSchema.parse(req.query);
    const { q, tld, minScore, maxScore, minLength, maxLength, sortBy, sortOrder, page, limit, brandable, cursor } = params;

    const where: any = {};

    if (q) {
      where.name = { contains: q.toLowerCase(), mode: "insensitive" };
    }
    if (tld) {
      where.tld = tld.startsWith(".") ? tld.toLowerCase() : `.${tld.toLowerCase()}`;
    }
    if (minScore !== undefined) where.score = { ...where.score, gte: minScore };
    if (maxScore !== undefined) where.score = { ...where.score, lte: maxScore };
    if (minLength !== undefined) where.length = { ...where.length, gte: minLength };
    if (maxLength !== undefined) where.length = { ...where.length, lte: maxLength };
    if (brandable !== undefined) where.isBrandable = brandable;

    const cacheKey = `search:${JSON.stringify(params)}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ ...JSON.parse(cached), cached: true });
    }

    let domains;
    let total: number;

    if (cursor && page > 3) {
      const cursorDomain = await prisma.domain.findUnique({
        where: { id: cursor },
        select: { id: true, [sortBy]: true },
      });

      if (cursorDomain) {
        const cursorVal = (cursorDomain as any)[sortBy];
        const cursorWhere: any = { ...where };

        if (sortOrder === "desc") {
          cursorWhere.OR = [
            { [sortBy]: { lt: cursorVal } },
            { [sortBy]: cursorVal, id: { gt: cursor } },
          ];
        } else {
          cursorWhere.OR = [
            { [sortBy]: { gt: cursorVal } },
            { [sortBy]: cursorVal, id: { gt: cursor } },
          ];
        }

        [domains, total] = await Promise.all([
          prisma.domain.findMany({
            where: cursorWhere,
            orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
            take: limit,
            select: {
              id: true, name: true, tld: true, length: true,
              score: true, isBrandable: true, hasKeywords: true,
              backlinks: true, createdAt: true,
            },
          }),
          prisma.domain.count({ where }),
        ]);
      } else {
        [domains, total] = await Promise.all([
          prisma.domain.findMany({
            where,
            orderBy: { [sortBy]: sortOrder },
            skip: (page - 1) * limit,
            take: limit,
            select: {
              id: true, name: true, tld: true, length: true,
              score: true, isBrandable: true, hasKeywords: true,
              backlinks: true, createdAt: true,
            },
          }),
          prisma.domain.count({ where }),
        ]);
      }
    } else {
      [domains, total] = await Promise.all([
        prisma.domain.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true, name: true, tld: true, length: true,
            score: true, isBrandable: true, hasKeywords: true,
            backlinks: true, createdAt: true,
          },
        }),
        prisma.domain.count({ where }),
      ]);
    }

    const nextCursor = domains.length === limit ? domains[domains.length - 1].id : null;

    const result = {
      domains: domains.map((d) => ({
        ...d,
        domain: d.name + d.tld,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      nextCursor,
      cached: false,
    };

    await redis.setex(cacheKey, 60, JSON.stringify(result));

    if (domains.length > 0 && q) {
      await recordSearch(domains[0].id).catch(() => {});
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid search parameters" });
    }
    throw error;
  }
});

router.get("/:id", async (req, res: Response) => {
  const id = req.params.id as string;
  const domain = await prisma.domain.findUnique({
    where: { id },
    select: {
      id: true, name: true, tld: true, length: true,
      score: true, isBrandable: true, hasKeywords: true,
      backlinks: true, createdAt: true,
    },
  });

  if (!domain) {
    return res.status(404).json({ error: "Domain not found" });
  }

  res.json({ ...domain, domain: domain.name + domain.tld });
});

export default router;
