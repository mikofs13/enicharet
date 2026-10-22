import { createAuction, listAuctions } from "@/modules/auctions/service";
import { apiError, assertAdmin, noStore, pageNumber, readAdminWrite } from "@/modules/auctions/api";

export async function GET(request: Request) {
  try {
    await assertAdmin(request);
    return Response.json(await listAuctions(pageNumber(new URL(request.url).searchParams.get("page")), true), { headers: noStore });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try { return Response.json({ auction: await createAuction(await readAdminWrite(request)) }, { status: 201, headers: noStore }); }
  catch (error) { return apiError(error); }
}
