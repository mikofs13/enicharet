import { BidError } from "@/modules/bidding/validation";
import { WalletError } from "@/modules/wallet/money";
import { walletHeaders } from "@/modules/wallet/api";
export function offerApiError(error: unknown) {
  const known = error instanceof BidError || error instanceof WalletError;
  return Response.json({ code: known ? error.code : "OFFER_UNAVAILABLE", error: known ? error.message : "We could not confirm this offer. Refresh My offers or retry the same payment." }, { status: known ? error.status : 500, headers: walletHeaders });
}
