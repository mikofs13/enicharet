import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/modules/accounts/page-guards";

export const metadata: Metadata = { title: "My account | Enicharet" };

async function AccountContent() {
  const user = await requireUser();
  return <>
    <SiteHeader signedIn />
    <main id="main-content" className="account-page">
      <p className="eyebrow">My account</p>
      <h1>Welcome, <span>{user.name ?? "bidder"}.</span></h1>
      <p className="intro-copy">Your account is ready. This is where your Enicharet journey begins.</p>
      <dl className="account-details">
        <div><dt>Phone number</dt><dd>{user.phoneNumber}</dd></div>
        <div><dt>Account type</dt><dd>{user.role === "ADMIN" ? "Administrator" : "Member"}</dd></div>
        <div><dt>Status</dt><dd><span className="status-dot" />Active</dd></div>
      </dl>
      <section className="next-section"><p className="eyebrow">Test wallet</p><h2>See your balance and history.</h2><p>Use test funds to bid on open prizes. Real deposits and withdrawals are coming later.</p><Link className="button" href="/wallet">Open test wallet ↗</Link> <Link className="text-link" href="/bids">My bids →</Link></section>
      <section className="next-section"><h2>A place for your possibilities.</h2><p>Browse published prizes and review their entry rules.</p><Link className="text-link" href="/prizes">Browse prizes →</Link></section>
      {user.role === "ADMIN" && <Link className="button" href="/admin">Open administration <span aria-hidden="true">↗</span></Link>}
    </main>
  </>;
}

export default function AccountPage() {
  return <Suspense fallback={<main className="account-page" role="status">Loading your account…</main>}><AccountContent /></Suspense>;
}
