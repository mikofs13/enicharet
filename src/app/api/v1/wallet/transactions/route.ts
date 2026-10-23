import { walletApiError, walletHeaders, walletUser } from "@/modules/wallet/api";
import { WalletError } from "@/modules/wallet/money";
import { getWalletHistory } from "@/modules/wallet/service";

export async function GET(request: Request) {
  try {
    const user = await walletUser(request);
    const before = new URL(request.url).searchParams.get("before") ?? undefined;
    if (before !== undefined && (!before || before.length > 128)) throw new WalletError("INVALID_CURSOR", "Invalid history cursor.");
    return Response.json(await getWalletHistory(user.id, before), { headers: walletHeaders });
  } catch (error) { return walletApiError(error); }
}
