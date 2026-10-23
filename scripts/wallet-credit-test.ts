import { loadEnvConfig } from "@next/env";
import { normalizePhoneNumber } from "../src/modules/accounts/phone";
import { parseWalletAmount, requireTestMoneyMode, WalletError } from "../src/modules/wallet/money";

if (!process.env.NODE_ENV) Object.assign(process.env, { NODE_ENV: "development" });
loadEnvConfig(process.cwd(), true);

async function main() {
  requireTestMoneyMode();
  const phoneNumber = normalizePhoneNumber(process.argv[2]);
  const amountMinor = parseWalletAmount(process.argv[3]);
  const reference = process.argv[4];
  if (!phoneNumber || !amountMinor || !reference) throw new WalletError("USAGE", 'Usage: npm run wallet:credit:test -- "PHONE_NUMBER" "100.00" "unique-reference"');
  const { getPrisma } = await import("../src/lib/prisma");
  const { postTestMovement, getWallet } = await import("../src/modules/wallet/service");
  const db = getPrisma();
  try {
    const user = await db.user.findUnique({ where: { phoneNumber }, select: { id: true } });
    if (!user) throw new WalletError("ACCOUNT_UNAVAILABLE", "Register and verify the account first.");
    const result = await postTestMovement({ userId: user.id, amountMinor, reference, direction: "credit", description: "Local development test credit" });
    const wallet = await getWallet(user.id);
    console.log(JSON.stringify({ ...result, mode: "TEST", currency: wallet.currency, balanceMinor: wallet.balanceMinor }));
    console.log("Test money only. Reuse the same reference only to retry this exact credit.");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof WalletError ? error.message : "Could not post test credit. Check database connectivity and migrations."); process.exitCode = 1; });
