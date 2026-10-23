import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { getPrisma } = await import("../src/lib/prisma");
  const db = getPrisma();
  try {
    const [result] = await db.$queryRaw<{ accounts: bigint; transfers: bigint; mismatches: bigint; netMinor: string }[]>`
      WITH movements AS (
        SELECT "sourceId" AS account, -"amountMinor"::numeric AS delta FROM "WalletTransfer"
        UNION ALL
        SELECT "destinationId", "amountMinor"::numeric FROM "WalletTransfer"
      ), totals AS (
        SELECT account, SUM(delta) AS expected FROM movements GROUP BY account
      )
      SELECT COUNT(*) AS accounts,
        (SELECT COUNT(*) FROM "WalletTransfer") AS transfers,
        COUNT(*) FILTER (WHERE a."balanceMinor"::numeric <> COALESCE(t.expected, 0)) AS mismatches,
        COALESCE(SUM(a."balanceMinor"::numeric), 0)::text AS "netMinor"
      FROM "WalletAccount" a LEFT JOIN totals t ON t.account = a."id"
    `;
    if (result.mismatches !== 0n || result.netMinor !== "0") throw new Error("Wallet reconciliation mismatch. Investigate before posting further transfers.");
    console.log(`TEST wallet ledger reconciled: ${result.accounts} accounts, ${result.transfers} transfers, zero mismatches, net zero.`);
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith("Wallet reconciliation mismatch") ? error.message : "Could not reconcile wallets. Check connectivity and migrations; no balances or credentials are printed.");
  process.exitCode = 1;
});
