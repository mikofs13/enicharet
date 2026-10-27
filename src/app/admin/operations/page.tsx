import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { requireAdmin } from "@/modules/accounts/page-guards";
import { auctionOperations } from "@/modules/settlement/operations";
import { formatDate, money } from "@/modules/auctions/presentation";
import { OperationRetryForm } from "@/modules/settlement/retry-form";

export const metadata = { title: "Auction operations | Enicharet" };
async function Content({ searchParams }: PageProps<"/admin/operations">) {
  await requireAdmin(); const params = await searchParams;
  const view = typeof params.view === "string" ? params.view : "active";
  let data;
  try { data = await auctionOperations(view, typeof params.after === "string" ? params.after : undefined); }
  catch { return <><SiteHeader signedIn /><main id="main-content" className="account-page"><h1>Operations unavailable.</h1><p>We could not load this view.</p><Link className="button" href="/admin/operations">Load current operations</Link></main></>; }
  return <><SiteHeader signedIn /><main id="main-content" className="account-page">
    <Link className="text-link" href="/admin">← Administration</Link><p className="eyebrow wallet-eyebrow">Auction operations · test money</p><h1>Keep auctions moving.</h1>
    <p className="intro-copy">Review processing, winner payment deadlines, refunds, and notification delivery.</p><Link className="text-link" href={`/admin/operations?view=${view}`}>Refresh status →</Link>
    <section className="operations-health" aria-labelledby="health-heading"><h2 id="health-heading">Worker health</h2>
      {data.health.hasAlerts ? <div className="notice health-alerts" role="alert"><strong>Attention needed</strong><ul>{data.health.alerts.map(alert => <li key={alert.code}>{alert.message}{alert.count > 1 ? ` (${alert.count})` : ""}</li>)}</ul></div> : <p className="notice" role="status">Workers polled recently. No overdue work or repeated failures were detected.</p>}
      <p className="field-hint">Checked when this page loads. Refresh for current alerts. Polls become stale after 30 seconds; work is overdue after 60 seconds. These are in-app alerts only.</p>
    </section>
    <dl className="account-details"><div><dt>Active jobs / due now / retrying</dt><dd>{data.counts.active} / {data.counts.due} / {data.counts.failed}</dd></div><div><dt>Offers within their payment window</dt><dd>{data.counts.awaitingPayment}</dd></div><div><dt>Notifications pending / retrying / delivered</dt><dd>{data.counts.notificationPending} / {data.counts.notificationRetrying} / {data.counts.notificationDelivered}</dd></div>
      {(["settlement", "notifications"] as const).map(name => { const worker = data.workers.find(row => row.name === name); return <div key={name}><dt>{name === "settlement" ? "Auction worker" : "Notification worker"} last poll</dt><dd>{worker ? `${formatDate(worker.lastSeenAt)} EAT${Date.parse(data.asOf) - Date.parse(worker.lastSeenAt) > 30000 ? " · No recent poll" : ""}` : "No poll recorded"}</dd></div>; })}
    </dl><p className="field-hint">A recorded poll shows recent activity, not a guarantee that a worker is still running. Times shown in EAT.</p>
    <nav className="operations-filters" aria-label="Auction job views">{["active", "failed", "completed"].map(option => <Link key={option} href={`/admin/operations?view=${option}`} aria-current={view === option ? "page" : undefined}>{option === "active" ? "Active jobs" : option === "failed" ? "Retrying jobs" : "Completed jobs"}</Link>)}</nav>
    {data.jobs.length ? <ol className="operations-list">{data.jobs.map(job => <li key={job.auctionId}>
      <p className="auction-status">{job.status.replaceAll("_", " ")}</p><h2><Link href={`/admin/auctions/${job.auctionId}`}>{job.title} →</Link></h2>
      <dl className="account-details"><div><dt>{job.completedAt ? "Completed" : "Next processing attempt"}</dt><dd>{formatDate(job.completedAt ?? job.nextRunAt)} EAT</dd></div><div><dt>Failed attempts</dt><dd>{job.attempts}{job.lastError ? ` · ${job.lastError}` : ""}</dd></div><div><dt>Entry fees refunded</dt><dd>{job.refundedBidCount} of {job.bidCount}</dd></div></dl>
      {job.pendingOffers.map(offer => <p key={offer.id}>Pending test payment: <strong>{money(offer.amountMinor)}</strong>. Deadline: <time dateTime={offer.expiresAt}>{formatDate(offer.expiresAt)} EAT</time>{offer.expiresAt <= data.asOf ? ". Deadline passed; awaiting processing." : "."}</p>)}
      {!job.completedAt && job.lastError && job.attempts > 0 && <OperationRetryForm key={`${job.auctionId}:${job.attempts}`} kind="settlement" id={job.auctionId} attempts={job.attempts} canRetry={job.nextRunAt > data.asOf && job.closesAt <= data.asOf && ["SCHEDULED", "OPEN", "CLOSING", "AWAITING_PAYMENT", "REFUNDING"].includes(job.status) && !job.pendingOffers.some(offer => offer.expiresAt > data.asOf)} />}
    </li>)}</ol> : <div className="empty-state"><h2>No jobs in this view.</h2><p>Published auctions appear after the auction worker discovers their schedule.</p></div>}
    <nav className="pagination" aria-label="Auction job pages">{params.after && <Link href={`/admin/operations?view=${view}`}>First page</Link>}{data.nextCursor && <Link href={`/admin/operations?view=${view}&after=${encodeURIComponent(data.nextCursor)}`}>More jobs →</Link>}</nav>
    <section className="funding-history"><h2>Notification delivery retries</h2>{data.deliveryFailures.length ? <ul className="operations-list">{data.deliveryFailures.map(event => <li key={event.id}><h3>{event.auctionTitle}</h3><p>{event.kind.replaceAll("_", " ")} · {event.attempts} failed attempts · {event.lastError}</p><p>Next attempt: {formatDate(event.nextAttemptAt)} EAT</p>{event.attempts > 0 && <OperationRetryForm key={`${event.id}:${event.attempts}`} kind="notification" id={event.id} attempts={event.attempts} canRetry={event.nextAttemptAt > data.asOf} />}</li>)}</ul> : <p>No notification delivery failures are waiting for retry.</p>}<p className="field-hint">Shows the next ten delivery retries. Workers retry automatically with bounded delays. Manual retries change only the next processing time and require a recorded reason.</p></section>
    <section className="funding-history"><h2>Recent admin retry requests</h2>{data.retryAudit.length ? <ol className="operations-list">{data.retryAudit.map(item => <li key={item.id}><h3>{item.kind === "SETTLEMENT" ? "Auction processing retry" : "Notification delivery retry"}</h3><p>{item.reason}</p><p>Requested {formatDate(item.createdAt)} EAT by administrator {item.actorId}. Failed attempt: {item.expectedAttempts}.</p><p>Previous schedule: {formatDate(item.previousRunAt)} EAT. Rescheduled: {formatDate(item.scheduledFor)} EAT.</p><p className="field-hint">Audit: {item.id} · Target: {item.settlementJobId ?? item.notificationEventId}</p></li>)}</ol> : <p>No manual retries have been requested.</p>}<p className="field-hint">Latest 20 requests, retained as immutable database records. A queued retry does not guarantee the underlying problem is fixed.</p></section>
    <p className="field-hint">Snapshot: {formatDate(data.asOf)} EAT. Refresh for current data.</p>
  </main></>;
}
export default function OperationsPage(props: PageProps<"/admin/operations">) { return <Suspense fallback={<main className="account-page" role="status">Loading auction operations…</main>}><Content {...props} /></Suspense>; }
