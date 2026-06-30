import prisma from "../config/database";
import { scoreDomain } from "../services/scoring";

const BATCH_SIZE = 100;

export async function scoreUnscoredDomains() {
  console.log("[DomainScorer] Starting batch scoring...");

  let processed = 0;
  let hasMore = true;

  while (hasMore) {
    const domains = await prisma.domain.findMany({
      where: { score: 0 },
      take: BATCH_SIZE,
    });

    if (domains.length === 0) {
      hasMore = false;
      break;
    }

    for (const domain of domains) {
      const result = scoreDomain(domain.name, domain.tld);
      await prisma.domain.update({
        where: { id: domain.id },
        data: {
          score: result.score,
          isBrandable: result.breakdown.brandability > 0,
          hasKeywords: result.breakdown.keyword > 5,
        },
      });
      processed++;
    }

    console.log(`[DomainScorer] Scored ${processed} domains so far...`);
  }

  console.log(`[DomainScorer] Complete. Scored ${processed} domains.`);
}

export async function rescoreAllDomains() {
  console.log("[DomainScorer] Starting full rescore...");

  let processed = 0;
  let cursor: string | undefined;

  while (true) {
    const domains = await prisma.domain.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (domains.length === 0) break;

    for (const domain of domains) {
      const result = scoreDomain(domain.name, domain.tld);
      await prisma.domain.update({
        where: { id: domain.id },
        data: {
          score: result.score,
          isBrandable: result.breakdown.brandability > 0,
          hasKeywords: result.breakdown.keyword > 5,
        },
      });
      processed++;
      cursor = domain.id;
    }
  }

  console.log(`[DomainScorer] Full rescore complete. Scored ${processed} domains.`);
}
