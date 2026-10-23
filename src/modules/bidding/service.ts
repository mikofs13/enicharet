import "server-only";
import { getPrisma } from "@/lib/prisma";
import { postBidFee } from "@/modules/wallet/posting";
import { BidError, validateBid } from "./validation";

export async function placeBid(userId: string, auctionId: string, input: unknown) {
  const { amountMinor, reference } = validateBid(input);
  return getPrisma().$transaction(async tx => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${'bid-user:' + userId}, 0))`;
    const users = await tx.$queryRaw<{ status: string; phoneNumberVerified: boolean }[]>`SELECT "status", "phoneNumberVerified" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
    if (!users[0] || users[0].status !== "ACTIVE" || !users[0].phoneNumberVerified) throw new BidError("ACCOUNT_UNAVAILABLE", "An active verified account is required.", 403);
    const operationKey = `bid:${userId}:${reference}`;
    const previous = await tx.bid.findUnique({ where: { operationKey } });
    if (previous) {
      if (previous.auctionId !== auctionId || previous.amountMinor !== amountMinor) throw new BidError("IDEMPOTENCY_CONFLICT", "This request reference was used for a different bid.", 409);
      return { bid: previous, replayed: true };
    }
    await tx.$queryRaw`SELECT "id" FROM "Auction" WHERE "id" = ${auctionId} FOR SHARE`;
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status === "DRAFT") throw new BidError("AUCTION_NOT_FOUND", "Prize not found.", 404);
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    if (!["SCHEDULED", "OPEN"].includes(auction.status) || now < auction.opensAt || now >= auction.closesAt) throw new BidError("AUCTION_NOT_OPEN", "This auction is not accepting bids right now.", 409);
    if (await tx.bid.findUnique({ where: { auctionId_userId_amountMinor: { auctionId, userId, amountMinor } } })) throw new BidError("AMOUNT_ALREADY_USED", "You already submitted this amount for this prize. Choose a different amount.", 409);
    if (auction.maxBidsPerUser !== null && await tx.bid.count({ where: { userId, auctionId } }) >= auction.maxBidsPerUser) throw new BidError("BID_LIMIT_REACHED", "You have reached this prize's bid limit.", 409);
    const fee = await postBidFee(tx, userId, auctionId, auction.entryFeeMinor, `fee:${operationKey}`);
    const bid = await tx.bid.create({ data: { userId, auctionId, amountMinor, entryFeeMinor: auction.entryFeeMinor, feeTransferId: fee.id, operationKey } });
    return { bid, replayed: false };
  }, { maxWait: 15000, timeout: 15000 });
}

export async function myBids(userId: string, before?: string) {
  const db = getPrisma();
  const cursor = before ? await db.bid.findFirst({ where: { id: before, userId } }) : null;
  if (before && !cursor) throw new BidError("INVALID_CURSOR", "This bid history page is unavailable.");
  const rows = await db.bid.findMany({ where: { userId, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
    select: { id: true, amountMinor: true, entryFeeMinor: true, createdAt: true, auction: { select: { title: true, slug: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21 });
  return { items: rows.slice(0, 20).map(row => ({ ...row, createdAt: row.createdAt.toISOString(), mode: "TEST" })), nextCursor: rows.length > 20 ? rows[19].id : null };
}
