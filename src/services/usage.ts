import prisma from "../config/database";
import redis from "../config/redis";

const CACHE_TTL = 86400;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(userId: string, date: string): string {
  return `usage:${userId}:${date}`;
}

export type UsageField = "searchesCount" | "alertsCount" | "favoritesCount";

export interface UsageData {
  searchesCount: number;
  alertsCount: number;
  favoritesCount: number;
}

export async function getUsage(userId: string, date?: string): Promise<UsageData> {
  const d = date || today();
  const key = cacheKey(userId, d);

  try {
    const cached = await redis.hgetall(key);
    if (cached && cached.searchesCount !== undefined) {
      return {
        searchesCount: parseInt(cached.searchesCount) || 0,
        alertsCount: parseInt(cached.alertsCount) || 0,
        favoritesCount: parseInt(cached.favoritesCount) || 0,
      };
    }
  } catch {}

  const usage = await prisma.usage.findUnique({
    where: { userId_date: { userId, date: d } },
    select: { searchesCount: true, alertsCount: true, favoritesCount: true },
  });

  const result: UsageData = usage || { searchesCount: 0, alertsCount: 0, favoritesCount: 0 };

  try {
    await redis.hset(key, result);
    await redis.expire(key, CACHE_TTL);
  } catch {}

  return result;
}

export async function incrementUsage(
  userId: string,
  field: UsageField,
  date?: string
): Promise<{ current: number; usage: UsageData }> {
  const d = date || today();
  const key = cacheKey(userId, d);

  const usage = await prisma.usage.upsert({
    where: { userId_date: { userId, date: d } },
    create: { userId, date: d, [field]: 1 },
    update: { [field]: { increment: 1 } },
    select: { searchesCount: true, alertsCount: true, favoritesCount: true },
  });

  const current = usage[field];

  try {
    await redis.hset(key, {
      searchesCount: usage.searchesCount,
      alertsCount: usage.alertsCount,
      favoritesCount: usage.favoritesCount,
    });
    await redis.expire(key, CACHE_TTL);
  } catch {}

  return { current, usage };
}

export async function resetUsage(userId: string, date?: string): Promise<void> {
  const d = date || today();
  const key = cacheKey(userId, d);

  await prisma.usage.deleteMany({ where: { userId, date: d } });

  try {
    await redis.del(key);
  } catch {}
}
