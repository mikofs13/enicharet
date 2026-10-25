import { getSessionUser } from "@/modules/accounts/session";
import { readBidBody } from "@/modules/bidding/api";
import { BidError } from "@/modules/bidding/validation";
import { addAdminFunds } from "@/modules/wallet/admin-funding";
import { walletHeaders } from "@/modules/wallet/api";
import { WalletError } from "@/modules/wallet/money";

export async function POST(request: Request) {
  try {
    const actor = await getSessionUser(request.headers);
    if (!actor) throw new WalletError("AUTH_REQUIRED", "Sign in to continue.", 401);
    if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new WalletError("ADMIN_REQUIRED", "An active administrator account is required.", 403);
    return Response.json(await addAdminFunds(actor.id, await readBidBody(request)), { headers: walletHeaders });
  } catch (error) {
    const known = error instanceof WalletError || error instanceof BidError;
    return Response.json({ code: known ? error.code : "FUNDING_UNCONFIRMED", error: known ? error.message : "Credit not confirmed. Retry with the same reference." }, { status: known ? error.status : 500, headers: walletHeaders });
  }
}
