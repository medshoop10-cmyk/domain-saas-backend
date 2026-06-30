import prisma from "../config/database";
import redis from "../config/redis";

const TRENDING_CACHE_KEY = "trending:domains";
const CACHE_TTL = 300;

export async function getTrendingDomains(page = 1, limit = 20) {
  const cached = await redis.get(TRENDING_CACHE_KEY);
  if (cached) {
    const data = JSON.parse(cached);
    const start = (page - 1) * limit;
    return {
      domains: data.slice(start, start + limit),
      total: data.length,
      page,
      limit,
      cached: true,
    };
  }

  const domains = await prisma.trendingDomain.findMany({
    orderBy: { rank: "asc" },
    take: 100,
    include: {
      domain: {
        select: {
          id: true,
          name: true,
          tld: true,
          score: true,
          length: true,
        },
      },
    },
  });

  const formatted = domains.map((d) => ({
    id: d.id,
    domain: d.domain.name + d.domain.tld,
    name: d.domain.name,
    tld: d.domain.tld,
    score: d.domain.score,
    trendingScore: d.score,
    searches: d.searches,
    saves: d.saves,
    rank: d.rank,
  }));

  await redis.setex(TRENDING_CACHE_KEY, CACHE_TTL, JSON.stringify(formatted));

  const start = (page - 1) * limit;
  return {
    domains: formatted.slice(start, start + limit),
    total: formatted.length,
    page,
    limit,
    cached: false,
  };
}

export async function recordSearch(domainId: string) {
  try {
    await prisma.trendingDomain.upsert({
      where: { domainId },
      update: {
        searches: { increment: 1 },
        score: { increment: 1 },
      },
      create: {
        domainId,
        searches: 1,
        score: 1,
        saves: 0,
        rank: 0,
      },
    });
    await redis.del(TRENDING_CACHE_KEY);
  } catch {
    // silently fail - trending is non-critical
  }
}

export async function recordSave(domainId: string) {
  try {
    await prisma.trendingDomain.upsert({
      where: { domainId },
      update: {
        saves: { increment: 1 },
        score: { increment: 2 },
      },
      create: {
        domainId,
        saves: 1,
        score: 2,
        searches: 0,
        rank: 0,
      },
    });
    await redis.del(TRENDING_CACHE_KEY);
  } catch {
    // silently fail
  }
}

export async function recalculateRanks() {
  const domains = await prisma.trendingDomain.findMany({
    orderBy: [{ score: "desc" }, { searches: "desc" }],
    take: 500,
  });

  for (let i = 0; i < domains.length; i++) {
    await prisma.trendingDomain.update({
      where: { id: domains[i].id },
      data: { rank: i + 1 },
    });
  }

  await redis.del(TRENDING_CACHE_KEY);
}
