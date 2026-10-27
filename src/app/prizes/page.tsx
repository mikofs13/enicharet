import { Suspense } from "react";
import { redirect } from "next/navigation";
import { pageNumber } from "@/modules/auctions/api";

async function LegacyCollection({ searchParams }: PageProps<"/prizes">) {
  const { page } = await searchParams;
  const number = pageNumber(typeof page === "string" ? page : null);
  return redirect(number > 1 ? `/?page=${number}` : "/");
}

export default function PrizesRedirect(props: PageProps<"/prizes">) {
  return <Suspense fallback={null}><LegacyCollection {...props} /></Suspense>;
}
