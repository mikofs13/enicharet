import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getPublicAuction } from "@/modules/auctions/service";
import { auctionPhase, formatDate, money } from "@/modules/auctions/presentation";
import { PrizeImage } from "@/modules/auctions/components";
import { requireUser } from "@/modules/accounts/page-guards";
import { getWallet } from "@/modules/wallet/service";
import { BidForm } from "@/modules/bidding/bid-form";
import { publicAuctionResult } from "@/modules/settlement/service";

export const metadata = { title: "Prize details | Enicharet" };
async function Content({ params }: PageProps<"/prizes/[slug]">) {
  await connection();
  const user = await requireUser();
  const { slug } = await params;
  const auction = await getPublicAuction(slug);
  if (!auction) notFound();
  const canBid = ["SCHEDULED", "OPEN"].includes(auction.status) && new Date() >= auction.opensAt && new Date() < auction.closesAt;
  const wallet = user?.status === "ACTIVE" ? await getWallet(user.id) : null;
  const result = await publicAuctionResult(auction.id);
  return <><SiteHeader signedIn={!!wallet} /><main id="main-content" className="auction-page"><Link className="text-link" href="/">← All prizes</Link><div className="prize-detail"><PrizeImage title={auction.title} image={auction.images[0]} priority /><section><p className="eyebrow">{auctionPhase(auction)}</p><h1>{auction.title}</h1><p className="prize-description">{auction.description}</p>
    <dl className="account-details"><div><dt>Fee per bid</dt><dd>{money(auction.entryFeeMinor)}</dd></div><div><dt>Bids per person</dt><dd>{auction.maxBidsPerUser ?? "Unlimited"}</dd></div><div><dt>Opens (EAT)</dt><dd>{formatDate(auction.opensAt)}</dd></div><div><dt>Closes (EAT)</dt><dd>{formatDate(auction.closesAt)}</dd></div><div><dt>Winner payment window</dt><dd>{auction.paymentWindowSeconds / 3600} hours</dd></div></dl>
    {result ? <div className="notice"><strong>Test winner confirmed</strong><p>The winning amount of {money(result.winningAmountMinor)} was paid with test funds. This is not a real-money prize award.</p></div> : canBid && wallet ? <BidForm slug={auction.slug} feeMinor={auction.entryFeeMinor} balanceMinor={wallet.balanceMinor} /> : <div className="notice"><strong>{canBid ? "Sign in to bid with test funds." : auction.status === "REFUNDED" ? "No eligible winner remained. Entry fees were refunded to test wallets." : "This prize is not accepting bids right now."}</strong><p>Test funds have no cash value. Check <Link className="text-link" href="/offers">My offers</Link> after closing. Real prize payments are not enabled.</p>{canBid && <Link className="text-link" href={user?.status === "SUSPENDED" ? "/account-suspended" : "/login"}>Continue →</Link>}</div>}
    <p className="field-hint">Every bid has a fixed fee. Only the winner pays their bid amount. Matching amounts are excluded; the lowest unique bid receives the first offer. A winner who misses the deadline is excluded from further offers for this prize.</p>
  </section></div></main></>;
}
export default function PrizePage(props: PageProps<"/prizes/[slug]">) {
  return <Suspense fallback={<main id="main-content" className="auction-page" role="status">Loading prize…</main>}><Content {...props} /></Suspense>;
}

