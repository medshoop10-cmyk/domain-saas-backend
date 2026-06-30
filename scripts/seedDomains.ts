import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const domains = [
  { name: "fastaihub.com", tld: ".com", length: 12, score: 92, isBrandable: true, hasKeywords: true, backlinks: 0 },
  { name: "cryptoforge.io", tld: ".io", length: 13, score: 89, isBrandable: true, hasKeywords: true, backlinks: 0 },
  { name: "shopgenius.co", tld: ".co", length: 12, score: 85, isBrandable: true, hasKeywords: false, backlinks: 0 },
  { name: "nextstartup.app", tld: ".app", length: 14, score: 87, isBrandable: true, hasKeywords: true, backlinks: 0 },
  { name: "viraltools.ai", tld: ".ai", length: 12, score: 90, isBrandable: true, hasKeywords: true, backlinks: 0 },
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
