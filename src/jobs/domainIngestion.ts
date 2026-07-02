import prisma from "../config/database";
import { scrapeAllSources } from "../services/freshDropScraper";
import { generateDomains } from "../services/domainGenerator";
import { scoreDomain } from "../services/scoring";

const BATCH_SIZE = 50;

async function upsertDomains(domains: Array<{ name: string; tld: string; isBrandable?: boolean; backlinks?: number }>): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < domains.length; i += BATCH_SIZE) {
    const batch = domains.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((d) =>
        prisma.domain.upsert({
          where: { name: d.name },
          update: {}, // keep existing data
          create: {
            name: d.name,
            tld: d.tld,
            length: d.name.length,
            score: 0, // will be computed below
            isBrandable: d.isBrandable ?? (d.name.length >= 4 && d.name.length <= 10 && /^[a-z]+$/.test(d.name)),
            hasKeywords: true,
            backlinks: d.backlinks ?? 0,
          },
        })
      )
    );

    for (const r of results) {
      if (r.status === "fulfilled") inserted++;
    }
  }

  return inserted;
}

async function computeScoresForNewDomains(): Promise<number> {
  const unscored = await prisma.domain.findMany({
    where: { score: 0 },
    select: { id: true, name: true, tld: true, length: true, isBrandable: true, hasKeywords: true },
  });

  for (const d of unscored) {
    const result = scoreDomain(d.name, d.tld);

    await prisma.domain.update({
      where: { id: d.id },
      data: { score: result.score },
    });
  }

  return unscored.length;
}

export async function ingestDomains(count: number = 500): Promise<{ generator: number; scraper: number; scored: number }> {
  console.log(`Starting domain ingestion (target: ${count})...`);

  // 1. Try scraping real expired domains
  const scraped = await scrapeAllSources();
  const scraperInserted = scraped.length > 0 ? await upsertDomains(scraped) : 0;
  console.log(`Scraped sources returned ${scraped.length}, upserted ${scraperInserted} new domains`);

  // 2. Fill remaining with wordlist-generated domains
  const remaining = Math.max(0, count - scraperInserted);
  let generatorInserted = 0;

  if (remaining > 0) {
    const generated = generateDomains(remaining);
    generatorInserted = await upsertDomains(generated.map((d) => ({
      name: d.name,
      tld: d.tld,
      isBrandable: d.isBrandable,
    })));
    console.log(`Generated ${generated.length} wordlist domains, upserted ${generatorInserted} new`);
  }

  // 3. Score any unscored domains
  const scored = await computeScoresForNewDomains();
  console.log(`Scored ${scored} domains`);

  return { generator: generatorInserted, scraper: scraperInserted, scored };
}

export async function scheduleDailyIngestion(cronExpression: string = "0 6 * * *"): Promise<void> {
  const cron = require("node-cron");
  cron.schedule(cronExpression, async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled domain ingestion...`);
    try {
      const result = await ingestDomains(1000);
      console.log(`Ingestion complete:`, result);
    } catch (err) {
      console.error("Scheduled ingestion failed:", err);
    }
  });

  console.log(`Domain ingestion scheduled with cron: ${cronExpression}`);
}
