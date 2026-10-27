"use client";
import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type RetryRequest = { kind: "settlement" | "notification"; id: string; expectedAttempts: number; reason: string; reference: string };
export function OperationRetryForm({ kind, id, attempts, canRetry }: { kind: RetryRequest["kind"]; id: string; attempts: number; canRetry: boolean }) {
  const fieldId = useId(); const router = useRouter();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<RetryRequest | null>(null);
  const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    const request = pending ?? { kind, id, expectedAttempts: attempts, reason: String(data.get("reason")), reference: crypto.randomUUID() };
    setPending(request); setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/admin/operations/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
      const body = await response.json();
      if (!response.ok) { if (response.status < 500) setPending(null); setError(body.error ?? "Retry request not confirmed. Try the same request again."); return; }
      setSuccess(`Retry scheduled. The worker must be running to process it. Audit reference: ${body.auditId}`); setPending(null); router.refresh();
    } catch { setError("Connection interrupted. Submit the same request again to confirm it safely."); }
    finally { setBusy(false); }
  }
  if (success) return <p className="notice retry-result" role="status">{success}</p>;
  if (!canRetry && !pending) return <p className="field-hint">No manual retry is available in this state. Due work is already queued for its worker.</p>;
  if (!open) return <button className="button button-small" onClick={() => setOpen(true)}>Request earlier retry</button>;
  return <form className="auth-form retry-form" onSubmit={submit}>
    <p>Move this failed item’s next attempt to now. Its worker will apply the normal rules. Check the failure cause and worker first.</p>
    <fieldset disabled={busy || pending !== null}><div className="field"><label htmlFor={fieldId}>Reason for retry</label><input id={fieldId} name="reason" required minLength={3} maxLength={200} aria-describedby={`${fieldId}-hint`} /><p id={`${fieldId}-hint`} className="field-hint">Saved in the permanent admin audit. Do not include secrets or customer contact details.</p></div></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    {pending && !busy && <p className="field-hint">The original request is retained for safe retries. Reference: {pending.reference}</p>}
    <div className="notification-actions"><button className="button button-small" disabled={busy} type="submit">{busy ? "Scheduling…" : pending ? "Confirm same retry" : "Schedule retry now"}</button>{!pending && <button className="text-button" type="button" onClick={() => { setOpen(false); setError(""); }}>Cancel</button>}</div>
  </form>;
}
