import { loadEnvConfig } from "@next/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

loadEnvConfig(process.cwd());

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing from your environment.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 15_000,
    }),
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    // Check that the schema was applied without displaying application data.
    await prisma.user.count();
    await prisma.auction.count();
    console.log("Database connection and foundation tables verified.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  // Driver errors can contain connection details; keep credentials out of logs.
  console.error(
    "Database check failed. Verify DATABASE_URL, network access, and migrations.",
  );
  process.exitCode = 1;
});
