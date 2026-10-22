import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function AccessDeniedPage() {
  return <><SiteHeader /><main id="main-content" className="account-page"><p className="eyebrow">Access restricted</p><h1>This space is for <span>administrators.</span></h1><p className="intro-copy">Your account does not have permission to open this page.</p><Link className="button" href="/account">Back to my account</Link></main></>;
}
