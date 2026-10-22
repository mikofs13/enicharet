import { getPublicAuction } from "@/modules/auctions/service";
import { apiError, noStore } from "@/modules/auctions/api";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const auction = await getPublicAuction((await context.params).slug);
    return Response.json(auction ? { auction } : { error: "Prize not found." }, { status: auction ? 200 : 404, headers: noStore });
  } catch (error) { return apiError(error); }
}
