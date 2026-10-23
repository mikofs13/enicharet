import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { BidError } from "@/modules/bidding/validation";
import { WalletError } from "@/modules/wallet/money";

export class SettlementError extends BidError {}
const clock = async (tx: Prisma.TransactionClient) => (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;

// Reconciliation discovers newly published auctions after process/server restarts.
export async function ensureSettlementJobs() {
  return getPrisma().$executeRaw`INSERT INTO "SettlementJob" ("auctionId", "nextRunAt") SELECT "id", "closesAt" FROM "Auction" WHERE "status" IN ('SCHEDULED', 'OPEN', 'CLOSING', 'AWAITING_PAYMENT', 'REFUNDING') ON CONFLICT ("auctionId") DO NOTHING`;
}

async function finishJob(tx: Prisma.TransactionClient, auctionId: string) {
  return tx.settlementJob.update({ where: { auctionId }, data: { completedAt: await clock(tx), lastError: null } });
}

async function processJob(tx: Prisma.TransactionClient, auctionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Auction" WHERE "id" = ${auctionId} FOR UPDATE`;
  let auction = await tx.auction.findUniqueOrThrow({ where: { id: auctionId } });
  let now = await clock(tx);
  if (["WINNER_CONFIRMED", "FULFILLED", "CANCELLED", "REFUNDED"].includes(auction.status)) { await finishJob(tx, auctionId); return "complete"; }
  if (now < auction.closesAt) { await tx.settlementJob.update({ where: { auctionId }, data: { nextRunAt: auction.closesAt } }); return "scheduled"; }
  if (!await tx.auctionSettlement.findUnique({ where: { auctionId } })) {
    auction = await tx.auction.update({ where: { id: auctionId }, data: { status: "CLOSING" } });
    await tx.auctionSettlement.create({ data: { auctionId } });
    // The auction write lock waits for accepted bid transactions, then prevents
    // new ones. This immutable snapshot is never recalculated during reassignment.
    await tx.$executeRaw`INSERT INTO "SettlementCandidate" ("id", "auctionId", "bidId", "rank")
      SELECT b."id" || ':candidate', b."auctionId", b."id", row_number() OVER (ORDER BY b."amountMinor", b."id")::int
      FROM "Bid" b JOIN (SELECT "amountMinor" FROM "Bid" WHERE "auctionId" = ${auctionId} GROUP BY "amountMinor" HAVING count(*) = 1) u ON u."amountMinor" = b."amountMinor"
      WHERE b."auctionId" = ${auctionId}`;
  }
  if (auction.status !== "REFUNDING") {
    const paid = await tx.winnerOffer.findFirst({ where: { auctionId, state: "PAID" } });
    if (paid) { await tx.auction.update({ where: { id: auctionId }, data: { status: "WINNER_CONFIRMED" } }); await finishJob(tx, auctionId); return "paid"; }
    const pending = await tx.winnerOffer.findFirst({ where: { auctionId, state: "PENDING" } });
    now = await clock(tx);
    if (pending && pending.expiresAt > now) {
      await tx.settlementJob.update({ where: { auctionId }, data: { nextRunAt: pending.expiresAt } }); return "awaiting-payment";
    }
    if (pending) await tx.winnerOffer.update({ where: { id: pending.id }, data: { state: "EXPIRED" } });
    const expired = await tx.winnerOffer.findMany({ where: { auctionId, state: "EXPIRED" }, select: { candidate: { select: { bid: { select: { userId: true } } } } } });
    const excluded = expired.map(row => row.candidate.bid.userId);
    const next = await tx.settlementCandidate.findFirst({
      where: { auctionId, offer: null, bid: { userId: { notIn: excluded }, user: { status: "ACTIVE", phoneNumberVerified: true } } }, orderBy: { rank: "asc" },
    });
    if (next) {
      await tx.auction.update({ where: { id: auctionId }, data: { status: "AWAITING_PAYMENT" } });
      const offer = await tx.winnerOffer.create({ data: { auctionId, candidateId: next.id, expiresAt: new Date(now.getTime() + auction.paymentWindowSeconds * 1000) } });
      await tx.settlementJob.update({ where: { auctionId }, data: { nextRunAt: offer.expiresAt, lastError: null } }); return "offer-created";
    }
    await tx.auction.update({ where: { id: auctionId }, data: { status: "REFUNDING" } });
  }
  // Bounded batches keep transactions short and resume after a crash. Reversals
  // preserve the original charge and are unique on the original transfer id.
  const fees = await tx.walletTransfer.findMany({ where: { kind: "BID_FEE", bid: { auctionId }, reversal: null }, orderBy: { id: "asc" }, take: 25 });
  if (fees.length) {
    const accountIds = [...new Set(fees.flatMap(fee => [fee.sourceId, fee.destinationId]))];
    await tx.$queryRaw`SELECT "id" FROM "WalletAccount" WHERE "id" = ANY(${accountIds}::text[]) ORDER BY "id" FOR UPDATE`;
  }
  for (const fee of fees) await tx.walletTransfer.create({ data: {
    operationKey: `refund:${fee.id}`, kind: "REVERSAL", amountMinor: fee.amountMinor, sourceId: fee.destinationId, destinationId: fee.sourceId,
    reversalOfId: fee.id, description: "Test entry fee refund: no eligible winner",
  } });
  if (await tx.walletTransfer.count({ where: { kind: "BID_FEE", bid: { auctionId }, reversal: null } }) === 0) {
    await tx.auction.update({ where: { id: auctionId }, data: { status: "REFUNDED" } }); await finishJob(tx, auctionId); return "refunded";
  }
  await tx.settlementJob.update({ where: { auctionId }, data: { nextRunAt: await clock(tx), lastError: null } }); return "refund-batch";
}

export async function runSettlementBatch(limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new SettlementError("INVALID_BATCH", "Batch size must be between 1 and 100.");
  await ensureSettlementJobs();
  const results: string[] = [];
  for (let index = 0; index < limit; index++) {
    const result = await getPrisma().$transaction(async tx => {
      const [job] = await tx.$queryRaw<{ auctionId: string }[]>`SELECT "auctionId" FROM "SettlementJob" WHERE "completedAt" IS NULL AND "nextRunAt" <= clock_timestamp() ORDER BY "nextRunAt", "auctionId" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!job) return null;
      // Savepoints let us roll back a partial job while persisting safe retry
      // metadata under the same lock, without a second worker racing the retry.
      await tx.$executeRawUnsafe("SAVEPOINT settlement_work");
      try {
        const outcome = await processJob(tx, job.auctionId);
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT settlement_work"); return outcome;
      } catch {
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT settlement_work");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT settlement_work");
        await tx.$executeRaw`UPDATE "SettlementJob" SET "attempts" = "attempts" + 1, "lastError" = 'PROCESSING_FAILED', "nextRunAt" = clock_timestamp() + make_interval(secs => LEAST(300, 5 * power(2, LEAST("attempts", 6)))::int) WHERE "auctionId" = ${job.auctionId}`;
        return "retry-scheduled";
      }
    }, { maxWait: 15000, timeout: 30000 });
    if (result === null) break;
    results.push(result);
  }
  return results;
}

export async function payWinnerOffer(userId: string, offerId: string) {
  // Owned lookup prevents leaking another bidder's offer or taking their locks.
  const owned = await getPrisma().winnerOffer.findFirst({ where: { id: offerId, candidate: { bid: { userId } } }, select: { auctionId: true } });
  if (!owned) throw new SettlementError("OFFER_NOT_FOUND", "Offer not found.", 404);
  return getPrisma().$transaction(async tx => {
    await tx.$queryRaw`SELECT "auctionId" FROM "SettlementJob" WHERE "auctionId" = ${owned.auctionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Auction" WHERE "id" = ${owned.auctionId} FOR UPDATE`;
    const users = await tx.$queryRaw<{ status: string; phoneNumberVerified: boolean }[]>`SELECT "status", "phoneNumberVerified" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
    if (!users[0] || users[0].status !== "ACTIVE" || !users[0].phoneNumberVerified) throw new SettlementError("ACCOUNT_UNAVAILABLE", "An active verified account is required.", 403);
    const offer = await tx.winnerOffer.findUniqueOrThrow({ where: { id: offerId }, include: { candidate: { include: { bid: true } }, auction: true } });
    if (offer.candidate.bid.userId !== userId) throw new SettlementError("OFFER_NOT_FOUND", "Offer not found.", 404);
    if (offer.state === "PAID") return { offerId, transferId: offer.paymentTransferId!, replayed: true };
    if (offer.state !== "PENDING" || offer.expiresAt <= await clock(tx) || offer.auction.status !== "AWAITING_PAYMENT") throw new SettlementError("OFFER_EXPIRED", "This offer is no longer payable.", 409);
    const wallet = await tx.walletAccount.findUnique({ where: { userId } });
    if (!wallet) throw new WalletError("INSUFFICIENT_FUNDS", "Add test funds before accepting this offer.", 409);
    const key = `system:test-prize:${owned.auctionId}`;
    await tx.walletAccount.createMany({ data: [{ key, kind: "TEST_PRIZE" }], skipDuplicates: true });
    const prize = await tx.walletAccount.findUniqueOrThrow({ where: { key } });
    const accounts = await tx.$queryRaw<{ id: string; balanceMinor: bigint }[]>`SELECT "id", "balanceMinor" FROM "WalletAccount" WHERE "id" IN (${wallet.id}, ${prize.id}) ORDER BY "id" FOR UPDATE`;
    const amountMinor = BigInt(offer.candidate.bid.amountMinor);
    if (accounts.find(row => row.id === wallet.id)!.balanceMinor < amountMinor) throw new WalletError("INSUFFICIENT_FUNDS", "Your test balance is too low to pay this winning amount.", 409);
    if (offer.expiresAt <= await clock(tx)) throw new SettlementError("OFFER_EXPIRED", "This offer has expired.", 409);
    const transfer = await tx.walletTransfer.create({ data: { operationKey: `winner:${offerId}`, kind: "WINNER_PAYMENT", amountMinor, sourceId: wallet.id, destinationId: prize.id, description: "Test winning bid payment" } });
    await tx.winnerOffer.update({ where: { id: offerId }, data: { state: "PAID", paidAt: await clock(tx), paymentTransferId: transfer.id } });
    await tx.auction.update({ where: { id: owned.auctionId }, data: { status: "WINNER_CONFIRMED" } });
    await finishJob(tx, owned.auctionId);
    return { offerId, transferId: transfer.id, replayed: false };
  }, { maxWait: 15000, timeout: 15000 });
}

export async function myOffers(userId: string, before?: string) {
  const db = getPrisma();
  const ownership = { candidate: { bid: { userId } } };
  const cursor = before ? await db.winnerOffer.findFirst({ where: { id: before, ...ownership } }) : null;
  if (before && !cursor) throw new SettlementError("INVALID_CURSOR", "This offer history page is unavailable.");
  const rows = await db.winnerOffer.findMany({ where: { ...ownership, ...(cursor ? { OR: [{ offeredAt: { lt: cursor.offeredAt } }, { offeredAt: cursor.offeredAt, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ offeredAt: "desc" }, { id: "desc" }], take: 21,
    select: { id: true, state: true, offeredAt: true, expiresAt: true, paidAt: true, candidate: { select: { bid: { select: { amountMinor: true } } } }, auction: { select: { title: true, slug: true } } } });
  return { items: rows.slice(0, 20).map(row => ({ id: row.id, state: row.state, offeredAt: row.offeredAt.toISOString(), expiresAt: row.expiresAt.toISOString(), paidAt: row.paidAt?.toISOString() ?? null, amountMinor: row.candidate.bid.amountMinor, auction: row.auction, mode: "TEST" })), nextCursor: rows.length > 20 ? rows[19].id : null };
}

export async function publicAuctionResult(auctionId: string) {
  const paid = await getPrisma().winnerOffer.findFirst({ where: { auctionId, state: "PAID" }, select: { paidAt: true, candidate: { select: { bid: { select: { amountMinor: true } } } } } });
  return paid ? { mode: "TEST", winningAmountMinor: paid.candidate.bid.amountMinor, confirmedAt: paid.paidAt!.toISOString() } : null;
}
