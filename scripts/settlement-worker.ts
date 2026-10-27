import { loadEnvConfig } from "@next/env";
import { setTimeout as delay } from "node:timers/promises";
loadEnvConfig(process.cwd());
const stop = new AbortController();
process.once("SIGINT", () => stop.abort()); process.once("SIGTERM", () => stop.abort());
async function main() {
  const { runSettlementBatch } = await import("../src/modules/settlement/service");
  const { getPrisma } = await import("../src/lib/prisma");
  const { recordWorkerPoll } = await import("../src/modules/notifications/service");
  try {
    do {
      try {
        await recordWorkerPoll("settlement");
        const results = await runSettlementBatch();
        console.log(JSON.stringify({ mode: "TEST", processed: results.length, outcomes: results }));
        if (process.argv.includes("--once") && results.includes("retry-scheduled")) process.exitCode = 1;
      } catch { console.error("Settlement worker could not reach the database; it will retry. No private records are logged."); if (process.argv.includes("--once")) { process.exitCode = 1; break; } }
      if (process.argv.includes("--once") || stop.signal.aborted) break;
      try { await delay(5000, undefined, { signal: stop.signal }); } catch { break; }
    } while (!stop.signal.aborted);
  } finally { await getPrisma().$disconnect(); }
}
main().catch(() => { console.error("Settlement worker stopped unexpectedly."); process.exitCode = 1; });
