"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { LogoutButton } from "@/modules/accounts/logout-button";
import { ThemeControl } from "./theme-control";

export function SiteNavigation({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname(); const navId = useId(); const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`) ? "page" as const : undefined;
  return <header className="site-header">
    <Link className="wordmark" href="/" aria-label="Enicharet home">enicharet<span className="brand-dot" aria-hidden="true" /></Link>
    <div className="header-navigation">
      <button className="menu-toggle" ref={toggle} aria-expanded={open} aria-controls={navId} onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}<span aria-hidden="true">{open ? "−" : "+"}</span></button>
      <nav id={navId} className={open ? "main-nav is-open" : "main-nav"} aria-label="Main navigation" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); } }} onClick={event => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}>
        <Link href="/" aria-current={pathname === "/" || pathname.startsWith("/prizes/") ? "page" : undefined}>Prizes</Link>
        {signedIn ? <><Link href="/bids" aria-current={current("/bids")}>My bids</Link><Link href="/offers" aria-current={current("/offers")}>Offers</Link><Link href="/wallet" aria-current={current("/wallet")}>Wallet</Link><Link href="/notifications" aria-current={current("/notifications")}>Updates</Link><Link href="/account" aria-current={current("/account")}>My account</Link><LogoutButton /></> : <><Link href="/login" aria-current={current("/login")}>Log in</Link><Link className="button button-small" href="/register">Get started <span aria-hidden="true">↗</span></Link></>}
      </nav>
    </div><ThemeControl />
  </header>;
}

