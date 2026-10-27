import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { auctionOperations } = await import("../src/modules/settlement/operations");
  const { getPrisma } = await import("../src/lib/prisma");
  try {
    const { asOf, health } = await auctionOperations();
    console.log(JSON.stringify({ asOf, hasAlerts: health.hasAlerts, alerts: health.alerts, workers: health.workers }));
    if (health.hasAlerts) process.exitCode = 1;
  } finally { await getPrisma().$disconnect(); }
}
main().catch(() => { console.error("Operations health could not be checked. Verify database access."); process.exitCode = 2; });
