import { walletUser, walletHeaders } from "@/modules/wallet/api";
import { WalletError } from "@/modules/wallet/money";
import { readBidBody } from "@/modules/bidding/api";
import { notificationApiError } from "@/modules/notifications/api";
import { retryOperation } from "@/modules/settlement/retry";
import { BidError } from "@/modules/bidding/validation";

export async function POST(request: Request) {
  try {
    const actor = await walletUser(request);
    if (actor.role !== "ADMIN") throw new WalletError("ADMIN_REQUIRED", "Administrator access is required.", 403);
    return Response.json(await retryOperation(actor.id, await readBidBody(request)), { headers: walletHeaders });
  } catch (error) {
    if (error instanceof WalletError || error instanceof BidError) return notificationApiError(error);
    return Response.json({ code: "RETRY_UNCONFIRMED", error: "We could not confirm this retry. Submit the same request again to check it safely." }, { status: 500, headers: walletHeaders });
  }
}
