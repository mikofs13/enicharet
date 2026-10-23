import { walletHeaders, walletUser } from "@/modules/wallet/api";
import { bidApiError } from "@/modules/bidding/api";
import { BidError } from "@/modules/bidding/validation";
import { myBids } from "@/modules/bidding/service";

export async function GET(request: Request) {
  try {
    const user = await walletUser(request);
    const before = new URL(request.url).searchParams.get("before") ?? undefined;
    if (before !== undefined && (!before || before.length > 128)) throw new BidError("INVALID_CURSOR", "Invalid bid history cursor.");
    return Response.json(await myBids(user.id, before), { headers: walletHeaders });
  } catch (error) { return bidApiError(error); }
}
