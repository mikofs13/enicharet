import { walletUser, walletHeaders } from "@/modules/wallet/api";
import { WalletError } from "@/modules/wallet/money";
import { notificationApiError } from "@/modules/notifications/api";
import { auctionOperations } from "@/modules/settlement/operations";

export async function GET(request: Request) {
  try {
    const user = await walletUser(request);
    if (user.role !== "ADMIN") throw new WalletError("ADMIN_REQUIRED", "Administrator access is required.", 403);
    const params = new URL(request.url).searchParams;
    return Response.json(await auctionOperations(params.get("view") ?? "active", params.get("after") ?? undefined), { headers: walletHeaders });
  } catch (error) { return notificationApiError(error); }
}
