import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const domains = [
  // AI-related
  { name: "fastaihub", tld: ".com", length: 9, score: 92, isBrandable: true, hasKeywords: true },
  { name: "viraltools", tld: ".ai", length: 10, score: 90, isBrandable: true, hasKeywords: true },
  { name: "healthpulse", tld: ".ai", length: 11, score: 91, isBrandable: true, hasKeywords: true },
  { name: "sentiwise", tld: ".com", length: 9, score: 78, isBrandable: true, hasKeywords: false },
  { name: "neuralpod", tld: ".io", length: 9, score: 76, isBrandable: true, hasKeywords: true },
  { name: "aitools", tld: ".io", length: 7, score: 80, isBrandable: true, hasKeywords: true },
  // Health / wellness
  { name: "vitalis", tld: ".ai", length: 7, score: 85, isBrandable: true, hasKeywords: false },
  { name: "getzenly", tld: ".com", length: 8, score: 74, isBrandable: true, hasKeywords: false },
  { name: "wellflow", tld: ".co", length: 8, score: 71, isBrandable: false, hasKeywords: true },
  { name: "healthpilot", tld: ".io", length: 11, score: 79, isBrandable: true, hasKeywords: true },
  // Finance / fintech
  { name: "payforge", tld: ".io", length: 8, score: 83, isBrandable: true, hasKeywords: true },
  { name: "cryptoforge", tld: ".io", length: 11, score: 89, isBrandable: true, hasKeywords: true },
  { name: "stackvest", tld: ".com", length: 9, score: 77, isBrandable: true, hasKeywords: true },
  { name: "finwise", tld: ".ai", length: 7, score: 82, isBrandable: true, hasKeywords: true },
  { name: "financeflow", tld: ".io", length: 11, score: 81, isBrandable: true, hasKeywords: true },
  // SaaS / startup
  { name: "growstack", tld: ".io", length: 9, score: 82, isBrandable: true, hasKeywords: false },
  { name: "nextstartup", tld: ".app", length: 11, score: 87, isBrandable: true, hasKeywords: true },
  { name: "shipflow", tld: ".co", length: 8, score: 75, isBrandable: true, hasKeywords: false },
  { name: "saasify", tld: ".com", length: 7, score: 85, isBrandable: true, hasKeywords: true },
  // General
  { name: "shopgenius", tld: ".co", length: 10, score: 85, isBrandable: true, hasKeywords: false },
  { name: "datamuse", tld: ".io", length: 8, score: 73, isBrandable: true, hasKeywords: true },
  { name: "codevibe", tld: ".com", length: 8, score: 70, isBrandable: true, hasKeywords: false },
];

async function main() {
  console.log("🌱 Seeding domains...");

  for (const domain of domains) {
    await prisma.domain.upsert({
      where: { name: domain.name },
      update: {
        tld: domain.tld,
        length: domain.length,
        score: domain.score,
        isBrandable: domain.isBrandable,
        hasKeywords: domain.hasKeywords,
        backlinks: 0,
      },
      create: {
        name: domain.name,
        tld: domain.tld,
        length: domain.length,
        score: domain.score,
        isBrandable: domain.isBrandable,
        hasKeywords: domain.hasKeywords,
        backlinks: 0,
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
