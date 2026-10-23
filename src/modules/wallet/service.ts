import "server-only";
import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { MAX_WALLET_MINOR, requireTestMoneyMode, WalletError } from "./money";

const PAGE_SIZE = 20;
type WalletDb = Pick<Prisma.TransactionClient, "walletAccount" | "walletTransfer">;

export async function getWallet(userId: string, db: WalletDb = getPrisma()) {
  const wallet = await db.walletAccount.findUnique({ where: { userId } });
  return { mode: "TEST" as const, currency: "ETB", balanceMinor: (wallet?.balanceMinor ?? 0n).toString() };
}

export async function getWalletHistory(userId: string, before?: string, db: WalletDb = getPrisma()) {
  const account = await db.walletAccount.findUnique({ where: { userId } });
  if (!account) {
    if (before) throw new WalletError("INVALID_CURSOR", "This history cursor is not available.");
    return { items: [], nextCursor: null };
  }
  const owned = { OR: [{ sourceId: account.id }, { destinationId: account.id }] };
  // A cursor must belong to this wallet; another user's id never selects data.
  const cursor = before ? await db.walletTransfer.findFirst({ where: { id: before, ...owned } }) : null;
  if (before && !cursor) throw new WalletError("INVALID_CURSOR", "This history cursor is not available.");
  const rows = await db.walletTransfer.findMany({
    where: { AND: [owned, ...(cursor ? [{ OR: [
      { createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ] }] : [])] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE_SIZE + 1,
  });
  const items = rows.slice(0, PAGE_SIZE).map(row => ({
    id: row.id, kind: row.kind, description: row.description,
    amountMinor: (row.sourceId === account.id ? -row.amountMinor : row.amountMinor).toString(),
    createdAt: row.createdAt.toISOString(), reversalOfId: row.reversalOfId,
  }));
  return { items, nextCursor: rows.length > PAGE_SIZE ? items.at(-1)!.id : null };
}

export async function getWalletSnapshot(userId: string, before?: string) {
  return getPrisma().$transaction(async tx => ({
    wallet: await getWallet(userId, tx), history: await getWalletHistory(userId, before, tx),
  }), { isolationLevel: "RepeatableRead" });
}

type TestMovement = { userId: string; amountMinor: bigint; reference: string; direction: "credit" | "debit"; description: string };

// Trusted local tooling/integration tests only. No public posting endpoint.
// Future bid fees must share their database transaction with bid creation.
export async function postTestMovement(input: TestMovement) {
  requireTestMoneyMode();
  const { userId, amountMinor, reference, direction } = input;
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (typeof amountMinor !== "bigint" || amountMinor < 1n || amountMinor > MAX_WALLET_MINOR) throw new WalletError("INVALID_AMOUNT", "Enter a positive amount with up to two decimal places.");
  if (typeof reference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/.test(reference)) throw new WalletError("INVALID_REFERENCE", "Use an operation reference of 8–100 letters, numbers, dots, colons, underscores, or hyphens.");
  if (description.length < 3 || description.length > 200) throw new WalletError("INVALID_DESCRIPTION", "Use a description of 3–200 characters.");
  if (!["credit", "debit"].includes(direction)) throw new WalletError("INVALID_DIRECTION", "Invalid money movement.");
  return getPrisma().$transaction(async tx => {
    // Lock identity so a concurrent suspension/deletion cannot pass this check.
    const users = await tx.$queryRaw<{ status: string; phoneNumberVerified: boolean }[]>`SELECT "status", "phoneNumberVerified" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
    if (!users[0] || users[0].status !== "ACTIVE" || !users[0].phoneNumberVerified) throw new WalletError("ACCOUNT_UNAVAILABLE", "An active verified account is required.", 403);
    const operationKey = `test:${userId}:${reference}`;
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`;
    const user = await tx.walletAccount.upsert({ where: { userId }, create: { userId, key: `user:test:${userId}`, kind: "USER" }, update: {} });
    const clearing = await tx.walletAccount.upsert({ where: { key: "system:test-clearing" }, create: { key: "system:test-clearing", kind: "TEST_CLEARING" }, update: {} });
    const sourceId = direction === "credit" ? clearing.id : user.id;
    const destinationId = direction === "credit" ? user.id : clearing.id;
    const kind = direction === "credit" ? "TEST_CREDIT" : "TEST_DEBIT";
    const existing = await tx.walletTransfer.findUnique({ where: { operationKey } });
    if (existing) {
      if (existing.sourceId !== sourceId || existing.destinationId !== destinationId || existing.amountMinor !== amountMinor || existing.kind !== kind || existing.description !== description) throw new WalletError("IDEMPOTENCY_CONFLICT", "That reference was already used for different details.", 409);
      return { transferId: existing.id, replayed: true };
    }
    const accounts = await tx.$queryRaw<{ id: string; balanceMinor: bigint }[]>`SELECT "id", "balanceMinor" FROM "WalletAccount" WHERE "id" IN (${sourceId}, ${destinationId}) ORDER BY "id" FOR UPDATE`;
    const balance = accounts.find(account => account.id === user.id)!.balanceMinor;
    if (direction === "debit" && balance < amountMinor) throw new WalletError("INSUFFICIENT_FUNDS", "Your test balance is too low.", 409);
    if (direction === "credit" && balance + amountMinor > MAX_WALLET_MINOR) throw new WalletError("BALANCE_LIMIT", "The test wallet balance limit would be exceeded.", 409);
    const transfer = await tx.walletTransfer.create({ data: { operationKey, kind, amountMinor, description, sourceId, destinationId } });
    return { transferId: transfer.id, replayed: false };
  }, { maxWait: 15000, timeout: 15000 });
}
