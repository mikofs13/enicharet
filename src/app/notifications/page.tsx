import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/modules/accounts/page-guards";
import { myNotifications } from "@/modules/notifications/service";
import { ReadNotificationButton } from "@/modules/notifications/read-button";
import { formatDate } from "@/modules/auctions/presentation";

export const metadata = { title: "Notifications | Enicharet" };
async function Content({ searchParams }: PageProps<"/notifications">) {
  const user = await requireUser(); const { before } = await searchParams;
  let data;
  try { data = await myNotifications(user.id, typeof before === "string" && before.length <= 128 ? before : undefined); }
  catch { return <><SiteHeader signedIn /><main id="main-content" className="account-page"><h1>Inbox unavailable.</h1><p>We could not load this page of notifications.</p><Link className="button" href="/notifications">Load latest notifications</Link></main></>; }
  return <><SiteHeader signedIn /><main id="main-content" className="account-page">
    <Link className="text-link" href="/account">← My account</Link><p className="eyebrow wallet-eyebrow">Your auction updates · test money</p><h1>Notifications.</h1>
    <div className="inbox-heading"><p role="status">{data.unreadCount} unread {data.unreadCount === 1 ? "notification" : "notifications"}</p><Link className="text-link" href="/notifications">Refresh inbox →</Link></div>
    {data.items.length ? <ol className="notification-list">{data.items.map(item => <li key={item.id}>
      <p className="notification-meta">{item.readAt ? "Read" : "Unread"} · <time dateTime={item.occurredAt}>{formatDate(item.occurredAt)} EAT</time></p>
      <h2>{!item.readAt && <span className="status-dot" aria-hidden="true" />}{item.title}</h2><p>{item.body}</p>
      <div className="notification-actions"><Link className="text-link" href={item.href}>{item.href === "/wallet" ? "View wallet →" : "View offers →"}</Link>{!item.readAt && <ReadNotificationButton id={item.id} />}</div>
    </li>)}</ol> : <div className="empty-state"><h2>{before ? "No older updates." : "You’re up to date."}</h2><p>Winner offers, payment deadlines, confirmed test wins, and completed refunds will appear here after processing.</p><Link className="text-link" href="/offers">Check my offers →</Link></div>}
    <nav className="pagination" aria-label="Notification pages">{before && <Link href="/notifications">Latest updates</Link>}{data.nextCursor && <Link href={`/notifications?before=${encodeURIComponent(data.nextCursor)}`}>Older updates →</Link>}</nav>
    <p className="field-hint">In-app delivery only. Refresh to check for updates. Offer deadlines apply even if a notification arrives late; check Offers for the current status.</p>
  </main></>;
}
export default function NotificationsPage(props: PageProps<"/notifications">) { return <Suspense fallback={<main className="account-page" role="status">Loading notifications…</main>}><Content {...props} /></Suspense>; }
