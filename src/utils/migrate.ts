import { execSync } from "child_process";

async function runMigrations() {
  console.log("Running Prisma migrations...");
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    console.log("Migrations complete.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
