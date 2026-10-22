import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { requireAdmin } from "@/modules/accounts/page-guards";
import { getAdminAuction } from "@/modules/auctions/service";
import { DraftEditor } from "@/modules/auctions/admin-form";
import { auctionPhase, money, formatDate } from "@/modules/auctions/presentation";

async function Content({ params }: PageProps<"/admin/auctions/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const auction = await getAdminAuction(id);
  if (!auction) notFound();
  return <><SiteHeader signedIn /><main id="main-content" className="auction-page narrow"><Link className="text-link" href="/admin/auctions">← Auction desk</Link><div className="page-heading"><p className="eyebrow">{auctionPhase(auction)}</p><h1>{auction.title}</h1></div>
    {auction.status === "DRAFT" ? <DraftEditor key={auction.updatedAt.toISOString()} auction={{ ...auction, opensAt: auction.opensAt.toISOString(), closesAt: auction.closesAt.toISOString(), updatedAt: auction.updatedAt.toISOString() }} /> : <><p className="intro-copy">Published details are locked.</p><dl className="account-details"><div><dt>Fee per bid</dt><dd>{money(auction.entryFeeMinor)}</dd></div><div><dt>Opens (EAT)</dt><dd>{formatDate(auction.opensAt)}</dd></div><div><dt>Closes (EAT)</dt><dd>{formatDate(auction.closesAt)}</dd></div></dl><Link className="button" href={`/prizes/${auction.slug}`}>View public prize ↗</Link></>}
  </main></>;
}
export default function EditAuctionPage(props: PageProps<"/admin/auctions/[id]">) { return <Suspense fallback={<main className="auction-page" role="status">Loading prize…</main>}><Content {...props} /></Suspense>; }
