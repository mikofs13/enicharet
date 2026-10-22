import { publishAuction } from "@/modules/auctions/service";
import { apiError, noStore, readAdminWrite } from "@/modules/auctions/api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { return Response.json({ auction: await publishAuction((await context.params).id, await readAdminWrite(request)) }, { headers: noStore }); }
  catch (error) { return apiError(error); }
}
