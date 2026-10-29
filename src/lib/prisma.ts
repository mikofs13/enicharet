import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

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

  return new PrismaClient({
    adapter,
    // Hosted database wake-ups and TLS setup can exceed Prisma's 2s default.
    // Bound connection acquisition without extending an active transaction.
    transactionOptions: { maxWait: 15_000 },
  });
}

// Reuse the pool across Next.js development hot reloads.
export function getPrisma(): PrismaClient {
  const cached = globalForPrisma.prisma;
  // Next dev preserves globals after prisma generate adds a model. Reuse only
  // clients exposing every current delegate; otherwise the new model is undefined.
  const current = cached && Object.values(Prisma.ModelName).every(name =>
    `${name[0].toLowerCase()}${name.slice(1)}` in cached);
  const prisma = current ? cached : createClient();
  globalForPrisma.prisma = prisma;
  if (cached && cached !== prisma) void cached.$disconnect().catch(() => {});
  return prisma;
}
