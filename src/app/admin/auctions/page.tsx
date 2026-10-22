import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { requireAdmin } from "@/modules/accounts/page-guards";
import { listAuctions } from "@/modules/auctions/service";
import { auctionPhase, formatDate, money } from "@/modules/auctions/presentation";
import { Pagination } from "@/modules/auctions/components";
import { pageNumber } from "@/modules/auctions/api";

async function Content({ searchParams }: PageProps<"/admin/auctions">) {
  await requireAdmin();
  const { page } = await searchParams;
  const data = await listAuctions(pageNumber(typeof page === "string" ? page : null), true);
  const now = new Date();
  return <><SiteHeader signedIn /><main id="main-content" className="auction-page"><Link className="text-link" href="/admin">← Administration</Link><div className="desk-heading"><div><p className="eyebrow">Your auction desk</p><h1>Manage <span>possibilities.</span></h1></div><Link className="button" href="/admin/auctions/new">Create prize ↗</Link></div>
    {data.items.length ? <div className="auction-list">{data.items.map(item => <Link href={`/admin/auctions/${item.id}`} key={item.id}><div><span className="auction-status">{auctionPhase(item, now)}</span><h2>{item.title}</h2><p>{formatDate(item.opensAt)} · {money(item.entryFeeMinor)} per bid</p></div><span aria-hidden="true">↗</span></Link>)}</div> : <div className="empty-state"><h2>No prizes here yet.</h2><p>Create a private draft, review the details, then publish it.</p></div>}
    <Pagination page={data.page} pages={data.pages} base="/admin/auctions" /></main></>;
}
export default function AdminAuctionsPage(props: PageProps<"/admin/auctions">) { return <Suspense fallback={<main className="auction-page" role="status">Loading auctions…</main>}><Content {...props} /></Suspense>; }
