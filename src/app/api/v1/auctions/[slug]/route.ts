import { getPublicAuction } from "@/modules/auctions/service";
import { apiError, noStore } from "@/modules/auctions/api";
import { publicAuctionResult } from "@/modules/settlement/service";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const auction = await getPublicAuction((await context.params).slug);
    return Response.json(auction ? { auction, result: await publicAuctionResult(auction.id) } : { error: "Prize not found." }, { status: auction ? 200 : 404, headers: noStore });
  } catch (error) { return apiError(error); }
}
