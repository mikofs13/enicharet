import { getAdminAuction, updateAuction } from "@/modules/auctions/service";
import { apiError, assertAdmin, noStore, readAdminWrite } from "@/modules/auctions/api";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await assertAdmin(request);
    const auction = await getAdminAuction((await context.params).id);
    return Response.json(auction ? { auction } : { error: "Auction not found." }, { status: auction ? 200 : 404, headers: noStore });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request, context: Context) {
  try { return Response.json({ auction: await updateAuction((await context.params).id, await readAdminWrite(request)) }, { headers: noStore }); }
  catch (error) { return apiError(error); }
}
