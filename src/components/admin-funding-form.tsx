"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatWalletMoney } from "@/modules/wallet/money";

type FundingRequest = { target: string; phoneNumber?: string; amount: string; reason: string; reference: string };

export function AdminFundingForm() {
  const router = useRouter();
  const [target, setTarget] = useState("self");
  const [pending, setPending] = useState<FundingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = pending ?? { target, ...(target === "phone" ? { phoneNumber: String(data.get("phoneNumber")) } : {}), amount: String(data.get("amount")), reason: String(data.get("reason")), reference: crypto.randomUUID() };
    setPending(payload); setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/v1/admin/wallet-funding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) {
        // A server/network failure may have committed. Keep the original request for a safe retry.
        if (response.status < 500) setPending(null);
        setError(result.error ?? "Credit not confirmed. Retry this request."); return;
      }
      setSuccess(`${result.replayed ? "Previously saved credit confirmed" : "Test credit saved"}. Available balance: ${formatWalletMoney(result.wallet.balanceMinor)}. Reference: ${result.transferId}`);
      setPending(null); form.reset(); setTarget("self"); router.refresh();
    } catch { setError("Connection interrupted. Retry to confirm the same credit; it will only be added once."); }
    finally { setBusy(false); }
  }

  return <form className="auth-form funding-form" onSubmit={submit}>
    <fieldset disabled={busy || pending !== null}>
      <legend className="funding-legend">Credit details</legend>
      <div className="field"><label htmlFor="funding-target">Recipient</label><select id="funding-target" value={target} onChange={event => setTarget(event.target.value)}><option value="self">My own wallet</option><option value="phone">Another account</option></select></div>
      {target === "phone" && <div className="field"><label htmlFor="funding-phone">Account phone number</label><input id="funding-phone" name="phoneNumber" type="tel" autoComplete="off" required maxLength={40} aria-describedby="funding-phone-hint" /><p id="funding-phone-hint" className="field-hint">Use the phone number of an existing, verified account.</p></div>}
      <div className="field"><label htmlFor="funding-amount">Amount to add (test birr)</label><input id="funding-amount" name="amount" inputMode="decimal" placeholder="100.00" required pattern="(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?" aria-describedby="funding-amount-hint" /><p id="funding-amount-hint" className="field-hint">Enter a positive amount, with up to two decimal places.</p></div>
      <div className="field"><label htmlFor="funding-reason">Reason</label><input id="funding-reason" name="reason" required minLength={3} maxLength={200} placeholder="Testing prize bids" aria-describedby="funding-reason-hint" /><p id="funding-reason-hint" className="field-hint">Saved in the audit record and the recipient’s wallet history. Do not include sensitive information.</p></div>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    {pending && !busy && <p className="field-hint">The original credit details are locked until this request is confirmed. Reference: {pending.reference}</p>}
    <button className="button" disabled={busy} type="submit">{busy ? "Saving credit…" : pending ? "Retry same credit" : "Add test funds"}</button>
    {success && <p className="notice funding-result" role="status">{success}</p>}
  </form>;
}
