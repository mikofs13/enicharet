"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/modules/auctions/presentation";
export function PayOfferButton({ id, amountMinor }: { id: string; amountMinor: number }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [paid, setPaid] = useState(false);
  return <div><p className="field-hint">Choosing Pay deducts your winning bid amount from your test wallet. No additional entry fee applies. Test funds have no cash value.</p>
    <button className="button" disabled={busy || paid} onClick={async () => {
      setBusy(true); setError("");
      try {
        const response = await fetch(`/api/v1/offers/${id}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const data = await response.json();
        if (!response.ok) { setError(data.error ?? "Payment could not be confirmed. Retry this same offer."); return; }
        setPaid(true); router.refresh();
      } catch { setError("Confirmation was interrupted. Refresh or retry this same offer; it cannot charge twice."); }
      finally { setBusy(false); }
    }}>{busy ? "Confirming payment…" : paid ? "Test payment confirmed" : `Pay ${money(amountMinor)} in test funds`}</button>{error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
