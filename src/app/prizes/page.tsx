import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { listAuctions } from "@/modules/auctions/service";
import { auctionPhase, formatDate, money } from "@/modules/auctions/presentation";
import { Pagination, PrizeImage } from "@/modules/auctions/components";
import { pageNumber } from "@/modules/auctions/api";

export const metadata = { title: "Prizes | Enicharet" };
async function Content({ searchParams }: PageProps<"/prizes">) {
  await connection();
  const { page } = await searchParams;
  const data = await listAuctions(pageNumber(typeof page === "string" ? page : null));
  const now = new Date();
  return <><div className="page-heading"><p className="eyebrow">The prize collection</p><h1>Find your next <span>possibility.</span></h1><p className="intro-copy">Explore prizes and submit bids with test funds when bidding opens. Real payments and winner selection are not available yet.</p></div>
    {data.items.length ? <div className="prize-grid">{data.items.map(auction => <Link className="prize-card" href={`/prizes/${auction.slug}`} key={auction.id}><PrizeImage image={auction.images[0]} /><div className="prize-card-copy"><span className="auction-status">{auctionPhase(auction, now)}</span><h2>{auction.title}</h2><p>{money(auction.entryFeeMinor)} per bid</p><p className="field-hint">Closes {formatDate(auction.closesAt)}</p><span className="text-link">View prize →</span></div></Link>)}</div> : <div className="empty-state"><h2>{data.total ? "No prizes on this page." : "The first possibility is on its way."}</h2><p>{data.total ? "Return to the first page to browse prizes." : "Published prizes will appear here, with their dates and entry rules."}</p><Link className="text-link" href={data.total ? "/prizes" : "/account"}>{data.total ? "View prizes →" : "Go to my account →"}</Link></div>}
    <Pagination page={data.page} pages={data.pages} base="/prizes" /></>;
}
export default function PrizesPage(props: PageProps<"/prizes">) {
  return <><SiteHeader /><main id="main-content" className="auction-page"><Suspense fallback={<p role="status">Loading prizes…</p>}><Content {...props} /></Suspense></main></>;
}
