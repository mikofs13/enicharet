"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReadNotificationButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const router = useRouter();
  return <div><button className="text-button" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) { const body = await response.json(); setError(body.error ?? "Could not mark this notification read."); }
      else router.refresh();
    } catch { setError("Connection interrupted. Try again."); }
    finally { setBusy(false); }
  }}>{busy ? "Saving…" : "Mark as read"}</button>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
