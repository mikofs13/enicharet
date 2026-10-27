import { Suspense } from "react";
import { headers } from "next/headers";
import { getSessionUser } from "@/modules/accounts/session";
import { SiteNavigation } from "./site-navigation";

async function SessionHeader() {
  const user = await getSessionUser(await headers());
  return <SiteNavigation signedIn={user?.status === "ACTIVE"} />;
}
export function SiteHeader({ signedIn }: { signedIn?: boolean }) {
  return signedIn === undefined ? <Suspense fallback={<SiteNavigation signedIn={false} />}><SessionHeader /></Suspense> : <SiteNavigation signedIn={signedIn} />;
}
