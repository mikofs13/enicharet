import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

loadEnvConfig(process.cwd());

function migrationUrl(): string {
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL in .env.local before using Prisma.");
  }

  const url = new URL(connectionString);
  // Neon exposes the same endpoint directly without the pooler hostname suffix.
  // An explicit DIRECT_URL takes precedence if a different setup is needed.
  if (url.hostname.endsWith(".neon.tech")) {
    url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  }
  return url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: migrationUrl() },
});
