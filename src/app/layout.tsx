import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./accounts.css";
import "./auctions.css";
import "./wallet.css";
import "./notifications.css";
import "./studio.css";
import { themeInitScript } from "@/lib/theme";
import { SiteFooter } from "@/components/site-footer";
import { RouteMotion } from "@/components/route-motion";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Enicharet",
  description: "Lowest unique bid prize auctions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body className="min-h-full flex flex-col"><Suspense fallback={null}><RouteMotion /></Suspense><a className="skip-link" href="#main-content">Skip to content</a>{children}<SiteFooter /></body>
    </html>
  );
}
