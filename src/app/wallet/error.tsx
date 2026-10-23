"use client";

export default function WalletErrorPage({ reset }: { reset: () => void }) {
  return <main id="main-content" className="account-page"><p className="eyebrow">Test wallet</p><h1>Wallet unavailable.</h1><p className="intro-copy">We could not load your balance. Try again in a moment.</p><button className="button" onClick={reset}>Try again</button></main>;
}
