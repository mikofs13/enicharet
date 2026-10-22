import { getSessionUser } from "@/modules/accounts/session";

export async function GET(request: Request) {
  const user = await getSessionUser(request.headers);
  const headers = { "Cache-Control": "no-store" };
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401, headers });
  if (user.status !== "ACTIVE") {
    return Response.json({ error: "Account suspended." }, { status: 403, headers });
  }
  return Response.json({ user }, { headers });
}
