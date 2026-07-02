import prisma from "../config/database";
import type { ScrapedDomain } from "../utils/normalizer";

export async function upsertScrapedDomains(
  domains: ScrapedDomain[]
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  const batchSize = 50;
  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((d) =>
        prisma.domain.upsert({
          where: { name: d.name },
          update: {
            score: d.score,
            isBrandable: d.isBrandable,
            hasKeywords: d.hasKeywords,
            backlinks: Math.max(d.backlinks, 0),
            source: d.source,
            ...(d.price !== undefined ? { price: d.price } : {}),
            ...(d.traffic !== undefined ? { traffic: d.traffic } : {}),
          },
          create: {
            name: d.name,
            tld: d.tld,
            length: d.length,
            score: d.score,
            isBrandable: d.isBrandable,
            hasKeywords: d.hasKeywords,
            backlinks: d.backlinks ?? 0,
            source: d.source,
            price: d.price,
            traffic: d.traffic,
          },
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        if ((r.value as any).createdAt === (r.value as any).updatedAt) inserted++;
        else updated++;
      }
    }
  }

  return { inserted, updated };
}
