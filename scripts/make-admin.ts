import { loadEnvConfig } from "@next/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizePhoneNumber } from "../src/modules/accounts/phone";

loadEnvConfig(process.cwd());

async function main() {
  const phoneNumber = normalizePhoneNumber(process.argv[2]);
  if (!phoneNumber) {
    throw new Error("Usage: npm run user:admin -- +251912345678");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
  });
  try {
    const result = await prisma.user.updateMany({
      where: { phoneNumber, phoneNumberVerified: true, status: "ACTIVE" },
      data: { role: "ADMIN" },
    });
    if (result.count !== 1) {
      throw new Error("No active account found. Register first, then retry.");
    }
    console.log("Administrator access granted to the registered account.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error && (
    error.message.startsWith("Usage:") ||
    error.message.startsWith("No active account") ||
    error.message === "DATABASE_URL is missing."
  ) ? error.message : "Could not grant access. Check the database connection.";
  console.error(message);
  process.exitCode = 1;
});
