import Link from "next/link";

export function SiteFooter() {
  return <footer className="site-footer"><Link className="footer-brand" href="/">enicharet<span aria-hidden="true">.</span></Link><span>Small bids. Clear possibilities.</span><nav aria-label="Footer navigation"><Link href="/">Explore prizes</Link><Link href="/#how-it-works">How it works</Link></nav><small>Test money only. Real payments and prize handovers are not enabled.</small></footer>;
}

