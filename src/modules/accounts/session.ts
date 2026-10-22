import "server-only";

import { auth } from "./auth";
import { getPrisma } from "@/lib/prisma";

export async function getSessionUser(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  // Always read current permissions. Suspensions and role changes take effect
  // immediately, including for sessions that were created earlier.
  const user = await getPrisma().user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      phoneNumberVerified: true,
      role: true,
      status: true,
    },
  });
  // Old email-only cookies cannot authenticate after the phone-only switch.
  return user?.phoneNumber && user.phoneNumberVerified ? user : null;
}

