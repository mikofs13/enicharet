import Link from "next/link";
import { LogoutButton } from "@/modules/accounts/logout-button";

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="Enicharet home">enicharet<span aria-hidden="true">.</span></Link>
      <nav aria-label="Main navigation">
        <Link href="/prizes">Prizes</Link>
        {signedIn ? <><Link href="/bids">My bids</Link><Link href="/wallet">Wallet</Link><Link href="/account">My account</Link><LogoutButton /></> :
          <><Link href="/login">Log in</Link><Link className="button button-small" href="/register">Create account</Link></>}
      </nav>
    </header>
  );
}
