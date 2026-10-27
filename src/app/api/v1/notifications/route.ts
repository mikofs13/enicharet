import { walletUser, walletHeaders } from "@/modules/wallet/api";
import { WalletError } from "@/modules/wallet/money";
import { notificationApiError } from "@/modules/notifications/api";
import { myNotifications } from "@/modules/notifications/service";

export async function GET(request: Request) {
  try {
    const user = await walletUser(request);
    const before = new URL(request.url).searchParams.get("before") ?? undefined;
    if (before !== undefined && (!before || before.length > 128)) throw new WalletError("INVALID_CURSOR", "Invalid notification cursor.");
    return Response.json(await myNotifications(user.id, before), { headers: walletHeaders });
  } catch (error) { return notificationApiError(error); }
}
