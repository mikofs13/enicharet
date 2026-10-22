import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "./session";

export async function requireUser() {
  const user = await getSessionUser(await headers());
  if (!user) redirect("/login");
  if (user.status !== "ACTIVE") redirect("/account-suspended");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/access-denied");
  return user;
}
