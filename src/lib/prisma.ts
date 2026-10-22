import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });

  return new PrismaClient({ adapter });
}

// Reuse the pool across Next.js development hot reloads.
export function getPrisma(): PrismaClient {
  const prisma = globalForPrisma.prisma ?? createClient();
  globalForPrisma.prisma = prisma;
  return prisma;
}
