import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/modules/accounts/page-guards";
import { getWalletSnapshot } from "@/modules/wallet/service";
import { formatWalletMoney } from "@/modules/wallet/money";
import { formatDate } from "@/modules/auctions/presentation";

export const metadata = { title: "My test wallet | Enicharet" };

async function WalletContent({ searchParams }: PageProps<"/wallet">) {
  const user = await requireUser();
  const { before } = await searchParams;
  const cursor = typeof before === "string" && before.length <= 128 ? before : undefined;
  let snapshot;
  try { snapshot = await getWalletSnapshot(user.id, cursor); }
  catch { return <><SiteHeader signedIn /><main id="main-content" className="account-page"><h1>History unavailable.</h1><p>We could not load this page of transactions.</p><Link className="button" href="/wallet">Return to your wallet</Link></main></>; }
  const { wallet, history } = snapshot;
  return <><SiteHeader signedIn /><main id="main-content" className="account-page wallet-page">
    <Link className="text-link" href="/account">← My account</Link>
    <p className="eyebrow wallet-eyebrow">Development wallet · test money</p><h1>Your wallet.</h1>
    <div className="notice"><strong>Test funds only</strong><p>This balance has no cash value. Open prizes accept test-money bids. Real deposits and withdrawals are not available yet.</p></div>
    <dl className="account-details"><div><dt>Available test balance</dt><dd className="wallet-balance">{formatWalletMoney(wallet.balanceMinor)}</dd></div><div><dt>Currency</dt><dd>Ethiopian birr (ETB)</dd></div></dl>
    <section aria-labelledby="history-heading"><div className="wallet-history-heading"><h2 id="history-heading">Transaction history</h2><Link className="text-link" href="/wallet">Refresh →</Link></div>
      {history.items.length ? <ol className="wallet-history">{history.items.map(item => <li key={item.id}><div><h3>{item.description}</h3><p>{item.kind === "REVERSAL" ? "Reversal" : item.kind === "TEST_CREDIT" ? "Test credit" : item.kind === "BID_FEE" ? "Bid entry fee" : "Test debit"} · <time dateTime={item.createdAt}>{formatDate(item.createdAt)} EAT</time></p><small>Reference: {item.id}</small></div><span className="wallet-amount">{BigInt(item.amountMinor) > 0n ? "+" : ""}{formatWalletMoney(item.amountMinor)}</span></li>)}</ol> : <div className="empty-state"><h3>{cursor ? "No older transactions." : "Your history starts here."}</h3><p>{cursor ? "Return to the latest page to see recent activity." : "No test funds have moved yet. Credits and debits will appear here with a date and reference."}</p></div>}
      <nav className="pagination" aria-label="Wallet transaction pages">{cursor && <Link className="text-link" href="/wallet">Latest transactions</Link>}{history.nextCursor && <Link className="text-link" href={`/wallet?before=${encodeURIComponent(history.nextCursor)}`}>Older transactions →</Link>}</nav>
    </section><p className="field-hint">Test funds are added through local development tooling. Enicharet will never ask for your bank password here.</p>
  </main></>;
}

export default function WalletPage(props: PageProps<"/wallet">) { return <Suspense fallback={<main id="main-content" className="account-page" role="status">Loading your test wallet…</main>}><WalletContent {...props} /></Suspense>; }
