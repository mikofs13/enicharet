import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Suspense } from "react";
import { connection } from "next/server";
import { PrizeArt, prizeCategory, prizeKind } from "@/components/prize-art";
import { listAuctions } from "@/modules/auctions/service";
import { PrizeImage } from "@/modules/auctions/components";
import { auctionPhase, money } from "@/modules/auctions/presentation";

async function HomeContent() {
  await connection();
  let collection: Awaited<ReturnType<typeof listAuctions>>["items"] = [];
  let unavailable = false;
  try { collection = (await listAuctions(1)).items; } catch { unavailable = true; }
  const featured = collection.find(prize => prizeKind(prize.title) === "phone") ?? collection[0];
  const related = collection.filter(prize => prize.id !== featured?.id);
  const car = related.find(prize => prizeKind(prize.title) === "car");
  const jewelry = related.find(prize => prizeKind(prize.title) === "jewelry");
  const suggestions = car && jewelry ? [car, jewelry] : related.slice(0, 2);
  return <>
    <section className="studio-hero" aria-labelledby="home-heading">
      <div className="studio-story"><p className="eyebrow">A little possibility. A big prize.</p><h1 id="home-heading">Think small.<br />Dream <span>big.</span></h1><p className="intro-copy">The lowest unique bid gets the first opportunity to pay for the prize. Choose a number that stands alone.</p>
        <div className="studio-actions"><Link className="button" href={featured ? `/prizes/${featured.slug}` : "/prizes"}>{featured ? "Explore the prize" : "Explore prizes"}<span aria-hidden="true">↗</span></Link><Link className="text-link" href="#how-it-works">How it works</Link></div><p className="studio-footnote">One fixed entry fee. Clear rules. Test funds only.</p>
      </div>
      <div className="studio-spotlight">{featured ? <Link className="spotlight-link" href={`/prizes/${featured.slug}`}><PrizeImage title={featured.title} image={featured.images[0]} priority /><div className="spotlight-copy"><div><p className="eyebrow">In the spotlight</p><h2>{featured.title}</h2><p>{money(featured.entryFeeMinor)} entry fee per bid</p></div><span className="category-chip">{prizeCategory(featured.title)}</span></div><div className="spotlight-status"><span>{auctionPhase(featured)}</span><span>View prize <span aria-hidden="true">↗</span></span></div></Link> : <><PrizeArt kind="phone" /><div className="spotlight-copy"><div><p className="eyebrow">A world of possibility</p><h2>Find your next favorite.</h2><p>{unavailable ? "The collection is taking a moment to load." : "Published prizes will appear in the collection."}</p></div></div></>}
      </div>
    </section>
    {suggestions.length > 0 && <section className="home-collection" aria-labelledby="collection-heading"><div className="section-heading"><h2 id="collection-heading">Something worth a look.</h2><Link className="text-link" href="/prizes">The full collection <span aria-hidden="true">↗</span></Link></div><div className="studio-prize-rows">{suggestions.map(prize => <Link className="studio-prize-row" key={prize.id} href={`/prizes/${prize.slug}`}><PrizeImage title={prize.title} image={prize.images[0]} /><div><span className="category-label">{prizeCategory(prize.title)}</span><h3>{prize.title}</h3><p>{money(prize.entryFeeMinor)} per bid · {auctionPhase(prize)}</p></div><span className="row-arrow" aria-hidden="true">↗</span></Link>)}</div></section>}
    <section className="how-section" id="how-it-works" aria-labelledby="how-heading"><div className="section-heading"><div><p className="eyebrow">A number that stands alone</p><h2 id="how-heading">Small steps. Big possibilities.</h2></div><Link className="text-link" href="/register">Create your account <span aria-hidden="true">↗</span></Link></div><ol className="how-it-works"><li><span>01</span><h3>Find your prize.</h3><p>Browse the collection and check the entry fee, dates, and rules.</p></li><li><span>02</span><h3>Choose your number.</h3><p>Pay the fixed fee for each accepted bid. Matching amounts are excluded.</p></li><li><span>03</span><h3>Stand alone.</h3><p>The lowest unique bidder gets the first offer. Only the winner pays their bid amount, before the deadline.</p></li></ol></section>
    <div className="test-environment-note"><span className="test-pill">Test-money experience</span><p>Explore bidding, wallet activity, and winner offers with test funds. Real deposits, withdrawals, and prize handovers are not enabled.</p></div>
  </>;
}
export default function Home() {
  return <><SiteHeader /><main id="main-content" className="home-page"><Suspense fallback={<div className="home-loading" role="status"><p className="eyebrow">The next possibility</p><h1>Think small.<br />Dream <span>big.</span></h1><p className="intro-copy">Loading the prize collection…</p></div>}><HomeContent /></Suspense></main></>;
}
