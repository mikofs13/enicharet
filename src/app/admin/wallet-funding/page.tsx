import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AdminFundingForm } from "@/components/admin-funding-form";
import { requireAdmin } from "@/modules/accounts/page-guards";
import { adminFundingEnabled } from "@/modules/wallet/admin-funding-validation";
import { getPrisma } from "@/lib/prisma";
import { formatWalletMoney } from "@/modules/wallet/money";
import { formatDate } from "@/modules/auctions/presentation";

export const metadata = { title: "Admin test funding | Enicharet" };

async function FundingContent() {
  const actor = await requireAdmin();
  const enabled = adminFundingEnabled();
  const credits = enabled ? await getPrisma().adminWalletCredit.findMany({ where: { actorId: actor.id }, include: { transfer: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 }) : [];
  return <><SiteHeader signedIn /><main id="main-content" className="account-page">
    <Link href="/admin" className="text-link">← Administration</Link>
    <p className="eyebrow wallet-eyebrow">Temporary tool · test money</p><h1>Add test funds.</h1>
    <div className="notice"><strong>Test balances only</strong><p>Credits are saved to the database and can be used for test bids and winner payments. They have no cash value.</p></div>
    {enabled ? <><AdminFundingForm /><section className="funding-history" aria-labelledby="funding-history-title"><h2 id="funding-history-title">Your recent credits</h2>
      {credits.length ? <ol className="wallet-history">{credits.map(credit => <li key={credit.id}><div><h3>{credit.reason}</h3><p>{credit.recipientId === actor.id ? "My wallet" : `Account ${credit.recipientId}`} · <time dateTime={credit.createdAt.toISOString()}>{formatDate(credit.createdAt)} EAT</time></p><small>Reference: {credit.transferId}</small></div><span className="wallet-amount">+{formatWalletMoney(credit.transfer.amountMinor)}</span></li>)}</ol> : <div className="empty-state"><p>No admin credits yet. Your saved credits will appear here.</p></div>}
    </section></> : <p className="intro-copy">This temporary funding tool is disabled. Enable ADMIN_TEST_FUNDING_ENABLED in your local development environment and restart the server.</p>}
  </main></>;
}

export default function FundingPage() { return <Suspense fallback={<main className="account-page" role="status">Loading admin funding…</main>}><FundingContent /></Suspense>; }
