import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { WalletError } from "@/modules/wallet/money";
import { operationsHealth, WORK_OVERDUE_MS, REPEATED_FAILURE_ATTEMPTS } from "./health";

export async function auctionOperations(view = "active", after?: string) {
  if (!["active", "failed", "completed"].includes(view)) throw new WalletError("INVALID_VIEW", "Choose an available job view.");
  if (after !== undefined && (!after || after.length > 128)) throw new WalletError("INVALID_CURSOR", "Invalid job cursor.");
  const db = getPrisma();
  return db.$transaction(async tx => {
    const where: Prisma.SettlementJobWhereInput = view === "completed" ? { completedAt: { not: null } } : { completedAt: null, ...(view === "failed" ? { lastError: { not: null } } : {}) };
    const now = (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
    const overdueBefore = new Date(now.getTime() - WORK_OVERDUE_MS);
    const [overdueJobs, missingJobs, delayedNotifications, repeatedJobFailures, repeatedDeliveryFailures] = await Promise.all([
      tx.settlementJob.count({ where: { completedAt: null, nextRunAt: { lte: overdueBefore } } }),
      tx.auction.count({ where: { status: { in: ["SCHEDULED", "OPEN", "CLOSING", "AWAITING_PAYMENT", "REFUNDING"] }, closesAt: { lte: overdueBefore }, settlementJob: null } }),
      tx.notificationOutbox.count({ where: { deliveredAt: null, nextAttemptAt: { lte: overdueBefore } } }),
      tx.settlementJob.count({ where: { completedAt: null, lastError: { not: null }, attempts: { gte: REPEATED_FAILURE_ATTEMPTS } } }),
      tx.notificationOutbox.count({ where: { deliveredAt: null, lastError: { not: null }, attempts: { gte: REPEATED_FAILURE_ATTEMPTS } } }),
    ]);
    const [active, failed, due, awaitingPayment, notificationPending, notificationRetrying, notificationDelivered, workers, jobs] = await Promise.all([
      tx.settlementJob.count({ where: { completedAt: null } }), tx.settlementJob.count({ where: { completedAt: null, lastError: { not: null } } }),
      tx.settlementJob.count({ where: { completedAt: null, nextRunAt: { lte: now } } }), tx.winnerOffer.count({ where: { state: "PENDING", expiresAt: { gt: now } } }),
      tx.notificationOutbox.count({ where: { deliveredAt: null } }), tx.notificationOutbox.count({ where: { deliveredAt: null, lastError: { not: null } } }),
      tx.notificationOutbox.count({ where: { deliveredAt: { not: null } } }), tx.workerHeartbeat.findMany({ orderBy: { name: "asc" } }),
      tx.settlementJob.findMany({ where: { ...where, ...(after ? { auctionId: { gt: after } } : {}) }, orderBy: { auctionId: "asc" }, take: 21,
        include: { auction: { select: { title: true, slug: true, status: true, closesAt: true, _count: { select: { bids: true } }, offers: { where: { state: "PENDING" }, select: { id: true, expiresAt: true, candidate: { select: { bid: { select: { amountMinor: true } } } } } } } } } }),
    ]);
    const ids = jobs.slice(0, 20).map(job => job.auctionId);
    const refunded = ids.length ? await tx.$queryRaw<{ auctionId: string; count: number }[]>`SELECT b."auctionId", count(*)::int AS count FROM "Bid" b JOIN "WalletTransfer" r ON r."reversalOfId" = b."feeTransferId" WHERE b."auctionId" = ANY(${ids}::text[]) GROUP BY b."auctionId"` : [];
    const deliveryFailures = await tx.notificationOutbox.findMany({ where: { deliveredAt: null, lastError: { not: null } }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: 10,
      select: { id: true, kind: true, attempts: true, nextAttemptAt: true, lastError: true, auction: { select: { title: true } } } });
    const audit = await tx.operationRetryAudit.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
      select: { id: true, actorId: true, kind: true, settlementJobId: true, notificationEventId: true, expectedAttempts: true, reason: true, previousRunAt: true, scheduledFor: true, createdAt: true } });
    return { asOf: now.toISOString(), view, counts: { active, failed, due, awaitingPayment, notificationPending, notificationRetrying, notificationDelivered },
      health: operationsHealth(now, workers, { overdueJobs, missingJobs, delayedNotifications, repeatedJobFailures, repeatedDeliveryFailures }),
      retryAudit: audit.map(row => ({ ...row, previousRunAt: row.previousRunAt.toISOString(), scheduledFor: row.scheduledFor.toISOString(), createdAt: row.createdAt.toISOString() })),
      workers: workers.map(worker => ({ name: worker.name, lastSeenAt: worker.lastSeenAt.toISOString() })),
      deliveryFailures: deliveryFailures.map(event => ({ id: event.id, kind: event.kind, attempts: event.attempts, nextAttemptAt: event.nextAttemptAt.toISOString(), lastError: event.lastError, auctionTitle: event.auction.title })),
      jobs: jobs.slice(0, 20).map(job => ({ auctionId: job.auctionId, title: job.auction.title, slug: job.auction.slug, status: job.auction.status, closesAt: job.auction.closesAt.toISOString(), nextRunAt: job.nextRunAt.toISOString(), completedAt: job.completedAt?.toISOString() ?? null, attempts: job.attempts, lastError: job.lastError,
        bidCount: job.auction._count.bids, refundedBidCount: refunded.find(row => row.auctionId === job.auctionId)?.count ?? 0,
        pendingOffers: job.auction.offers.map(offer => ({ id: offer.id, expiresAt: offer.expiresAt.toISOString(), amountMinor: offer.candidate.bid.amountMinor })) })),
      nextCursor: jobs.length > 20 ? jobs[19].auctionId : null };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
