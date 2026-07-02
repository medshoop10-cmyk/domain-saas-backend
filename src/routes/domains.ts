import { Router, Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import redis from "../config/redis";
import { optionalAuth, requireAuth, AuthRequest } from "../middleware/auth";
import { checkUsageLimit } from "../middleware/checkUsageLimit";
import { recordSearch } from "../services/trending";
import { getExpansionKeywords } from "../services/domainGenerator";

const router = Router();

const PREMIUM_TLDS = new Set([".com", ".ai", ".io", ".app"]);
const HIGH_VALUE_NICHES = ["ai", "health", "finance", "crypto", "data", "cloud", "pay", "trade", "meta", "tech", "bio", "med", "edu"];

async function getTrendingKeywords(): Promise<Set<string>> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await prisma.searchHistory.findMany({
      where: { createdAt: { gte: twentyFourHoursAgo } },
      select: { query: true },
    });
    const counts = new Map<string, number>();
    for (const r of rows) {
      const words = r.query.toLowerCase().split(/\s+/);
      for (const w of words) {
        if (w.length >= 2) counts.set(w, (counts.get(w) || 0) + 1);
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    return new Set(sorted.map(([word]) => word));
  } catch {
    return new Set();
  }
}

function computeTopOpportunity(
  domain: { name: string; tld: string; length: number; score: number; isBrandable: boolean; hasKeywords: boolean },
  query?: string,
  trendingKeywords?: Set<string>,
) {
  let boost = 0;
  const reasons: string[] = [];
  const badges: string[] = [];

  if (domain.length <= 6) {
    boost += 10;
    reasons.push(`short (${domain.length} chars)`);
    badges.push("💎 Rare");
  } else if (domain.length <= 8) {
    boost += 5;
    reasons.push(`concise (${domain.length} chars)`);
  }

  if (PREMIUM_TLDS.has(domain.tld)) {
    boost += 8;
    if (domain.tld === ".ai" || domain.tld === ".io") {
      badges.push("🔥 Trending");
    }
  }

  if (domain.isBrandable) {
    boost += 8;
    reasons.push("highly brandable");
    if (!badges.includes("💎 Rare") && !badges.includes("🔥 Trending")) {
      badges.push("⭐ Premium pick");
    }
  }

  if (domain.hasKeywords) {
    boost += 7;
    reasons.push("high-value keyword");
    if (!badges.includes("🚀 High potential")) {
      badges.push("🚀 High potential");
    }
  }

  if (query) {
    const q = query.toLowerCase();
    for (const niche of HIGH_VALUE_NICHES) {
      if (q.includes(niche) || domain.name.toLowerCase().includes(niche)) {
        boost += 5;
        break;
      }
    }
  }

  // Trending keyword boost (from recent searches table)
  if (trendingKeywords && trendingKeywords.size > 0) {
    const domainLower = domain.name.toLowerCase();
    for (const kw of trendingKeywords) {
      if (domainLower.includes(kw) || (query && query.toLowerCase().includes(kw))) {
        boost += 15;
        if (!badges.includes("🔥 Trending")) badges.push("🔥 Trending");
        if (reasons.length > 0 && !reasons[0].includes("trending")) {
          reasons.unshift(`"${kw}" trending now`);
        }
        break;
      }
    }
  }

  const totalScore = Math.min(100, Math.round(domain.score + boost));

  // Build data-driven reason (structured for the UI)
  const specificParts: string[] = [];
  if (query) specificParts.push(`"${query}" keyword`);
  if (domain.score >= 80) specificParts.push(`score ${domain.score}`);
  if (domain.length <= 8) specificParts.push(`${domain.length} chars`);
  specificParts.push(`${domain.tld} TLD`);
  const specificReason = specificParts.join(" · ");

  // Build persuasive computedReason (reads like insight, not metadata)
  let trendingWord: string | null = null;
  if (trendingKeywords && trendingKeywords.size > 0) {
    const domainLower = domain.name.toLowerCase();
    for (const kw of trendingKeywords) {
      if (domainLower.includes(kw) || (query && query.toLowerCase().includes(kw))) {
        trendingWord = kw;
        break;
      }
    }
  }

  const persuasiveParts: string[] = [];
  if (trendingWord) persuasiveParts.push(`"${trendingWord}" is trending`);
  if (domain.length <= 6) persuasiveParts.push(`short (${domain.length} chars)`);
  else if (domain.length <= 10) persuasiveParts.push(`${domain.length} chars`);
  if (PREMIUM_TLDS.has(domain.tld)) persuasiveParts.push(`premium ${domain.tld}`);
  if (domain.isBrandable) persuasiveParts.push("brandable");
  if (domain.hasKeywords) persuasiveParts.push("high-value keywords");

  const computedReason = persuasiveParts.length > 0
    ? persuasiveParts.join(" + ")
    : `${domain.score} score · ${domain.length} chars · ${domain.tld}`;

  return { topOpportunityScore: totalScore, reason: specificReason, badges, computedReason };
}

function computeScoreBreakdown(
  domain: { name: string; tld: string; length: number; score: number; isBrandable: boolean; hasKeywords: boolean },
  query?: string,
  trendingKeywords?: Set<string>,
) {
  // Length score
  let lengthScore = 0;
  let lengthReason = "";
  if (domain.length <= 4) { lengthScore = 100; lengthReason = "Extremely short"; }
  else if (domain.length <= 6) { lengthScore = 90; lengthReason = "Short & memorable"; }
  else if (domain.length <= 8) { lengthScore = 70; lengthReason = "Good length"; }
  else if (domain.length <= 12) { lengthScore = 50; lengthReason = "Moderate length"; }
  else { lengthScore = 30; lengthReason = "Long name"; }

  // TLD score
  let tldScore = 0;
  let tldReason = "";
  if (domain.tld === ".com") { tldScore = 100; tldReason = "Premium .com"; }
  else if (domain.tld === ".ai") { tldScore = 95; tldReason = "Trending .ai TLD"; }
  else if (domain.tld === ".io") { tldScore = 85; tldReason = "Popular .io TLD"; }
  else if (domain.tld === ".app") { tldScore = 75; tldReason = "Solid .app TLD"; }
  else { tldScore = 50; tldReason = `${domain.tld} TLD`; }

  // Brandability score
  const brandScore = domain.isBrandable ? 90 : 40;
  const brandReason = domain.isBrandable ? "Highly brandable" : "Less brandable";

  // Keyword value score
  let keywordScore = 0;
  let keywordReason = "";
  if (domain.hasKeywords) {
    keywordScore = 85;
    keywordReason = "High-value keyword match";
    if (query) {
      for (const niche of HIGH_VALUE_NICHES) {
        if (query.toLowerCase().includes(niche) || domain.name.toLowerCase().includes(niche)) {
          keywordScore = 100;
          keywordReason = `"${niche}" niche match`;
          break;
        }
      }
    }
  } else {
    keywordScore = 30;
    keywordReason = "No keyword match";
  }

  // Trending signal
  let trendScore = 0;
  let trendReason = "No trending signal";
  if (trendingKeywords && trendingKeywords.size > 0) {
    const domainLower = domain.name.toLowerCase();
    for (const kw of trendingKeywords) {
      if (domainLower.includes(kw) || (query && query.toLowerCase().includes(kw))) {
        trendScore = 95;
        trendReason = `"${kw}" trending now`;
        break;
      }
    }
  }

  const breakdown = [
    { label: "Length", score: lengthScore, reason: lengthReason },
    { label: "TLD", score: tldScore, reason: tldReason },
    { label: "Brandability", score: brandScore, reason: brandReason },
    { label: "Keyword value", score: keywordScore, reason: keywordReason },
    { label: "Trending signal", score: trendScore, reason: trendReason },
  ];

  return { breakdown };
}

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

router.post("/ingest", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const usePlaywright = req.body.playwright === true;
    const count = Math.min(parseInt(req.body.count as string) || 500, 5000);

    if (usePlaywright) {
      const { scrapeAllSources } = await import("../scrapers");
      const { upsertScrapedDomains } = await import("../scrapers/upsertDomains");
      const scraped = await scrapeAllSources();
      const result = await upsertScrapedDomains([
        ...scraped.godaddy,
        ...scraped.expiredDomains,
        ...scraped.namecheap,
      ]);
      return res.json({
        message: `Scraped ${scraped.total} raw, ${result.filtered} passed SaaS fit filter (${result.inserted} new, ${result.updated} updated)`,
        sources: { godaddy: scraped.godaddy.length, expiredDomains: scraped.expiredDomains.length, namecheap: scraped.namecheap.length },
        inserted: result.inserted,
        updated: result.updated,
        filtered: result.filtered,
      });
    }

    const mod = await import("../jobs/domainIngestion");
    const result = await mod.ingestDomains(count);
    res.json({ message: `Ingested ${result.generator + result.scraper} domains (${result.scored} scored)`, ...result });
  } catch (err) {
    res.status(500).json({ error: "Ingestion failed", detail: (err as Error).message });
  }
});

router.get("/search", optionalAuth, checkUsageLimit("search"), async (req: AuthRequest, res: Response) => {
  try {
    const params = searchSchema.parse(req.query);
    const { q, tld, minScore, maxScore, minLength, maxLength, sortBy, sortOrder, page, limit, brandable, cursor } = params;

    const where: any = {};

    if (q) {
      const expansions = getExpansionKeywords(q);
      if (expansions.length > 1) {
        where.AND = [{ OR: expansions.map((term) => ({ name: { contains: term, mode: "insensitive" as const } })) }];
      } else {
        where.name = { contains: q.toLowerCase(), mode: "insensitive" };
      }
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
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ ...JSON.parse(cached), cached: true });
      }
    } catch {} // Redis unavailable, skip cache

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
              backlinks: true, source: true, price: true, traffic: true,
              createdAt: true,
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
              backlinks: true, source: true, price: true, traffic: true,
              createdAt: true,
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
            backlinks: true, source: true, price: true, traffic: true,
            createdAt: true,
          },
        }),
        prisma.domain.count({ where }),
      ]);
    }

    const trendingKeywords = await getTrendingKeywords();
    const nextCursor = domains.length === limit ? domains[domains.length - 1].id : null;

    const mapped = domains.map((d) => ({
      ...d,
      domain: d.name + d.tld,
      breakdown: computeScoreBreakdown(d, q, trendingKeywords).breakdown,
    }));
    let topOpportunity = null;
    if (mapped.length > 0) {
      const scored = mapped.map((d) => {
        const opp = computeTopOpportunity(d, q, trendingKeywords);
        return { ...d, ...opp };
      });
      scored.sort((a, b) => b.topOpportunityScore - a.topOpportunityScore);
      topOpportunity = {
        id: scored[0].id,
        domain: scored[0].domain,
        name: scored[0].name,
        tld: scored[0].tld,
        score: scored[0].score,
        topOpportunityScore: scored[0].topOpportunityScore,
        reason: scored[0].reason,
        computedReason: scored[0].computedReason,
        badges: scored[0].badges,
        breakdown: scored[0].breakdown,
      };
    }

    let suggestions: string[] = [];
    if (mapped.length === 0 && q) {
      const expansions = getExpansionKeywords(q);
      suggestions = expansions.slice(0, 8);
    }

    const result = {
      domains: mapped,
      topOpportunity,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      nextCursor,
      cached: false,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };

    try { await redis.setex(cacheKey, 60, JSON.stringify(result)); } catch {}

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

router.get("/expand", async (req, res: Response) => {
  try {
    const q = (req.query.q as string)?.trim()?.toLowerCase();
    if (!q || q.length < 2) return res.json({ query: q, suggestions: [], expansions: [] });

    const expansions = getExpansionKeywords(q);

    let suggestions: Array<{ name: string; tld: string; score: number }> = [];
    if (expansions.length > 0) {
      suggestions = await prisma.domain.findMany({
        where: {
          OR: expansions.slice(0, 5).map((term) => ({ name: { contains: term, mode: "insensitive" } })),
        },
        select: { name: true, tld: true, score: true },
        orderBy: { score: "desc" },
        take: 6,
      });
    }

    if (suggestions.length === 0) {
      for (const exp of expansions.slice(0, 6)) {
        if (exp.length >= 3) {
          suggestions.push({ name: exp + "hub", tld: ".com", score: 85 });
          suggestions.push({ name: "get" + exp, tld: ".io", score: 78 });
        }
      }
    }

    res.json({ query: q, suggestions, expansions });
  } catch {
    res.json({ query: req.query.q, suggestions: [], expansions: [] });
  }
});

router.get("/:id", async (req, res: Response) => {
  const id = req.params.id as string;
  const domain = await prisma.domain.findUnique({
    where: { id },
    select: {
      id: true, name: true, tld: true, length: true,
      score: true, isBrandable: true, hasKeywords: true,
      backlinks: true, source: true, price: true, traffic: true,
      createdAt: true,
    },
  });

  if (!domain) {
    return res.status(404).json({ error: "Domain not found" });
  }

  res.json({ ...domain, domain: domain.name + domain.tld });
});

export default router;
