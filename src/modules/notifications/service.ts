import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { WalletError } from "@/modules/wallet/money";
import { formatDate, money } from "@/modules/auctions/presentation";

// Called only from the auction/payment transaction. No external transport runs here.
export async function queueOfferNotification(tx: Prisma.TransactionClient, offerId: string, kind: "OFFER_CREATED" | "OFFER_EXPIRED" | "WINNER_CONFIRMED") {
  const offer = await tx.winnerOffer.findUniqueOrThrow({ where: { id: offerId }, include: { auction: true, candidate: { include: { bid: true } } } });
  const details = {
    OFFER_CREATED: { title: "You received a winner offer", body: `${offer.auction.title}: your test winning amount is ${money(offer.candidate.bid.amountMinor)}. Payment deadline: ${formatDate(offer.expiresAt)} EAT. Check your latest offer status before paying.` },
    OFFER_EXPIRED: { title: "Your payment deadline passed", body: `${offer.auction.title}: this offer expired. All your other bids for this prize are excluded from further offers. You can still bid on other prizes.` },
    WINNER_CONFIRMED: { title: "Your test win is confirmed", body: `${offer.auction.title}: your winning amount of ${money(offer.candidate.bid.amountMinor)} was paid from your test wallet. Real prize handover is not arranged by this test payment.` },
  }[kind];
  await tx.notificationOutbox.createMany({ data: [{ eventKey: `${kind}:${offerId}`, userId: offer.candidate.bid.userId, auctionId: offer.auctionId, kind, ...details, href: "/offers" }], skipDuplicates: true });
}

export async function queueRefundNotifications(tx: Prisma.TransactionClient, auctionId: string, title: string) {
  // One completion notice per participant, even when several bids/batches were refunded.
  const body = `${title}: all your entry fees for this auction have been returned to your test wallet because no eligible winner remained.`;
  await tx.$executeRaw`INSERT INTO "NotificationOutbox" ("id", "eventKey", "userId", "auctionId", "kind", "title", "body", "href")
    SELECT DISTINCT 'refund:' || ${auctionId} || ':' || b."userId", 'refund:' || ${auctionId} || ':' || b."userId", b."userId", ${auctionId}, 'REFUND_COMPLETED'::"NotificationKind", 'Your test entry fees were refunded', ${body}, '/wallet'
    FROM "Bid" b WHERE b."auctionId" = ${auctionId} ON CONFLICT ("eventKey") DO NOTHING`;
}

export async function runNotificationBatch(limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new WalletError("INVALID_BATCH", "Notification batch must be between 1 and 100.");
  const results: string[] = [];
  for (let index = 0; index < limit; index++) {
    const outcome = await getPrisma().$transaction(async tx => {
      const [event] = await tx.$queryRaw<{ id: string; userId: string }[]>`SELECT "id", "userId" FROM "NotificationOutbox" WHERE "deliveredAt" IS NULL AND "nextAttemptAt" <= clock_timestamp() ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!event) return null;
      await tx.$executeRawUnsafe("SAVEPOINT notification_delivery");
      try {
        await tx.notification.createMany({ data: [{ eventId: event.id, userId: event.userId }], skipDuplicates: true });
        await tx.$executeRaw`UPDATE "NotificationOutbox" SET "deliveredAt" = clock_timestamp(), "lastError" = NULL, "attempts" = "attempts" + 1 WHERE "id" = ${event.id}`;
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT notification_delivery");
        return "delivered";
      } catch {
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT notification_delivery");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT notification_delivery");
        await tx.$executeRaw`UPDATE "NotificationOutbox" SET "attempts" = "attempts" + 1, "lastError" = 'DELIVERY_FAILED', "nextAttemptAt" = clock_timestamp() + make_interval(secs => LEAST(300, 5 * power(2, LEAST("attempts", 6)))::int) WHERE "id" = ${event.id}`;
        return "retry-scheduled";
      }
    }, { maxWait: 15000, timeout: 15000 });
    if (outcome === null) break;
    results.push(outcome);
  }
  return results;
}

export async function myNotifications(userId: string, before?: string) {
  const db = getPrisma();
  return db.$transaction(async tx => {
    const cursor = before ? await tx.notification.findFirst({ where: { id: before, userId } }) : null;
    if (before && !cursor) throw new WalletError("INVALID_CURSOR", "This notification page is unavailable.");
    const rows = await tx.notification.findMany({ where: { userId, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
      select: { id: true, createdAt: true, readAt: true, event: { select: { title: true, body: true, href: true, kind: true, createdAt: true } } } });
    return { items: rows.slice(0, 20).map(row => ({ id: row.id, createdAt: row.createdAt.toISOString(), occurredAt: row.event.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null, title: row.event.title, body: row.event.body, href: row.event.href, kind: row.event.kind })),
      unreadCount: await tx.notification.count({ where: { userId, readAt: null } }), nextCursor: rows.length > 20 ? rows[19].id : null };
  }, { isolationLevel: "RepeatableRead" });
}

export async function markNotificationRead(userId: string, id: string) {
  const db = getPrisma();
  await db.$executeRaw`UPDATE "Notification" SET "readAt" = clock_timestamp() WHERE "id" = ${id} AND "userId" = ${userId} AND "readAt" IS NULL`;
  const owned = await db.notification.findFirst({ where: { id, userId }, select: { id: true, readAt: true } });
  if (!owned) throw new WalletError("NOTIFICATION_NOT_FOUND", "Notification not found.", 404);
  return { id: owned.id, readAt: owned.readAt!.toISOString() };
}

export async function recordWorkerPoll(name: "settlement" | "notifications") {
  await getPrisma().$executeRaw`INSERT INTO "WorkerHeartbeat" ("name", "lastSeenAt") VALUES (${name}, clock_timestamp()) ON CONFLICT ("name") DO UPDATE SET "lastSeenAt" = clock_timestamp()`;
}
