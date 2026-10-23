import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { WalletError } from "./money";

// No transaction boundary here: the caller must commit the bid and fee together.
export async function postBidFee(tx: Prisma.TransactionClient, userId: string, auctionId: string, amountMinor: number, operationKey: string) {
  const wallet = await tx.walletAccount.findUnique({ where: { userId } });
  if (!wallet) throw new WalletError("INSUFFICIENT_FUNDS", "Add test funds to your wallet before bidding.", 409);
  const key = `system:test-fees:${auctionId}`;
  await tx.walletAccount.createMany({ data: [{ key, kind: "TEST_FEES" }], skipDuplicates: true });
  const fees = await tx.walletAccount.findUniqueOrThrow({ where: { key } });
  const accounts = await tx.$queryRaw<{ id: string; balanceMinor: bigint }[]>`SELECT "id", "balanceMinor" FROM "WalletAccount" WHERE "id" IN (${wallet.id}, ${fees.id}) ORDER BY "id" FOR UPDATE`;
  if (accounts.find(row => row.id === wallet.id)!.balanceMinor < BigInt(amountMinor)) throw new WalletError("INSUFFICIENT_FUNDS", "Your test balance is too low for this entry fee.", 409);
  return tx.walletTransfer.create({ data: { kind: "BID_FEE", operationKey, amountMinor: BigInt(amountMinor), sourceId: wallet.id, destinationId: fees.id, description: "Test auction entry fee" } });
}
