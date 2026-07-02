import prisma from "../config/database";

async function backfill() {
  const r = await prisma.$executeRawUnsafe(`
    UPDATE "Domain"
    SET
      "velocityScore" = GREATEST(0,
        COALESCE("traffic", 0) * 0.6 + COALESCE("backlinks", 0) * 0.4
      ),
      "googleResults" = 0,
      "bucket" = CASE
        WHEN COALESCE("traffic", 0) > 50 OR "backlinks" > 30 THEN 'trending'
        WHEN "isBrandable" = true AND "length" <= 12 AND "name" NOT LIKE '%-%' AND "name" ~ '^[a-zA-Z]+$' AND "score" >= 70 THEN 'brandable'
        WHEN "price" IS NOT NULL AND "price" < 300 AND "score" >= 10 THEN 'undervalued'
        ELSE 'standard'
      END
  `);
  console.log(`Updated ${r} rows`);

  await prisma.$executeRawUnsafe(`
    UPDATE "Domain"
    SET
      "opportunityScore" = LEAST(100, "score" + 3),
      "confidenceScore" = GREATEST(0, LEAST(100, "score" * 0.6 + "opportunityScore" * 0.4))
  `);
  console.log("Confidence scores backfilled");

  const dist = await prisma.domain.groupBy({ by: ["bucket"], _count: true });
  console.log("Bucket distribution:", JSON.stringify(dist));

  await prisma.$disconnect();
}

backfill().catch(console.error);
