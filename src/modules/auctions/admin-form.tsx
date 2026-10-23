"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fromEthiopianInput, toEthiopianInput } from "./presentation";

export type EditableAuction = {
  id: string; title: string; description: string; entryFeeMinor: number; maxBidsPerUser: number | null;
  paymentWindowSeconds: number; opensAt: string; closesAt: string; updatedAt: string;
  images: { url: string; alt: string }[];
};

export function AuctionForm({ auction, onDirty }: { auction?: EditableAuction; onDirty?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setFields({});
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(`/api/v1/admin/auctions${auction ? `/${auction.id}` : ""}`, {
        method: auction ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, updatedAt: auction?.updatedAt,
          opensAt: fromEthiopianInput(String(body.opensAt)), closesAt: fromEthiopianInput(String(body.closesAt)) }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Could not save this draft."); setFields(result.fields ?? {}); return; }
      router.push(`/admin/auctions/${result.auction.id}`); router.refresh();
      setError("");
    } catch { setError("Could not connect. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  const field = (name: string, label: string, type = "text", value: string | number = "", hint?: string) => <div className="field">
    <label htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={value} required={!['maxBidsPerUser', 'imageUrl', 'imageAlt'].includes(name)}
      maxLength={name === "title" ? 120 : undefined} min={type === "number" ? 1 : undefined} step={type === "number" ? 1 : undefined}
      aria-invalid={!!fields[name]} aria-describedby={`${name}-help`} />
    <p id={`${name}-help`} className={fields[name] ? "field-error" : "field-hint"}>{fields[name] ?? hint}</p>
  </div>;
  return <form className="auth-form auction-form" onSubmit={save} onChange={onDirty}>
    {error && <p className="form-error" role="alert">{error}</p>}
    <fieldset disabled={busy}>
      <legend className="sr-only">Auction details</legend>
      {field("title", "Prize title", "text", auction?.title)}
      <div className="field"><label htmlFor="description">Prize description</label><textarea id="description" name="description" required minLength={20} maxLength={5000} rows={6} defaultValue={auction?.description} aria-invalid={!!fields.description} aria-describedby="description-help" /><p id="description-help" className={fields.description ? "field-error" : "field-hint"}>{fields.description ?? "Include condition, specifications, and collection or delivery details. Plain text only."}</p></div>
      <div className="form-grid">{field("entryFee", "Fee per bid (birr)", "text", auction ? (auction.entryFeeMinor / 100).toFixed(2) : "", "Up to two decimal places. This fee applies to every bid.")}
        {field("maxBidsPerUser", "Bid limit per person", "number", auction?.maxBidsPerUser ?? "", "Leave blank for unlimited bids.")}
        {field("opensAt", "Opens · Ethiopian time (UTC+3)", "datetime-local", auction ? toEthiopianInput(auction.opensAt) : "")}
        {field("closesAt", "Closes · Ethiopian time (UTC+3)", "datetime-local", auction ? toEthiopianInput(auction.closesAt) : "")}
        {field("paymentWindowHours", "Winner payment deadline (hours)", "number", auction ? auction.paymentWindowSeconds / 3600 : 24, "Hours after the winner is offered the prize. Between 1 and 720.")}
      </div>
      {field("imageUrl", "Prize image URL (optional)", "url", auction?.images[0]?.url, "Use a public HTTPS image URL. Image uploads will come later.")}
      {field("imageAlt", "Image description", "text", auction?.images[0]?.alt, "Required when you add an image. Describe the prize shown.")}
      <button className="button" disabled={busy} type="submit">{busy ? "Saving…" : auction ? "Save draft" : "Create draft"}</button>
      <p className="field-hint">Drafts are private. Review the saved details before publishing.</p>
    </fieldset>
  </form>;
}

export function DraftEditor({ auction }: { auction: EditableAuction }) {
  const [dirty, setDirty] = useState(false);
  return <><AuctionForm auction={auction} onDirty={() => setDirty(true)} />{dirty ? <p className="notice" role="status">Save your changes before publishing this draft.</p> : <PublishAuction id={auction.id} updatedAt={auction.updatedAt} />}</>;
}

export function PublishAuction({ id, updatedAt }: { id: string; updatedAt: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className="publish-panel"><h2>Ready to publish?</h2><p>Publishing makes this prize public and locks its details. Test-money bidding follows the schedule; closing and offers require the settlement worker. Real payments are not enabled.</p>
    <button className="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        const response = await fetch(`/api/v1/admin/auctions/${id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updatedAt }) });
        const data = await response.json();
        if (!response.ok) { setError(data.error ?? "Could not publish."); return; }
        router.refresh();
      } catch { setError("Could not connect. Try again."); } finally { setBusy(false); }
    }}>{busy ? "Publishing…" : "Publish and lock details"}</button>{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
