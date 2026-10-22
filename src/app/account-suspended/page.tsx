import { SiteHeader } from "@/components/site-header";

export default function SuspendedPage() {
  return <><SiteHeader signedIn /><main id="main-content" className="account-page"><p className="eyebrow">Account access</p><h1>Your account is <span>suspended.</span></h1><p className="intro-copy">You cannot access member features right now. Please contact the Enicharet team for help.</p></main></>;
}
