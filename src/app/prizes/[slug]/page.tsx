import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getPublicAuction } from "@/modules/auctions/service";
import { auctionPhase, formatDate, money } from "@/modules/auctions/presentation";
import { PrizeImage } from "@/modules/auctions/components";

export const metadata = { title: "Prize details | Enicharet" };
async function Content({ params }: PageProps<"/prizes/[slug]">) {
  await connection();
  const { slug } = await params;
  const auction = await getPublicAuction(slug);
  if (!auction) notFound();
  return <><Link className="text-link" href="/prizes">← All prizes</Link><div className="prize-detail"><PrizeImage image={auction.images[0]} /><section><p className="eyebrow">{auctionPhase(auction)}</p><h1>{auction.title}</h1><p className="prize-description">{auction.description}</p>
    <dl className="account-details"><div><dt>Fee per bid</dt><dd>{money(auction.entryFeeMinor)}</dd></div><div><dt>Bids per person</dt><dd>{auction.maxBidsPerUser ?? "Unlimited"}</dd></div><div><dt>Opens (EAT)</dt><dd>{formatDate(auction.opensAt)}</dd></div><div><dt>Closes (EAT)</dt><dd>{formatDate(auction.closesAt)}</dd></div><div><dt>Winner payment window</dt><dd>{auction.paymentWindowSeconds / 3600} hours</dd></div></dl>
    <div className="notice"><strong>Bid submission is coming next.</strong><p>You can browse this prize now. Bidding and wallet payments are not available yet.</p></div>
    <p className="field-hint">Every bid has a fixed fee. Only the winner pays their bid amount. Matching amounts are excluded; the lowest unique bid receives the first offer. A winner who misses the deadline is excluded from further offers for this prize.</p>
  </section></div></>;
}
export default function PrizePage(props: PageProps<"/prizes/[slug]">) {
  return <><SiteHeader /><main id="main-content" className="auction-page"><Suspense fallback={<p role="status">Loading prize…</p>}><Content {...props} /></Suspense></main></>;
}
