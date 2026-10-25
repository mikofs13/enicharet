import "server-only";
import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { parseAdminFunding, requireAdminFunding } from "./admin-funding-validation";
import { WalletError } from "./money";
import { getWallet, postTestMovementInTransaction } from "./service";

export async function addAdminFunds(actorId: string, body: unknown) {
  requireAdminFunding();
  const input = parseAdminFunding(body);
  return getPrisma().$transaction(async tx => {
    const actors = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${actorId} AND "role" = 'ADMIN' AND "status" = 'ACTIVE' AND "phoneNumberVerified" FOR SHARE`;
    if (!actors.length) throw new WalletError("ADMIN_REQUIRED", "An active administrator account is required.", 403);
    const key = `admin-funding:${actorId}:${input.reference}`;
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const recipient = input.target === "self" ? { id: actorId } : await tx.user.findUnique({ where: { phoneNumber: input.phoneNumber! }, select: { id: true } });
    if (!recipient) throw new WalletError("RECIPIENT_UNAVAILABLE", "No verified active account is available for that phone number.", 404);
    const existing = await tx.adminWalletCredit.findUnique({ where: { operationKey: key }, include: { transfer: true } });
    if (existing) {
      if (existing.recipientId !== recipient.id || existing.transfer.amountMinor !== input.amountMinor || existing.reason !== input.reason) throw new WalletError("IDEMPOTENCY_CONFLICT", "This reference was already used for different funding details.", 409);
      return { transferId: existing.transferId, replayed: true, wallet: await getWallet(recipient.id, tx) };
    }
    const movement = await postTestMovementInTransaction(tx, {
      userId: recipient.id, amountMinor: input.amountMinor, direction: "credit", description: input.reason,
      reference: `admin-${createHash("sha256").update(key).digest("hex")}`,
    });
    await tx.adminWalletCredit.create({ data: { operationKey: key, actorId, recipientId: recipient.id, transferId: movement.transferId, reason: input.reason } });
    return { ...movement, wallet: await getWallet(recipient.id, tx) };
  }, { maxWait: 15000, timeout: 15000 });
}
