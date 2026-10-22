import { SiteHeader } from "./site-header";
import { AuthForm } from "@/modules/accounts/auth-form";

export function AuthScreen({ mode }: { mode: "login" | "register" }) {
  const registering = mode === "register";
  return <>
    <SiteHeader />
    <main id="main-content" className="auth-layout">
      <section className="auth-intro" aria-label="Welcome to Enicharet">
        <p className="eyebrow">A little strategy. A little luck.</p>
        <h1>{registering ? <>Small bids.<br /><span>Big possibilities.</span></> : <>Your next<br /><span>possibility awaits.</span></>}</h1>
        <p className="intro-copy">Find a prize. Choose your number. The lowest unique bid gets the chance to win.</p>
        <p className="intro-note">A fixed fee applies to each bid. Only the winner pays their bid amount.</p>
        <div className="intro-bottom"><span className="small-mark" aria-hidden="true">e.</span><span>Every number has a possibility.</span></div>
      </section>
      <section className="auth-panel" aria-labelledby="form-title">
        <p className="eyebrow">{registering ? "Start here" : "Welcome back"}</p>
        <h2 id="form-title">Your number. Your account.</h2>
        <p className="panel-copy">Enter your phone number. We’ll send a code to verify it and log you in. New here? Your account is created after verification.</p>
        <AuthForm />
      </section>
    </main>
    <footer className="site-footer">Enicharet <span>Lowest unique bid auctions</span></footer>
  </>;
}
