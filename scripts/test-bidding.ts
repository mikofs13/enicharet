import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { developmentOtpPath } from "../src/modules/accounts/otp-inbox";

loadEnvConfig(process.cwd());
Object.assign(process.env, { NODE_ENV: "development", AUTH_SMS_MODE: "development" });
delete process.env.CI; delete process.env.VERCEL;

async function main() {
  const schema = `bidding_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^bidding_test_[a-f0-9]{32}$/);
  const configured = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert.ok(configured, "Database configuration required.");
  const url = new URL(configured);
  if (!process.env.DIRECT_URL && url.hostname.endsWith(".neon.tech")) url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  const control = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000 });
  let db: PrismaClient | undefined; let created = false;
  const phones = ["+12025550172", "+12025550173"];
  try {
    await control.connect(); await control.query(`CREATE SCHEMA "${schema}"`); created = true;
    await control.query(`SET search_path TO "${schema}"`);
    for (const name of (await readdir("prisma/migrations")).filter(name => /^\d/.test(name)).sort()) await control.query((await readFile(`prisma/migrations/${name}/migration.sql`, "utf8")).replace('CREATE SCHEMA IF NOT EXISTS "public";', ""));
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), options: `-c search_path=${schema}`, max: 5 }, { schema }) });
    Object.assign(globalThis, { prisma: db });
    const { auth } = await import("../src/modules/accounts/auth");
    const { postTestMovement, getWallet } = await import("../src/modules/wallet/service");
    const { placeBid, myBids } = await import("../src/modules/bidding/service");
    const { POST } = await import("../src/app/api/v1/auctions/[slug]/bids/route");
    const { GET } = await import("../src/app/api/v1/bids/route");
    const { GET: publicPrize } = await import("../src/app/api/v1/auctions/[slug]/route");
    const { limitBidRequests } = await import("../src/modules/bidding/api");
    const base = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
    const users: { id: string; cookie: string }[] = [];
    for (const [index, phoneNumber] of phones.entries()) {
      const send = (path: string, body: unknown) => auth.handler(new Request(`${base}/api/auth/${path}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json", "X-Forwarded-For": `198.18.244.${index + 1}` }, body: JSON.stringify(body) }));
      assert.equal((await send("phone-number/send-otp", { phoneNumber })).status, 200);
      const { code } = JSON.parse(await readFile(developmentOtpPath(phoneNumber), "utf8"));
      const verified = await send("phone-number/verify", { phoneNumber, code }); assert.equal(verified.status, 200);
      users.push({ id: (await verified.json()).user.id, cookie: verified.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
    }
    const [first, second] = users;
    for (const user of users) await postTestMovement({ userId: user.id, amountMinor: 10000n, reference: "initial-test-credit", direction: "credit", description: "Bidding fixture funds" });
    const makePrize = (slug: string, changes = {}) => db!.auction.create({ data: { slug, title: "Test prize", description: "Temporary bidding integration fixture.", status: "SCHEDULED", entryFeeMinor: 2500, maxBidsPerUser: 2, paymentWindowSeconds: 86400, opensAt: new Date(Date.now() - 60000), closesAt: new Date(Date.now() + 86400000), ...changes } });
    const prize = await makePrize("open-test-prize");
    const context = { params: Promise.resolve({ slug: prize.slug }) };
    const request = (cookie = first.cookie, body: unknown = { amount: "1.25", reference: "bid-first-001" }, origin = base) => new Request(`${base}/api/v1/auctions/${prize.slug}/bids`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await POST(request(""), context)).status, 401);
    assert.equal((await GET(new Request(`${base}/api/v1/bids`))).status, 401);
    assert.equal((await POST(request(first.cookie, {}, "https://untrusted.example"), context)).status, 403);
    assert.equal((await POST(request(first.cookie, { amount: "1.00", reference: "tamper-ref-001", userId: second.id }), context)).status, 400);
    assert.equal((await POST(request(first.cookie, { amount: "0.99", reference: "small-ref-001" }), context)).status, 400);
    const large = new Request(`${base}/api/v1/auctions/${prize.slug}/bids`, { method: "POST", headers: { Cookie: first.cookie, Origin: base, "Content-Type": "application/json" }, body: "x".repeat(4097) });
    assert.equal((await POST(large, context)).status, 413);
    const accepted = await POST(request(), context); assert.equal(accepted.status, 201); const saved = await accepted.json();
    assert.equal(saved.bid.amountMinor, 125); assert.equal(saved.bid.entryFeeMinor, 2500);
    assert.equal((await getWallet(first.id)).balanceMinor, "7500", "Charge the fee only, not the bid amount.");
    const replay = await POST(request(), context); assert.equal(replay.status, 200); assert.equal((await replay.json()).bid.id, saved.bid.id);
    assert.equal((await POST(request(first.cookie, { amount: "1.26", reference: "bid-first-001" }), context)).status, 409);
    assert.equal((await POST(request(first.cookie, { amount: "1.25", reference: "duplicate-amount" }), context)).status, 409);
    const simultaneous = await Promise.all(["remaining-limit-001", "remaining-limit-002"].map(reference => placeBid(first.id, prize.id, { amount: reference.endsWith("1") ? "2.00" : "3.00", reference }).then(() => "ok").catch(error => error.code)));
    assert.deepEqual(simultaneous.sort(), ["BID_LIMIT_REACHED", "ok"].sort());
    assert.equal((await getWallet(first.id)).balanceMinor, "5000");
    // Another user's equal amount is allowed; no uniqueness feedback is exposed.
    assert.equal((await POST(request(second.cookie, { amount: "1.25", reference: "second-user-bid" }), context)).status, 201);
    const otherRow = (await myBids(second.id)).items[0];
    const owned = await GET(new Request(`${base}/api/v1/bids?userId=${second.id}`, { headers: { Cookie: first.cookie } }));
    const history = await owned.json(); assert.equal(history.items.length, 2); assert.ok(!history.items.some((row: { id: string }) => row.id === otherRow.id));
    assert.equal(owned.headers.get("cache-control"), "private, no-store");
    assert.equal((await GET(new Request(`${base}/api/v1/bids?before=${otherRow.id}`, { headers: { Cookie: first.cookie } }))).status, 400);
    const visible = await (await publicPrize(new Request(`${base}/api/v1/auctions/${prize.slug}`), context)).json();
    assert.equal(visible.auction.bids, undefined); assert.equal(visible.auction.uniqueAmounts, undefined);
    for (const status of ["DRAFT", "CANCELLED", "CLOSING"] as const) {
      const unavailable = await makePrize(`state-${status}`, { status });
      await assert.rejects(placeBid(first.id, unavailable.id, { amount: "1.00", reference: `state-ref-${status}` }));
    }
    for (const [name, dates] of Object.entries({ upcoming: { opensAt: new Date(Date.now() + 60000) }, closed: { opensAt: new Date(Date.now() - 120000), closesAt: new Date(Date.now() - 60000) } })) {
      const unavailable = await makePrize(name, dates);
      await assert.rejects(placeBid(first.id, unavailable.id, { amount: "1.00", reference: `window-ref-${name}` }), { code: "AUCTION_NOT_OPEN" });
    }
    const expensive = await makePrize("expensive", { entryFeeMinor: 6000 });
    await assert.rejects(placeBid(first.id, expensive.id, { amount: "50000.00", reference: "insufficient-001" }), { code: "INSUFFICIENT_FUNDS" });
    assert.equal((await getWallet(first.id)).balanceMinor, "5000");
    const concurrentPrize = await makePrize("concurrent", { entryFeeMinor: 4000, maxBidsPerUser: null });
    const spends = await Promise.allSettled(["spend-again-001", "spend-again-002"].map(reference => placeBid(first.id, concurrentPrize.id, { amount: reference.endsWith("1") ? "100.00" : "200.00", reference })));
    assert.equal(spends.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await getWallet(first.id)).balanceMinor, "1000");
    const retryPrize = await makePrize("retry-prize", { entryFeeMinor: 100, maxBidsPerUser: null });
    const retries = await Promise.all(Array.from({ length: 3 }, () => placeBid(first.id, retryPrize.id, { amount: "10.00", reference: "race-retry-001" })));
    assert.equal(retries.filter(row => !row.replayed).length, 1);
    const late = await makePrize("closing-race", { closesAt: new Date(Date.now() + 10000) });
    const feeAccount = (await db.walletAccount.findUnique({ where: { userId: second.id } }))!;
    const clearing = (await db.walletAccount.findUnique({ where: { key: "system:test-clearing" } }))!;
    const feeCount = await db.walletTransfer.count({ where: { kind: "BID_FEE" } });
    const beforeRollback = (await getWallet(second.id)).balanceMinor;
    await assert.rejects(db.$transaction(async tx => {
      const destination = await tx.walletAccount.findUniqueOrThrow({ where: { key: `system:test-fees:${prize.id}` } });
      const fee = await tx.walletTransfer.create({ data: { kind: "BID_FEE", amountMinor: 2500n, operationKey: "duplicate-rollback-fee", description: "Fee must roll back", sourceId: feeAccount.id, destinationId: destination.id } });
      await tx.bid.create({ data: { userId: second.id, auctionId: prize.id, amountMinor: 125, entryFeeMinor: 2500, operationKey: "duplicate-rollback-bid", feeTransferId: fee.id } });
    }));
    assert.equal((await getWallet(second.id)).balanceMinor, beforeRollback);
    assert.equal(await db.walletTransfer.count({ where: { operationKey: "duplicate-rollback-fee" } }), 0);
    // No bid can be committed without a BID_FEE, and no BID_FEE can be orphaned.
    const fees = await db.walletAccount.create({ data: { key: `system:test-fees:${late.id}`, kind: "TEST_FEES" } });
    await assert.rejects(db.walletTransfer.create({ data: { kind: "BID_FEE", amountMinor: 2500n, operationKey: "orphan-fee", description: "Orphan must roll back", sourceId: feeAccount.id, destinationId: fees.id } }));
    assert.equal(await db.walletTransfer.count({ where: { kind: "BID_FEE" } }), feeCount);
    await assert.rejects(db.bid.create({ data: { auctionId: retryPrize.id, userId: second.id, amountMinor: 101, entryFeeMinor: 100, operationKey: "unpaid-bid", feeTransferId: (await db.walletTransfer.findFirst({ where: { sourceId: clearing.id } }))!.id } }));
    await assert.rejects(db.bid.update({ where: { id: saved.bid.id }, data: { amountMinor: 999 } }));
    await assert.rejects(db.bid.delete({ where: { id: saved.bid.id } }));
    // A retry after close still confirms the earlier accepted bid without charging.
    await db.auction.update({ where: { id: prize.id }, data: { closesAt: new Date(Date.now() - 1000) } });
    assert.equal((await POST(request(), context)).status, 200);
    // Pagination includes only the owner, with no overlap across page cursors.
    for (let index = 0; index < 18; index++) await placeBid(second.id, retryPrize.id, { amount: `${index + 100}.00`, reference: `history-bid-${String(index).padStart(3, "0")}` });
    const page1 = await myBids(second.id); assert.equal(page1.items.length, 19);
    await placeBid(second.id, retryPrize.id, { amount: "999.00", reference: "history-bid-final1" });
    await placeBid(second.id, retryPrize.id, { amount: "999.01", reference: "history-bid-final2" });
    const firstPage = await myBids(second.id); assert.equal(firstPage.items.length, 20); assert.ok(firstPage.nextCursor);
    const nextPage = await myBids(second.id, firstPage.nextCursor!); assert.equal(nextPage.items.length, 1);
    assert.equal(new Set([...firstPage.items, ...nextPage.items].map(row => row.id)).size, 21);
    const firstFeeRace = await makePrize("first-fee-account-race", { entryFeeMinor: 100 });
    const firstFees = await Promise.all(users.map(user => placeBid(user.id, firstFeeRace.id, { amount: "1.00", reference: "first-fee-race-001" })));
    assert.equal(firstFees.length, 2);
    assert.equal(await db.walletAccount.count({ where: { key: `system:test-fees:${firstFeeRace.id}` } }), 1);
    await db.user.update({ where: { id: first.id }, data: { status: "SUSPENDED" } });
    assert.equal((await POST(request(), context)).status, 403);
    await assert.rejects(placeBid(first.id, retryPrize.id, { amount: "11.00", reference: "suspended-bid-001" }), { code: "ACCOUNT_UNAVAILABLE" });
    for (let index = 0; index < 30; index++) await limitBidRequests("rate-test-user");
    await assert.rejects(limitBidRequests("rate-test-user"), { code: "TOO_MANY_BIDS" });
    assert.equal(await db.bid.count(), await db.walletTransfer.count({ where: { kind: "BID_FEE" } }));
    assert.equal((await db.walletAccount.aggregate({ _sum: { balanceMinor: true } }))._sum.balanceMinor, 0n);
    console.log("PASS: atomic fee-only bids, retry races, limits, duplicate amounts, sealed ownership, CSRF/body limits, state/time checks, overspending, bid/fee pairing, immutable bids, pagination, suspension, throttling, and balanced ledger.");
  } finally {
    await db?.$disconnect();
    if (created) { assert.match(schema, /^bidding_test_[a-f0-9]{32}$/); await control.query('SET search_path TO "public"'); await control.query(`DROP SCHEMA "${schema}" CASCADE`); }
    await control.end(); for (const phone of phones) await rm(developmentOtpPath(phone), { force: true });
  }
}
main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : "Bidding integration check failed.";
  for (const key of ["DATABASE_URL", "DIRECT_URL", "BETTER_AUTH_SECRET", "SMSETHIOPIA_API_KEY"]) { const value = process.env[key]; if (value) message = message.split(value).join("[redacted]"); }
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted database URL]")); process.exitCode = 1;
});
