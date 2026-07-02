import prisma from "../config/database";

async function backfill() {
  const result = await prisma.$executeRawUnsafe(`
    UPDATE "Domain"
    SET
      "opportunityScore" = GREATEST(0, LEAST(100,
        score +
        CASE WHEN length <= 10 THEN 3 ELSE 0 END +
        CASE WHEN position('-' in name) = 0 THEN 2 ELSE 0 END +
        CASE WHEN name ~ '[0-9]' = false THEN 2 ELSE 0 END +
        CASE WHEN "isBrandable" = true THEN 3 ELSE 0 END
      )),
      "bucket" = CASE
        WHEN "isBrandable" = true AND length <= 12 AND position('-' in name) = 0 THEN 'brandable'
        WHEN price IS NOT NULL AND price <= 200 AND score >= 50 THEN 'undervalued'
        WHEN backlinks >= 50 THEN 'trending'
        ELSE 'standard'
      END
  `);

  console.log(`Updated ${result} rows`);

  const dist = await prisma.domain.groupBy({ by: ["bucket"], _count: true });
  console.log("Bucket distribution:", JSON.stringify(dist));

  await prisma.$disconnect();
}

backfill().catch(console.error);
