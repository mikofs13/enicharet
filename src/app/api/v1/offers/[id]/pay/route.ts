import { walletUser, walletHeaders } from "@/modules/wallet/api";
import { readBidBody, limitBidRequests } from "@/modules/bidding/api";
import { offerApiError } from "@/modules/settlement/api";
import { payWinnerOffer, SettlementError } from "@/modules/settlement/service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await walletUser(request); const body = await readBidBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw new SettlementError("INVALID_PAYMENT", "Send an empty JSON object; the offer determines the amount.");
    await limitBidRequests(user.id); const { id } = await context.params;
    return Response.json(await payWinnerOffer(user.id, id), { headers: walletHeaders });
  } catch (error) { return offerApiError(error); }
}
