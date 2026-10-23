import { walletApiError, walletHeaders, walletUser } from "@/modules/wallet/api";
import { getWallet } from "@/modules/wallet/service";

export async function GET(request: Request) {
  try {
    const user = await walletUser(request);
    return Response.json({ wallet: await getWallet(user.id) }, { headers: walletHeaders });
  } catch (error) { return walletApiError(error); }
}
