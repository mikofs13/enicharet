import "server-only";
import { getSessionUser } from "@/modules/accounts/session";
import { WalletError } from "./money";

export const walletHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function walletUser(request: Request) {
  const user = await getSessionUser(request.headers);
  if (!user) throw new WalletError("UNAUTHENTICATED", "Sign in to view your wallet.", 401);
  if (user.status !== "ACTIVE") throw new WalletError("ACCOUNT_SUSPENDED", "This account is suspended.", 403);
  return user;
}

export function walletApiError(error: unknown) {
  return Response.json(error instanceof WalletError ? { code: error.code, error: error.message } :
    { code: "WALLET_UNAVAILABLE", error: "We could not load your wallet. Please try again." },
  { status: error instanceof WalletError ? error.status : 500, headers: walletHeaders });
}
