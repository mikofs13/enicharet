import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { requireAdmin } from "@/modules/accounts/page-guards";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Administration | Enicharet" };

async function AdminContent() {
  await requireAdmin();
  const [users, auctions] = await Promise.all([getPrisma().user.count(), getPrisma().auction.count()]);
  return <><SiteHeader signedIn /><main id="main-content" className="account-page">
    <p className="eyebrow">Administration</p><h1>Behind the <span>possibilities.</span></h1>
    <p className="intro-copy">An overview of your Enicharet platform.</p>
    <dl className="account-details"><div><dt>Registered users</dt><dd>{users}</dd></div><div><dt>Auctions</dt><dd>{auctions}</dd></div></dl>
    <section className="next-section"><h2>Your auction desk.</h2><p>Create prize drafts, set entry rules, and publish a schedule.</p><Link className="button" href="/admin/auctions">Manage auctions ↗</Link></section>
    <Link className="text-link" href="/account">Return to my account →</Link>
  </main></>;
}

export default function AdminPage() {
  return <Suspense fallback={<main className="account-page" role="status">Loading administration…</main>}><AdminContent /></Suspense>;
}
