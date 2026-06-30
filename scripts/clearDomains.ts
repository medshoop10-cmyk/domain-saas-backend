import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.domain.deleteMany();
  console.log("Deleted all domains");
}

main().finally(() => prisma.$disconnect());
