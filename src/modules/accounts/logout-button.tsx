"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "./auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function logout() {
    setPending(true);
    setError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }
  return <span className="logout-control"><button className="text-button" onClick={logout} disabled={pending}>{pending ? "Logging out…" : "Log out"}</button>{error && <span className="inline-error" role="alert">Could not log out. Try again.</span>}</span>;
}
