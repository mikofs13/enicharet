import { walletUser, walletHeaders } from "@/modules/wallet/api";
import { WalletError } from "@/modules/wallet/money";
import { readBidBody } from "@/modules/bidding/api";
import { notificationApiError } from "@/modules/notifications/api";
import { markNotificationRead } from "@/modules/notifications/service";

export async function POST(request: Request, context: RouteContext<"/api/v1/notifications/[id]/read">) {
  try {
    const user = await walletUser(request);
    const body = await readBidBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) throw new WalletError("INVALID_REQUEST", "Send an empty JSON object.");
    const { id } = await context.params;
    if (!id || id.length > 128) throw new WalletError("NOTIFICATION_NOT_FOUND", "Notification not found.", 404);
    return Response.json(await markNotificationRead(user.id, id), { headers: walletHeaders });
  } catch (error) { return notificationApiError(error); }
}
