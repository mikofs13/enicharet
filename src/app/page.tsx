import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { listAuctions } from "@/modules/auctions/service";
import { auctionPhase, formatDate, money } from "@/modules/auctions/presentation";
import { Pagination, PrizeImage } from "@/modules/auctions/components";
import { pageNumber } from "@/modules/auctions/api";
import { prizeCategory } from "@/components/prize-art";

export const metadata = { title: "Prizes | Enicharet" };
async function Content({ searchParams }: PageProps<"/">) {
  await connection();
  const { page } = await searchParams;
  const data = await listAuctions(pageNumber(typeof page === "string" ? page : null));
  const now = new Date();
  return <><div className="page-heading"><p className="eyebrow">The prize collection</p><h1>Find your next <span>possibility.</span></h1><p className="intro-copy">Browse the collection. Log in to open a prize and bid with test funds. Real payments and prize handovers are not enabled.</p><Link className="text-link collection-help-link" href="#how-it-works">How it works <span aria-hidden="true">↓</span></Link></div>
    {data.items.length ? <><div className="collection-caption"><span>{data.total} {data.total === 1 ? "prize" : "prizes"} in the collection</span><span>Entry fees shown in test birr</span></div><div className="prize-grid">{data.items.map(auction => <Link className="prize-card" href={`/prizes/${auction.slug}`} key={auction.id}><PrizeImage title={auction.title} image={auction.images[0]} /><div className="prize-card-copy"><div className="prize-card-meta"><span className="category-label">{prizeCategory(auction.title)}</span><span className="auction-status">{auctionPhase(auction, now)}</span></div><h2>{auction.title}</h2><p className="prize-entry-fee">{money(auction.entryFeeMinor)}<span> entry fee per bid</span></p><p className="field-hint">Closes {formatDate(auction.closesAt)} EAT</p><span className="prize-card-action">View prize <span aria-hidden="true">↗</span></span></div></Link>)}</div></> : <div className="empty-state"><h2>{data.total ? "No prizes on this page." : "The first possibility is on its way."}</h2><p>{data.total ? "Return to the first page to browse prizes." : "Published prizes will appear here, with their dates and entry rules."}</p><Link className="text-link" href={data.total ? "/" : "/account"}>{data.total ? "View prizes →" : "Go to my account →"}</Link></div>}
    <Pagination page={data.page} pages={data.pages} base="/" /></>;
}
export default function HomePage(props: PageProps<"/">) {
  return <><SiteHeader /><main id="main-content" className="auction-page"><Suspense fallback={<p role="status">Loading prizes…</p>}><Content {...props} /></Suspense><section className="how-section" id="how-it-works" aria-labelledby="how-heading"><div className="section-heading"><h2 id="how-heading">How it works.</h2><Link className="text-link" href="#main-content">Back to prizes ↑</Link></div><ol className="how-it-works"><li><span>01</span><h3>Find your prize.</h3><p>Browse freely. Log in with your phone number to open a prize, review its rules, and use your test wallet.</p></li><li><span>02</span><h3>Choose your number.</h3><p>Pay the fixed entry fee for each accepted bid. Matching amounts are excluded. Losing bidders never pay their bid amounts.</p></li><li><span>03</span><h3>Pay if you win.</h3><p>The lowest unique bidder gets the first offer. Pay your bid amount before the deadline. Missing it excludes all your bids for that prize and passes the offer to the next eligible bidder.</p></li></ol><p className="field-hint">No eligible winner? Entry fees are refunded to test wallets. Test funds have no cash value; real deposits, withdrawals, and prize handovers are not enabled.</p></section></main></>;
}

