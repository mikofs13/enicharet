import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return <>
    <SiteHeader />
    <main id="main-content" className="home-page">
      <p className="eyebrow">The lowest unique bid wins</p>
      <h1>A smaller number.<br /><span>A bigger possibility.</span></h1>
      <p className="intro-copy">Bid on prizes with a number that stands alone. When bidding closes, the lowest amount entered exactly once gets the first chance to claim the prize.</p>
      <div className="home-actions"><Link className="button" href="/register">Create your account <span aria-hidden="true">↗</span></Link><Link className="text-link" href="/login">Already a member? Log in →</Link></div>
      <ol className="how-it-works" aria-label="How bidding works">
        <li><span>01</span><h2>Choose your number.</h2><p>A fixed entry fee applies to each bid.</p></li>
        <li><span>02</span><h2>Stand alone.</h2><p>Matching amounts are excluded. Lowest unique comes first.</p></li>
        <li><span>03</span><h2>Claim your possibility.</h2><p>Only the winner pays their bid amount, within the payment deadline.</p></li>
      </ol>
      <p className="availability-note">Try bidding and winner offers with test funds. Real deposits, withdrawals, and prize handovers are not enabled.</p><Link className="text-link" href="/prizes">Browse prizes →</Link>
    </main>
    <footer className="site-footer">Enicharet <span>A little strategy. A little luck.</span></footer>
  </>;
}
