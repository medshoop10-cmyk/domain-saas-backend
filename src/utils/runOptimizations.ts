import { readFileSync } from "fs";
import { join } from "path";
import prisma from "../config/database";

async function runOptimizations() {
  console.log("Running PostgreSQL performance optimizations...");

  const sqlPath = join(__dirname, "../../migrations/001_performance_optimizations.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--") && !s.startsWith("/*"));

  let executed = 0;
  for (const stmt of statements) {
    try {
      await prisma.$executeRawUnsafe(stmt + ";");
      executed++;
    } catch (error: any) {
      if (error?.message?.includes("already exists")) {
        console.log(`  Skipped (already exists): ${stmt.slice(0, 60)}...`);
      } else {
        console.error(`  Error: ${error?.message}`);
      }
    }
  }

  console.log(`Executed ${executed} optimization statements.`);
  await prisma.$disconnect();
}

runOptimizations();
