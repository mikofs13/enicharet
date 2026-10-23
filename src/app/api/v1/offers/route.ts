import { walletUser, walletHeaders } from "@/modules/wallet/api";
import { offerApiError } from "@/modules/settlement/api";
import { myOffers, SettlementError } from "@/modules/settlement/service";
export async function GET(request: Request) {
  try {
    const user = await walletUser(request); const before = new URL(request.url).searchParams.get("before") ?? undefined;
    if (before !== undefined && (!before || before.length > 128)) throw new SettlementError("INVALID_CURSOR", "Invalid offer history cursor.");
    return Response.json(await myOffers(user.id, before), { headers: walletHeaders });
  } catch (error) { return offerApiError(error); }
}
