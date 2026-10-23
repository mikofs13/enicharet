"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/modules/auctions/presentation";
import { formatWalletMoney } from "@/modules/wallet/money";

export function BidForm({ slug, feeMinor, balanceMinor }: { slug: string; feeMinor: number; balanceMinor: string }) {
  const router = useRouter();
  const attempt = useRef<{ amount: string; reference: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage(""); setError("");
    attempt.current ??= { amount: amount.trim(), reference: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/v1/auctions/${encodeURIComponent(slug)}/bids`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt.current) });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not confirm this bid.");
        // A server failure can occur after commit. Keep the exact request key.
        if (response.status >= 500 || response.status === 429) setUncertain(true);
        else { attempt.current = null; setUncertain(false); }
        return;
      }
      setMessage(`${data.replayed ? "Your earlier bid is confirmed" : "Bid saved"}: ${money(data.bid.amountMinor)}. Entry fee: ${money(data.bid.entryFeeMinor)} in test funds. Reference: ${data.bid.id}`);
      attempt.current = null; setUncertain(false); setAmount(""); router.refresh();
    } catch {
      setUncertain(true); setError("Confirmation was interrupted. Retry this same bid or check My bids before submitting another amount.");
    } finally { setBusy(false); }
  }
  const tooLow = BigInt(balanceMinor) < BigInt(feeMinor);
  return <section className="publish-panel" aria-labelledby="bid-heading"><p className="eyebrow">Test-money bidding</p><h2 id="bid-heading">Choose your amount.</h2>
    <p>Available test balance: <strong>{formatWalletMoney(balanceMinor)}</strong>. Each accepted bid costs <strong>{money(feeMinor)}</strong> in test funds. Your proposed bid amount is not charged or reserved.</p>
    <form className="auth-form" onSubmit={submit}><div className="field"><label htmlFor="bid-amount">Your bid (birr)</label><input id="bid-amount" name="amount" inputMode="decimal" autoComplete="off" required maxLength={20} value={amount} disabled={busy || uncertain} onChange={event => setAmount(event.target.value)} aria-describedby="bid-help" /><p id="bid-help" className="field-hint">Minimum 1.00 birr, up to two decimal places. You cannot repeat your own amount for this prize. Other bidders’ amounts stay private.</p></div>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
      {tooLow && !uncertain && <p className="field-hint">You need more test funds before submitting a bid. Real deposits are not enabled.</p>}
      <button className="button" type="submit" disabled={busy || (tooLow && !uncertain)}>{busy ? "Confirming…" : uncertain ? "Retry this same bid" : `Submit bid · ${money(feeMinor)} test fee`}</button>
    </form><p className="field-hint"><Link className="text-link" href="/bids">My bids →</Link> · <Link className="text-link" href="/wallet">My test wallet →</Link></p>
    <p className="field-hint">Test funds have no cash value. After closing, check <Link href="/offers">My offers</Link> for a test winning offer and payment deadline.</p>
  </section>;
}
