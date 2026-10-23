import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/modules/accounts/page-guards";
import { myOffers } from "@/modules/settlement/service";
import { PayOfferButton } from "@/modules/settlement/pay-button";
import { formatDate, money } from "@/modules/auctions/presentation";
export const metadata = { title: "My winner offers | Enicharet" };
async function Content({ searchParams }: PageProps<"/offers">) {
  const user = await requireUser(); const { before } = await searchParams;
  let data;
  try { data = await myOffers(user.id, typeof before === "string" && before.length <= 128 ? before : undefined); }
  catch { return <main id="main-content" className="account-page"><h1>Offers unavailable.</h1><Link className="button" href="/offers">Try loading your offers again</Link></main>; }
  const now = new Date();
  return <><SiteHeader signedIn /><main id="main-content" className="account-page"><Link className="text-link" href="/account">← My account</Link><p className="eyebrow wallet-eyebrow">Test-money results</p><h1>My winner offers.</h1><p className="intro-copy">The lowest unique bidder receives the first offer. Pay within the deadline to confirm your test win.</p><p className="field-hint">Check this page for offers. SMS/email offer notifications are not enabled.</p>
    <Link className="text-link" href="/offers">Refresh offers →</Link>
    {data.items.length ? <ol className="wallet-history">{data.items.map(offer => <li key={offer.id}><section><h2><Link href={`/prizes/${offer.auction.slug}`}>{offer.auction.title} →</Link></h2><p>Winning amount: <strong>{money(offer.amountMinor)}</strong> · {offer.state === "PAID" ? "Test winner confirmed" : offer.state === "EXPIRED" || new Date(offer.expiresAt) <= now ? "Deadline passed" : "Awaiting your test payment"}</p><p>Payment deadline: <time dateTime={offer.expiresAt}>{formatDate(offer.expiresAt)} EAT</time></p>
      {offer.state === "PENDING" && new Date(offer.expiresAt) > now ? <PayOfferButton id={offer.id} amountMinor={offer.amountMinor} /> : offer.state !== "PAID" ? <p className="field-hint">Missing this deadline excludes all your bids from further offers for this prize. You can still bid on other prizes.</p> : <p className="field-hint">Your winning bid amount was paid using test funds. This does not arrange a real prize handover.</p>}
      <small>Offer reference: {offer.id}</small></section></li>)}</ol> : <div className="empty-state"><h2>No offers yet.</h2><p>After an auction closes, your eligible winning offer will appear here when the settlement worker processes it.</p><Link className="text-link" href="/bids">Review my bids →</Link></div>}
    <nav className="pagination" aria-label="Winner offer pages">{before && <Link href="/offers">Latest offers</Link>}{data.nextCursor && <Link href={`/offers?before=${data.nextCursor}`}>Older offers →</Link>}</nav><Link className="text-link" href="/wallet">My test wallet →</Link>
  </main></>;
}
export default function OffersPage(props: PageProps<"/offers">) { return <Suspense fallback={<main id="main-content" className="account-page" role="status">Loading your winner offers…</main>}><Content {...props} /></Suspense>; }
