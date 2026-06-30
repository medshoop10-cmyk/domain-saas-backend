import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const domains = [
  { name: "fastaihub", tld: ".com", length: 9, score: 92, isBrandable: true, hasKeywords: true, backlinks: 0 },
  { name: "cryptoforge", tld: ".io", length: 11, score: 89, isBrandable: true, hasKeywords: true, backlinks: 0 },
  { name: "shopgenius", tld: ".co", length: 10, score: 85, isBrandable: true, hasKeywords: false, backlinks: 0 },
  { name: "nextstartup", tld: ".app", length: 11, score: 87, isBrandable: true, hasKeywords: true, backlinks: 0 },
  { name: "viraltools", tld: ".ai", length: 10, score: 90, isBrandable: true, hasKeywords: true, backlinks: 0 },
];

async function main() {
  console.log("🌱 Seeding domains...");

  for (const domain of domains) {
    await prisma.domain.create({
      data: {
        name: domain.name,
        tld: domain.tld,
        length: domain.length,
        score: domain.score,
        isBrandable: domain.isBrandable,
        hasKeywords: domain.hasKeywords,
        backlinks: domain.backlinks,
      },
    });
    console.log(`  ✓ ${domain.name}`);
  }

  console.log("✅ Seeding complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
