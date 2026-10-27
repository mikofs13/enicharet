import "server-only";
import { getPrisma } from "@/lib/prisma";
import { WalletError } from "@/modules/wallet/money";
import { parseOperationRetry } from "./retry-validation";

export async function retryOperation(actorId: string, value: unknown) {
  const input = parseOperationRetry(value);
  try {
    return await getPrisma().$transaction(async tx => {
      const actors = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${actorId} AND "role" = 'ADMIN' AND "status" = 'ACTIVE' AND "phoneNumberVerified" FOR SHARE`;
      if (!actors.length) throw new WalletError("ADMIN_REQUIRED", "An active administrator account is required.", 403);
      const operationKey = `operation-retry:${actorId}:${input.reference}`;
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`;
      const existing = await tx.operationRetryAudit.findUnique({ where: { operationKey } });
      const kind = input.kind === "settlement" ? "SETTLEMENT" : "NOTIFICATION";
      if (existing) {
        if (existing.kind !== kind || (existing.settlementJobId ?? existing.notificationEventId) !== input.id || existing.expectedAttempts !== input.expectedAttempts || existing.reason !== input.reason) throw new WalletError("IDEMPOTENCY_CONFLICT", "That reference was used for different retry details.", 409);
        return { auditId: existing.id, scheduledFor: existing.scheduledFor.toISOString(), replayed: true };
      }
      // Match the settlement worker's lock order. A worker already processing the
      // item wins; the admin must refresh instead of waiting on or overriding it.
      let previousRunAt: Date;
      let now: Date;
      if (input.kind === "settlement") {
        const rows = await tx.$queryRaw<{ auctionId: string }[]>`SELECT "auctionId" FROM "SettlementJob" WHERE "auctionId" = ${input.id} FOR UPDATE NOWAIT`;
        if (!rows.length) throw new WalletError("RETRY_NOT_FOUND", "Processing job not found.", 404);
        await tx.$queryRaw`SELECT "id" FROM "Auction" WHERE "id" = ${input.id} FOR UPDATE NOWAIT`;
        const job = await tx.settlementJob.findUniqueOrThrow({ where: { auctionId: input.id }, include: { auction: true } });
        now = (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
        if (job.completedAt || !job.lastError || !["SCHEDULED", "OPEN", "CLOSING", "AWAITING_PAYMENT", "REFUNDING"].includes(job.auction.status) || job.auction.closesAt > now) throw new WalletError("NOT_RETRYABLE", "Only an unfinished failed auction job can be retried.", 409);
        if (job.attempts !== input.expectedAttempts) throw new WalletError("STALE_RETRY", "This job has changed. Refresh before retrying.", 409);
        if (await tx.winnerOffer.count({ where: { auctionId: input.id, state: "PENDING", expiresAt: { gt: now } } })) throw new WalletError("NOT_RETRYABLE", "This auction is still within its winner payment window.", 409);
        if (job.nextRunAt <= now) throw new WalletError("RETRY_ALREADY_QUEUED", "This job is already due. Check that the auction worker is running.", 409);
        previousRunAt = job.nextRunAt;
        await tx.settlementJob.update({ where: { auctionId: input.id }, data: { nextRunAt: now } });
      } else {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "NotificationOutbox" WHERE "id" = ${input.id} FOR UPDATE NOWAIT`;
        if (!rows.length) throw new WalletError("RETRY_NOT_FOUND", "Notification delivery not found.", 404);
        const event = await tx.notificationOutbox.findUniqueOrThrow({ where: { id: input.id } });
        now = (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
        if (event.deliveredAt || !event.lastError) throw new WalletError("NOT_RETRYABLE", "Only an undelivered failed notification can be retried.", 409);
        if (event.attempts !== input.expectedAttempts) throw new WalletError("STALE_RETRY", "This delivery has changed. Refresh before retrying.", 409);
        if (event.nextAttemptAt <= now) throw new WalletError("RETRY_ALREADY_QUEUED", "This delivery is already due. Check that the notification worker is running.", 409);
        previousRunAt = event.nextAttemptAt;
        await tx.notificationOutbox.update({ where: { id: input.id }, data: { nextAttemptAt: now } });
      }
      const audit = await tx.operationRetryAudit.create({ data: { operationKey, actorId, kind, settlementJobId: input.kind === "settlement" ? input.id : null, notificationEventId: input.kind === "notification" ? input.id : null,
        expectedAttempts: input.expectedAttempts, reason: input.reason, previousRunAt, scheduledFor: now } });
      return { auditId: audit.id, scheduledFor: now.toISOString(), replayed: false };
    }, { maxWait: 15000, timeout: 15000 });
  } catch (error) {
    const databaseError = error as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } } | null;
    if (databaseError?.code === "55P03" || databaseError?.meta?.code === "55P03" || databaseError?.meta?.driverAdapterError?.cause?.originalCode === "55P03") throw new WalletError("TARGET_BUSY", "This work is busy. Refresh its status before retrying.", 409);
    throw error;
  }
}
