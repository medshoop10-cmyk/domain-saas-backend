import prisma from "../config/database";

async function debug() {
  const envDb = process.env.DATABASE_URL?.substring(0, 40);
  console.log("DB:", envDb);

  const brandable = await prisma.domain.findMany({
    where: { isBrandable: true, length: { lte: 12 } },
    take: 3,
    select: { name: true, tld: true, isBrandable: true, length: true, bucket: true, opportunityScore: true },
  });
  console.log("Brandable examples:", JSON.stringify(brandable));

  const total = await prisma.domain.count({
    where: { isBrandable: true, length: { lte: 12 } },
  });
  console.log("Total brandable:", total);

  const buckets = await prisma.domain.groupBy({ by: ["bucket"], _count: true });
  console.log("Bucket distribution:", JSON.stringify(buckets));

  await prisma.$disconnect();
}

debug().catch(console.error);
