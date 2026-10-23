import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateAuction } from "../src/modules/auctions/validation";

loadEnvConfig(process.cwd());

// Stable slugs make reruns safe: existing records are never overwritten,
// republished, or rescheduled. This is explicit catalog setup, not app startup.
const collection = [
  { slug: "iphone-16-pro-first-collection", title: "Apple iPhone 16 Pro", fee: "25.00", limit: "10", hours: "24",
    description: "A smartphone prize featuring the Apple iPhone 16 Pro. Choose your amount and aim for the lowest unique bid.\n\nThe exact storage capacity, finish, condition, included accessories, warranty, and collection or delivery arrangements must be confirmed by Enicharet before bidding is enabled. No device inventory or delivery promise has been verified for this listing." },
  { slug: "galaxy-s24-ultra-first-collection", title: "Samsung Galaxy S24 Ultra", fee: "25.00", limit: "10", hours: "24",
    description: "A Samsung Galaxy S24 Ultra smartphone prize for the Enicharet collection. Every accepted bid will carry the listed fixed entry fee; only the eligible winner pays their submitted amount.\n\nStorage, color, condition, accessories, warranty, and fulfillment details remain to be confirmed before bidding is enabled. This listing does not certify available device inventory." },
  { slug: "toyota-corolla-first-collection", title: "Toyota Corolla", fee: "250.00", limit: "5", hours: "72",
    description: "A Toyota Corolla car prize in the Enicharet collection. The lowest unique bidder will receive the first payment opportunity under the auction rules.\n\nThe model year, trim, condition, mileage, ownership documents, registration, transfer costs, and handover location have not yet been confirmed. Enicharet must finalize these details and verify the vehicle before bidding is enabled. No vehicle ownership or availability is represented by this catalog entry." },
  { slug: "necklace-bracelet-set-first-collection", title: "Necklace & Bracelet Set", fee: "50.00", limit: "10", hours: "48",
    description: "A coordinated necklace and bracelet set selected for the Enicharet jewelry collection. A fixed entry fee applies to each accepted bid, with the winning bid amount payable only by the eligible winner.\n\nThe exact design, material, purity, weight, sizing, condition, authenticity documentation, and delivery arrangements remain to be confirmed before bidding is enabled. No precious-metal or gemstone value is claimed." },
  { slug: "macbook-air-first-collection", title: "Apple MacBook Air", fee: "50.00", limit: "10", hours: "24",
    description: "An Apple MacBook Air laptop prize, selected as the fifth item in the first Enicharet collection. Find an amount that stands alone for a chance to receive the winning offer.\n\nThe model year, chip, screen size, memory, storage, condition, accessories, warranty, and fulfillment arrangements must be confirmed before bidding is enabled. Available inventory has not been verified." },
];

async function main() {
  const preview = process.argv.includes("--preview");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Database configuration is missing.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1, connectionTimeoutMillis: 15000 }) });
  try {
    const opensAt = new Date(Date.now() + 24 * 3600000);
    opensAt.setUTCMinutes(0, 0, 0);
    const closesAt = new Date(opensAt.getTime() + 7 * 86400000);
    const prepared = collection.map(item => {
      const { imageUrl: _url, imageAlt: _alt, ...details } = validateAuction({
        title: item.title, description: item.description, entryFee: item.fee,
        maxBidsPerUser: item.limit, paymentWindowHours: item.hours,
        opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(),
      });
      void _url; void _alt;
      return { ...details, slug: item.slug, status: "SCHEDULED" as const };
    });
    const existing = await db.auction.findMany({ select: { slug: true, title: true, status: true } });
    console.log(`Existing auctions: ${existing.length}. Catalog entries: ${prepared.length}.`);
    for (const row of prepared) console.log(`${existing.some(item => item.slug === row.slug) ? "KEEP" : "CREATE"}: ${row.title}`);
    if (preview) { console.log("Preview only; no database changes."); return; }
    await db.$transaction(async tx => {
      for (const data of prepared) await tx.auction.upsert({ where: { slug: data.slug }, create: data, update: {} });
    }, { timeout: 30000 });
    const saved = await db.auction.findMany({ where: { slug: { in: collection.map(item => item.slug) } }, select: { slug: true, title: true, status: true, entryFeeMinor: true, opensAt: true, closesAt: true } });
    assert.equal(saved.length, collection.length, "Every catalog entry must exist.");
    for (const item of saved) {
      assert.ok(item.closesAt > item.opensAt);
      assert.ok(item.entryFeeMinor > 0);
      console.log(`${item.status}: ${item.title} | ${item.entryFeeMinor / 100} birr/bid | ${item.opensAt.toISOString()} → ${item.closesAt.toISOString()} | /prizes/${item.slug}`);
    }
    console.log("Catalog verified. Existing entries were preserved. Bidding and payments remain unavailable.");
  } finally { await db.$disconnect(); }
}

main().catch(() => {
  console.error("Catalog setup failed. Check database connectivity and migrations; private configuration is not printed. Rerunning safely preserves existing listings.");
  process.exitCode = 1;
});
