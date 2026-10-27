import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/modules/accounts/page-guards";
import { myBids } from "@/modules/bidding/service";
import { formatDate, money } from "@/modules/auctions/presentation";

export const metadata = { title: "My bids | Enicharet" };
async function Content({ searchParams }: PageProps<"/bids">) {
  const user = await requireUser();
  const { before } = await searchParams;
  let data;
  try { data = await myBids(user.id, typeof before === "string" && before.length <= 128 ? before : undefined); }
  catch { return <main id="main-content" className="account-page"><h1>History unavailable.</h1><Link className="button" href="/bids">Return to My bids</Link></main>; }
  return <><SiteHeader signedIn /><main id="main-content" className="account-page"><Link className="text-link" href="/account">← My account</Link><p className="eyebrow wallet-eyebrow">Test-money activity</p><h1>My bids.</h1><p className="intro-copy">Your submitted amounts and entry fees. Other bidders’ amounts and uniqueness status are private.</p>
    {data.items.length ? <ol className="wallet-history">{data.items.map(bid => <li key={bid.id}><div><h3><Link className="text-link" href={`/prizes/${bid.auction.slug}`}>{bid.auction.title} →</Link></h3><p>Your bid: {money(bid.amountMinor)} · Test fee paid: {money(bid.entryFeeMinor)}</p><p><time dateTime={bid.createdAt}>{formatDate(bid.createdAt)} EAT</time></p><small>Reference: {bid.id}</small></div><span>Submitted</span></li>)}</ol> : <div className="empty-state"><h2>No bids here yet.</h2><p>Choose an open prize to submit a bid using your test wallet.</p><Link className="text-link" href="/">Explore prizes →</Link></div>}
    <nav className="pagination" aria-label="Bid history pages">{before && <Link className="text-link" href="/bids">Latest bids</Link>}{data.nextCursor && <Link className="text-link" href={`/bids?before=${data.nextCursor}`}>Older bids →</Link>}</nav><p className="field-hint">Submission does not mean you have won. Check <Link className="text-link" href="/offers">My offers</Link> after closing for any winning offer and deadline.</p></main></>;
}
export default function MyBidsPage(props: PageProps<"/bids">) { return <Suspense fallback={<main id="main-content" className="account-page" role="status">Loading your bids…</main>}><Content {...props} /></Suspense>; }

