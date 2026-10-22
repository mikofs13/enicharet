import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { requireAdmin } from "@/modules/accounts/page-guards";
import { AuctionForm } from "@/modules/auctions/admin-form";

async function Content() {
  await requireAdmin();
  return <><SiteHeader signedIn /><main id="main-content" className="auction-page narrow"><Link className="text-link" href="/admin/auctions">← Auction desk</Link><div className="page-heading"><p className="eyebrow">New prize</p><h1>Start a <span>possibility.</span></h1><p className="intro-copy">Set the prize, entry rules, and schedule. All dates below use Ethiopian time.</p></div><AuctionForm /></main></>;
}
export default function NewAuctionPage() { return <Suspense fallback={<main className="auction-page" role="status">Loading editor…</main>}><Content /></Suspense>; }
