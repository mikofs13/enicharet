import "server-only";
import { BidError } from "@/modules/bidding/validation";
import { WalletError } from "@/modules/wallet/money";
import { walletHeaders } from "@/modules/wallet/api";

export function notificationApiError(error: unknown) {
  const known = error instanceof WalletError || error instanceof BidError;
  return Response.json({ code: known ? error.code : "NOTIFICATIONS_UNAVAILABLE", error: known ? error.message : "Notifications are unavailable. Please try again." }, { status: known ? error.status : 500, headers: walletHeaders });
}
