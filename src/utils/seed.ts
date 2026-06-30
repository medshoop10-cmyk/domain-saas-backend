import prisma from "../config/database";
import { scoreDomain } from "../services/scoring";

const SAMPLE_DOMAINS = [
  { name: "techflow", tld: ".io" },
  { name: "datasync", tld: ".ai" },
  { name: "growthhub", tld: ".com" },
  { name: "pixelcraft", tld: ".co" },
  { name: "quantumlab", tld: ".io" },
  { name: "nimbusapp", tld: ".com" },
  { name: "zeroproxy", tld: ".net" },
  { name: "velocityhq", tld: ".org" },
  { name: "aurelius", tld: ".ai" },
  { name: "nexalink", tld: ".io" },
  { name: "boltpay", tld: ".com" },
  { name: "cryptovault", tld: ".co" },
  { name: "snapstack", tld: ".dev" },
  { name: "orbitalx", tld: ".io" },
  { name: "codemint", tld: ".ai" },
  { name: "drift", tld: ".app" },
  { name: "apexwave", tld: ".com" },
  { name: "voxbridge", tld: ".org" },
  { name: "jetbase", tld: ".io" },
  { name: "solaris", tld: ".ai" },
  { name: "peakflow", tld: ".com" },
  { name: "neondash", tld: ".co" },
  { name: "fluxedge", tld: ".dev" },
  { name: "bloomexchange", tld: ".com" },
  { name: "truedata", tld: ".io" },
  { name: "smartbid", tld: ".ai" },
  { name: "cloudsync", tld: ".net" },
  { name: "arcforge", tld: ".com" },
  { name: "primelens", tld: ".io" },
  { name: "echoqueue", tld: ".app" },
  { name: "fusionlab", tld: ".co" },
  { name: "wavelink", tld: ".org" },
  { name: "rapidlogix", tld: ".ai" },
  { name: "synthwave", tld: ".io" },
  { name: "tradeorbit", tld: ".com" },
  { name: "novasphere", tld: ".dev" },
  { name: "atomix", tld: ".io" },
  { name: "cyberdock", tld: ".ai" },
  { name: "valt", tld: ".app" },
  { name: "protozone", tld: ".com" },
  { name: "infinitech", tld: ".io" },
  { name: "gridnest", tld: ".co" },
  { name: "luminacloud", tld: ".com" },
  { name: "optimum", tld: ".ai" },
  { name: "streamcore", tld: ".net" },
  { name: "datalex", tld: ".io" },
  { name: "virtuos", tld: ".com" },
  { name: "matrixhq", tld: ".org" },
  { name: "ioniks", tld: ".ai" },
  { name: "swiftnode", tld: ".io" },
];

const TLDS = [".com", ".io", ".ai", ".app", ".co", ".dev", ".net", ".org"];
const PREFIXES = [
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
  "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi",
  "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
  "astro", "cosmo", "terra", "aqua", "ignis", "ventus", "lux", "nox",
  "crypto", "meta", "hyper", "ultra", "nano", "micro", "macro", "mega",
  "tech", "data", "code", "web", "net", "soft", "hard", "pure",
  "bright", "dark", "cool", "warm", "calm", "wild", "bold", "swift",
  "prime", "core", "edge", "peak", "apex", "pinnacle", "zen", "nova",
  "storm", "thunder", "blaze", "frost", "shadow", "spark", "gleam", "shade",
];

const SUFFIXES = [
  "hub", "lab", "pro", "max", "go", "ly", "hq", "io",
  "ai", "app", "net", "soft", "ware", "sync", "flow", "wave",
  "link", "nest", "base", "core", "edge", "peak", "zone", "point",
  "grid", "node", "port", "gate", "deck", "dock", "forge", "mint",
  "craft", "works", "scale", "shift", "boost", "pulse", "drive", "lift",
  "view", "scope", "mark", "spot", "light", "sight", "mind", "wise",
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateDomainName(): { name: string; tld: string } {
  const style = Math.random();
  if (style < 0.4) {
    const prefix = pick(PREFIXES);
    const suffix = pick(SUFFIXES);
    return { name: prefix + suffix, tld: pick(TLDS) };
  }
  if (style < 0.7) {
    const word = pick(PREFIXES);
    return { name: word, tld: pick(TLDS) };
  }
  const prefix = pick(PREFIXES);
  const num = randomInt(1, 999);
  return { name: prefix + num, tld: pick(TLDS) };
}

async function seedSmall() {
  console.log("Seeding sample domains...");
  for (const domain of SAMPLE_DOMAINS) {
    const result = scoreDomain(domain.name, domain.tld);
    try {
      await prisma.domain.upsert({
        where: { name: domain.name },
        update: {
          tld: domain.tld,
          length: domain.name.length,
          score: result.score,
          isBrandable: result.breakdown.brandability > 0,
          hasKeywords: result.breakdown.keyword > 5,
          backlinks: Math.floor(Math.random() * 1000),
        },
        create: {
          name: domain.name,
          tld: domain.tld,
          length: domain.name.length,
          score: result.score,
          isBrandable: result.breakdown.brandability > 0,
          hasKeywords: result.breakdown.keyword > 5,
          backlinks: Math.floor(Math.random() * 1000),
        },
      });
    } catch (error) {
      console.error(`Failed to seed domain ${domain.name}:`, error);
    }
  }
  console.log(`Seeded ${SAMPLE_DOMAINS.length} domains.`);
}

async function seedBulk(count: number) {
  console.log(`Bulk seeding ${count.toLocaleString()} domains...`);
  const BATCH = 500;
  let inserted = 0;

  while (inserted < count) {
    const batch: Array<{
      name: string;
      tld: string;
      length: number;
      score: number;
      isBrandable: boolean;
      hasKeywords: boolean;
      backlinks: number;
    }> = [];

    for (let i = 0; i < BATCH && inserted < count; i++) {
      const { name, tld } = generateDomainName();
      const result = scoreDomain(name, tld);
      batch.push({
        name: `${name}${inserted}${i}`,
        tld,
        length: name.length,
        score: result.score,
        isBrandable: result.breakdown.brandability > 0,
        hasKeywords: result.breakdown.keyword > 5,
        backlinks: randomInt(0, 5000),
      });
      inserted++;
    }

    try {
      await prisma.domain.createMany({ data: batch, skipDuplicates: true });
    } catch (error) {
      console.error(`Batch insert failed at ${inserted}:`, error);
    }

    if (inserted % 10000 === 0) {
      console.log(`  ${inserted.toLocaleString()} / ${count.toLocaleString()}`);
    }
  }
  console.log(`Bulk seed complete: ${inserted.toLocaleString()} domains.`);

  console.log("Scoring unscored domains...");
  let scored = 0;
  while (true) {
    const unscored = await prisma.domain.findMany({
      where: { score: 0 },
      take: 500,
    });
    if (unscored.length === 0) break;
    for (const d of unscored) {
      const result = scoreDomain(d.name, d.tld);
      await prisma.domain.update({
        where: { id: d.id },
        data: {
          score: result.score,
          isBrandable: result.breakdown.brandability > 0,
          hasKeywords: result.breakdown.keyword > 5,
        },
      });
      scored++;
    }
  }
  console.log(`Scored ${scored} domains.`);
}

async function seed() {
  const args = process.argv.slice(2);
  const bulkArg = args.find((a) => a.startsWith("--bulk="));

  if (bulkArg) {
    const count = parseInt(bulkArg.split("=")[1], 10) || 100000;
    await seedBulk(count);
  } else {
    await seedSmall();
  }

  await prisma.$disconnect();
}

seed();
