import { getSessionUser } from "@/modules/accounts/session";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await getSessionUser(request.headers);
  const headers = { "Cache-Control": "no-store" };
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401, headers });
  if (user.status !== "ACTIVE" || user.role !== "ADMIN") {
    return Response.json({ error: "Administrator access required." }, { status: 403, headers });
  }
  const [users, auctions] = await Promise.all([
    getPrisma().user.count(),
    getPrisma().auction.count(),
  ]);
  return Response.json({ users, auctions }, { headers });
}
