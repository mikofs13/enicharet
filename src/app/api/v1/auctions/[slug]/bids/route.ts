import { getPrisma } from "@/lib/prisma";
import { walletHeaders, walletUser } from "@/modules/wallet/api";
import { bidApiError, limitBidRequests, readBidBody } from "@/modules/bidding/api";
import { BidError } from "@/modules/bidding/validation";
import { placeBid } from "@/modules/bidding/service";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const user = await walletUser(request);
    const body = await readBidBody(request);
    await limitBidRequests(user.id);
    const { slug } = await context.params;
    const auction = await getPrisma().auction.findUnique({ where: { slug }, select: { id: true } });
    if (!auction) throw new BidError("AUCTION_NOT_FOUND", "Prize not found.", 404);
    const { bid, replayed } = await placeBid(user.id, auction.id, body);
    return Response.json({ bid: { id: bid.id, auctionId: bid.auctionId, amountMinor: bid.amountMinor, entryFeeMinor: bid.entryFeeMinor, mode: "TEST", createdAt: bid.createdAt.toISOString() }, replayed }, { status: replayed ? 200 : 201, headers: walletHeaders });
  } catch (error) { return bidApiError(error); }
}
