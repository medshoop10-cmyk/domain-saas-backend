import prisma from "../config/database";

async function backfill() {
  await prisma.$executeRawUnsafe(`
    UPDATE "Domain"
    SET
      "domainType" = CASE
        WHEN "source" = 'wordlist' AND "price" IS NULL AND COALESCE("traffic", 0) = 0 AND "backlinks" = 0 THEN 'generated'
        ELSE 'market'
      END,
      "liquidityScore" = COALESCE(
        CASE WHEN "price" IS NOT NULL THEN 5 ELSE 0 END +
        CASE WHEN COALESCE("traffic", 0) > 0 THEN 3 ELSE 0 END +
        CASE WHEN "backlinks" > 0 THEN 2 ELSE 0 END,
      0),
      "bucket" = 'standard',
      "confidenceScore" = 0,
      "velocityScore" = 0,
      "opportunityScore" = 0
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "Domain"
    SET
      "bucket" = CASE
        WHEN "domainType" = 'generated' AND "isBrandable" = true AND "length" <= 12 AND "name" NOT LIKE '%-%' AND "name" ~ '^[a-zA-Z]+$' AND "score" >= 70 THEN 'brandable'
        WHEN "domainType" = 'market' AND "liquidityScore" >= 5 AND (COALESCE("traffic", 0) > 50 OR "backlinks" > 30) THEN 'trending'
        WHEN "domainType" = 'market' AND "liquidityScore" >= 5 AND "price" IS NOT NULL AND "price" < 300 AND "score" >= 10 THEN 'undervalued'
        ELSE 'standard'
      END,
      "opportunityScore" = LEAST(100, score + 3),
      "velocityScore" = GREATEST(0, COALESCE("traffic", 0) * 0.6 + "backlinks" * 0.4),
      "confidenceScore" = CASE
        WHEN "domainType" = 'generated' THEN ROUND((score * 0.6 + LEAST(100, score + 3) * 0.4) * 0.5)
        ELSE ROUND(score * 0.6 + LEAST(100, score + 3) * 0.4)
      END
  `);

  const buckets = await prisma.$queryRawUnsafe<Array<{ bucket: string; count: bigint }>>(
    `SELECT bucket, COUNT(*)::int as count FROM "Domain" GROUP BY bucket`
  );
  const types = await prisma.$queryRawUnsafe<Array<{ domainType: string; count: bigint }>>(
    `SELECT "domainType", COUNT(*)::int as count FROM "Domain" GROUP BY "domainType"`
  );
  console.log("Buckets:", JSON.stringify(buckets));
  console.log("Types:", JSON.stringify(types));

  await prisma.$disconnect();
}

backfill().catch(console.error);
