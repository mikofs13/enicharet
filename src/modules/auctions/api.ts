import "server-only";
import { getSessionUser } from "@/modules/accounts/session";
import { AuctionError } from "./validation";

export const noStore = { "Cache-Control": "no-store" };

export async function assertAdmin(request: Request) {
  const user = await getSessionUser(request.headers);
  if (!user) throw new AuctionError("Sign in to continue.", 401);
  if (user.status !== "ACTIVE" || user.role !== "ADMIN") throw new AuctionError("Administrator access required.", 403);
}

export async function readAdminWrite(request: Request) {
  await assertAdmin(request);
  const expected = process.env.BETTER_AUTH_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin) throw new AuctionError("Request origin is not allowed.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AuctionError("Send JSON auction details.", 415);
  const text = await request.text();
  if (text.length > 16000) throw new AuctionError("Auction details are too large.", 413);
  try { return JSON.parse(text) as unknown; } catch { throw new AuctionError("Invalid JSON request."); }
}

export function apiError(error: unknown) {
  if (error instanceof AuctionError) return Response.json({ error: error.message, fields: error.fields }, { status: error.status, headers: noStore });
  return Response.json({ error: "We could not complete this request. Please try again." }, { status: 500, headers: noStore });
}

export function pageNumber(value: string | null | undefined) {
  const page = Number(value ?? 1);
  return Number.isSafeInteger(page) && page >= 1 && page <= 100000 ? page : 1;
}
