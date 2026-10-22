import { listAuctions } from "@/modules/auctions/service";
import { apiError, noStore, pageNumber } from "@/modules/auctions/api";

export async function GET(request: Request) {
  try { return Response.json(await listAuctions(pageNumber(new URL(request.url).searchParams.get("page"))), { headers: noStore }); }
  catch (error) { return apiError(error); }
}
