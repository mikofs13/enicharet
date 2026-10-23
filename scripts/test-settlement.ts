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
  const schema = `settlement_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^settlement_test_[a-f0-9]{32}$/);
  const configured = process.env.DIRECT_URL ?? process.env.DATABASE_URL; assert.ok(configured);
  const url = new URL(configured);
  if (!process.env.DIRECT_URL && url.hostname.endsWith(".neon.tech")) url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  const control = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000 });
  let db: PrismaClient | undefined; let created = false;
  const phones = ["+12025550174", "+12025550175", "+12025550176"];
  try {
    await control.connect(); await control.query(`CREATE SCHEMA "${schema}"`); created = true; await control.query(`SET search_path TO "${schema}"`);
    for (const name of (await readdir("prisma/migrations")).filter(name => /^\d/.test(name)).sort()) await control.query((await readFile(`prisma/migrations/${name}/migration.sql`, "utf8")).replace('CREATE SCHEMA IF NOT EXISTS "public";', ""));
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), options: `-c search_path=${schema}`, max: 5 }, { schema }) });
    Object.assign(globalThis, { prisma: db });
    const { auth } = await import("../src/modules/accounts/auth");
    const { postTestMovement, getWallet } = await import("../src/modules/wallet/service");
    const { MAX_WALLET_MINOR } = await import("../src/modules/wallet/money");
    const { placeBid } = await import("../src/modules/bidding/service");
    const { runSettlementBatch, payWinnerOffer, myOffers, publicAuctionResult } = await import("../src/modules/settlement/service");
    const { GET } = await import("../src/app/api/v1/offers/route");
    const { POST } = await import("../src/app/api/v1/offers/[id]/pay/route");
    const base = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
    const users: { id: string; cookie: string }[] = [];
    for (const [index, phoneNumber] of phones.entries()) {
      const send = (path: string, body: unknown) => auth.handler(new Request(`${base}/api/auth/${path}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json", "X-Forwarded-For": `198.18.243.${index + 1}` }, body: JSON.stringify(body) }));
      assert.equal((await send("phone-number/send-otp", { phoneNumber })).status, 200);
      const { code } = JSON.parse(await readFile(developmentOtpPath(phoneNumber), "utf8"));
      const verified = await send("phone-number/verify", { phoneNumber, code }); assert.equal(verified.status, 200);
      users.push({ id: (await verified.json()).user.id, cookie: verified.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
    }
    for (const user of users) await postTestMovement({ userId: user.id, amountMinor: 100000n, reference: "initial-test-credit", direction: "credit", description: "Settlement fixture funds" });
    const [a, b, c] = users;
    const makePrize = (slug: string, paymentWindowSeconds = 10) => db!.auction.create({ data: { slug, title: "Settlement test prize", description: "Temporary test-money settlement fixture.", status: "SCHEDULED", entryFeeMinor: 100, maxBidsPerUser: null, paymentWindowSeconds, opensAt: new Date(Date.now() - 60000), closesAt: new Date(Date.now() + 86400000) } });
    const close = async (id: string) => {
      const closesAt = new Date(Date.now() - 1000);
      // Fixture time travel must also move an already-discovered durable job.
      await db!.$transaction([db!.auction.update({ where: { id }, data: { closesAt } }), db!.settlementJob.updateMany({ where: { auctionId: id }, data: { nextRunAt: closesAt } })]);
    };
    async function run(limit = 20) {
      const result = await runSettlementBatch(limit);
      assert.ok(!result.includes("retry-scheduled"), `Unexpected job retry: ${JSON.stringify(await db!.settlementJob.findMany({ where: { lastError: { not: null } }, select: { attempts: true, lastError: true } }))}`);
      return result;
    }
    const prize = await makePrize("original-ranking");
    for (const [user, amount] of [[a, "1.00"], [b, "1.00"], [a, "1.25"], [a, "1.50"], [b, "2.00"], [c, "3.00"]] as const) await placeBid(user.id, prize.id, { amount, reference: `ranking-${amount}` });
    assert.deepEqual(await run(), [], "Future auctions must not close early.");
    await close(prize.id);
    const raced = await Promise.all([run(1), run(1), run(1)]);
    assert.equal(raced.flat().filter(item => item === "offer-created").length, 1);
    const candidates = await db.settlementCandidate.findMany({ where: { auctionId: prize.id }, orderBy: { rank: "asc" }, include: { bid: true } });
    assert.deepEqual(candidates.map(row => row.bid.amountMinor), [125, 150, 200, 300]);
    console.log("PASS: concurrent workers created one original unique-bid snapshot and offer.");
    assert.equal(await db.auctionSettlement.count({ where: { auctionId: prize.id } }), 1);
    const first = (await myOffers(a.id)).items[0]; assert.equal(first.amountMinor, 125);
    assert.equal(await publicAuctionResult(prize.id), null, "Unpaid offers must not reveal a public winner.");
    await assert.rejects(db.auctionSettlement.delete({ where: { auctionId: prize.id } }));
    await assert.rejects(db.settlementCandidate.update({ where: { id: candidates[0].id }, data: { rank: 9 } }));
    await assert.rejects(db.winnerOffer.update({ where: { id: first.id }, data: { state: "EXPIRED" } }));
    const context = { params: Promise.resolve({ id: first.id }) };
    const request = (cookie = a.cookie, body: unknown = {}, origin = base) => new Request(`${base}/api/v1/offers/${first.id}/pay`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await POST(request(""), context)).status, 401);
    assert.equal((await POST(request(b.cookie), context)).status, 404);
    assert.equal((await POST(request(a.cookie, {}, "https://untrusted.example"), context)).status, 403);
    assert.equal((await POST(request(a.cookie, { amount: "0.01" }), context)).status, 400);
    // Wait for the actual database deadline; never rewrite a protected offer.
    await control.query("SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp()))) + 0.05)", [first.expiresAt]);
    assert.equal((await POST(request(), context)).status, 409);
    await run();
    const next = (await myOffers(b.id)).items[0]; assert.equal(next.amountMinor, 200, "Skip all of A's amounts and never promote the duplicated 1.00.");
    const balanceBefore = BigInt((await getWallet(b.id)).balanceMinor);
    const payments = await Promise.all([payWinnerOffer(b.id, next.id), payWinnerOffer(b.id, next.id), payWinnerOffer(b.id, next.id)]);
    assert.equal(payments.filter(row => !row.replayed).length, 1);
    assert.equal(BigInt((await getWallet(b.id)).balanceMinor), balanceBefore - 200n);
    assert.equal((await db.auction.findUniqueOrThrow({ where: { id: prize.id } })).status, "WINNER_CONFIRMED");
    assert.equal((await publicAuctionResult(prize.id))!.winningAmountMinor, 200);
    console.log("PASS: deadline reassignment skips the entire nonpaying user; payment retries charge once.");
    const apiHistory = await GET(new Request(`${base}/api/v1/offers?userId=${b.id}`, { headers: { Cookie: a.cookie } }));
    assert.equal(apiHistory.headers.get("cache-control"), "private, no-store");
    assert.ok(!(await apiHistory.json()).items.some((row: { id: string }) => row.id === next.id));
    assert.equal((await GET(new Request(`${base}/api/v1/offers?before=${next.id}`, { headers: { Cookie: a.cookie } }))).status, 400);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: a.id } })).status, "ACTIVE");
    const otherPrize = await makePrize("other-auction"); await placeBid(a.id, otherPrize.id, { amount: "1.00", reference: "still-allowed-other" });
    const noUnique = await makePrize("no-unique");
    const beforeNoUnique = (await getWallet(c.id)).balanceMinor;
    await placeBid(b.id, noUnique.id, { amount: "1.00", reference: "no-unique-b" });
    await placeBid(c.id, noUnique.id, { amount: "1.00", reference: "no-unique-c" }); await close(noUnique.id); await run();
    assert.equal((await db.auction.findUniqueOrThrow({ where: { id: noUnique.id } })).status, "REFUNDED");
    assert.equal((await getWallet(c.id)).balanceMinor, beforeNoUnique);
    const allFail = await makePrize("all-fail", 1); await placeBid(c.id, allFail.id, { amount: "2.00", reference: "last-candidate" }); await close(allFail.id); await run();
    const last = (await myOffers(c.id)).items[0];
    await control.query("SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp()))) + 0.05)", [last.expiresAt]);
    const expireRace = await Promise.allSettled([payWinnerOffer(c.id, last.id), run()]);
    assert.equal(expireRace[0].status, "rejected");
    await run(); assert.equal((await db.auction.findUniqueOrThrow({ where: { id: allFail.id } })).status, "REFUNDED");
    const refunds = await db.walletTransfer.count({ where: { kind: "REVERSAL" } }); await run(); assert.equal(await db.walletTransfer.count({ where: { kind: "REVERSAL" } }), refunds);
    // Failure inside a job must roll back work yet persist retry metadata.
    const retry = await makePrize("refund-retry");
    await placeBid(a.id, retry.id, { amount: "3.00", reference: "retry-a" + randomUUID() });
    await placeBid(c.id, retry.id, { amount: "3.00", reference: "retry-c" + randomUUID() });
    const fill = MAX_WALLET_MINOR - BigInt((await getWallet(c.id)).balanceMinor);
    await postTestMovement({ userId: c.id, amountMinor: fill, direction: "credit", reference: "fill-test-wallet", description: "Test refund overflow recovery" });
    await close(retry.id); assert.ok((await runSettlementBatch()).includes("retry-scheduled"));
    const failedJob = await db.settlementJob.findUniqueOrThrow({ where: { auctionId: retry.id } }); assert.equal(failedJob.attempts, 1); assert.equal(failedJob.lastError, "PROCESSING_FAILED");
    assert.equal(await db.walletTransfer.count({ where: { kind: "REVERSAL", reversalOf: { bid: { auctionId: retry.id } } } }), 0);
    await postTestMovement({ userId: c.id, amountMinor: 1000n, direction: "debit", reference: "free-test-capacity", description: "Test refund capacity recovery" });
    await db.settlementJob.update({ where: { auctionId: retry.id }, data: { nextRunAt: new Date(0) } }); await run();
    assert.equal((await db.auction.findUniqueOrThrow({ where: { id: retry.id } })).status, "REFUNDED");
    assert.equal((await db.settlementJob.findUniqueOrThrow({ where: { auctionId: retry.id } })).lastError, null);
    const batch = await makePrize("batched-refunds");
    const feeAccount = await db.walletAccount.create({ data: { key: `system:test-fees:${batch.id}`, kind: "TEST_FEES" } });
    await db.$transaction(async tx => {
      for (let index = 0; index < 13; index++) for (const user of [a, b]) {
        const wallet = await tx.walletAccount.findUniqueOrThrow({ where: { userId: user.id } });
        const fee = await tx.walletTransfer.create({ data: { kind: "BID_FEE", operationKey: `batch-fee:${user.id}:${index}`, amountMinor: 100n, sourceId: wallet.id, destinationId: feeAccount.id, description: "Batch refund fixture fee" } });
        await tx.bid.create({ data: { userId: user.id, auctionId: batch.id, amountMinor: 100 + index, entryFeeMinor: 100, operationKey: `batch-bid:${user.id}:${index}`, feeTransferId: fee.id } });
      }
    }, { timeout: 30000 });
    await close(batch.id); assert.deepEqual(await run(1), ["refund-batch"]);
    assert.equal((await db.auction.findUniqueOrThrow({ where: { id: batch.id } })).status, "REFUNDING");
    assert.equal(await db.walletTransfer.count({ where: { kind: "BID_FEE", bid: { auctionId: batch.id }, reversal: null } }), 1);
    assert.deepEqual(await run(1), ["refunded"]);
    assert.equal(await db.walletTransfer.count({ where: { kind: "BID_FEE", bid: { auctionId: batch.id }, reversal: null } }), 0);
    assert.equal((await db.walletAccount.aggregate({ _sum: { balanceMinor: true } }))._sum.balanceMinor, 0n);
    assert.equal(await db.walletTransfer.count({ where: { kind: "WINNER_PAYMENT" } }), 1);
    await db.user.update({ where: { id: b.id }, data: { status: "SUSPENDED" } });
    await assert.rejects(payWinnerOffer(b.id, next.id), { code: "ACCOUNT_UNAVAILABLE" });
    console.log("PASS: original ranking, duplicate workers, immutable snapshots, payment ownership/CSRF, real deadlines, user-scoped exclusion, payment races/replays, no-unique/all-failed refunds, multi-batch refunds, rollback/backoff recovery, privacy, and balanced ledger.");
  } finally {
    await db?.$disconnect();
    if (created) { assert.match(schema, /^settlement_test_[a-f0-9]{32}$/); await control.query('SET search_path TO "public"'); await control.query(`DROP SCHEMA "${schema}" CASCADE`); }
    await control.end(); for (const phone of phones) await rm(developmentOtpPath(phone), { force: true });
  }
}
main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : "Settlement check failed.";
  for (const key of ["DATABASE_URL", "DIRECT_URL", "BETTER_AUTH_SECRET", "SMSETHIOPIA_API_KEY"]) { const value = process.env[key]; if (value) message = message.split(value).join("[redacted]"); }
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted database URL]")); process.exitCode = 1;
});
