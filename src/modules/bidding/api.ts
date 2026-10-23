import "server-only";
import { getPrisma } from "@/lib/prisma";
import { BidError } from "./validation";
import { WalletError } from "@/modules/wallet/money";
import { walletHeaders } from "@/modules/wallet/api";

export function bidApiError(error: unknown) {
  const known = error instanceof BidError || error instanceof WalletError;
  return Response.json({ code: known ? error.code : "BID_UNAVAILABLE", error: known ? error.message : "We could not confirm this bid. Retry with the same request reference or check My bids." }, { status: known ? error.status : 500, headers: walletHeaders });
}
export async function readBidBody(request: Request) {
  const expected = process.env.BETTER_AUTH_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin) throw new BidError("INVALID_ORIGIN", "Request origin is not allowed.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new BidError("INVALID_CONTENT_TYPE", "Send a JSON bid.", 415);
  if (!request.body) throw new BidError("INVALID_BID", "Enter a bid amount.");
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); throw new BidError("REQUEST_TOO_LARGE", "Bid request is too large.", 413); } parts.push(value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown; } catch { throw new BidError("INVALID_BID", "Invalid JSON bid."); }
}
export async function limitBidRequests(userId: string) {
  const now = BigInt(Date.now()); const key = `bid-submit:${userId}`;
  const rows = await getPrisma().$queryRaw<{ key: string }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest") VALUES (${crypto.randomUUID()}, ${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."lastRequest" <= ${now - 60000n} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" <= ${now - 60000n} THEN ${now} ELSE "RateLimit"."lastRequest" END
    WHERE "RateLimit"."count" < 30 OR "RateLimit"."lastRequest" <= ${now - 60000n} RETURNING "key"`;
  if (!rows.length) throw new BidError("TOO_MANY_BIDS", "Wait a minute before submitting more bids.", 429);
}
