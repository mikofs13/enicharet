import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { developmentOtpPath } from "../src/modules/accounts/otp-inbox";

loadEnvConfig(process.cwd());
// Separate process and disposable schema; never send SMS or touch app wallets.
Object.assign(process.env, { NODE_ENV: "development", AUTH_SMS_MODE: "development" });
delete process.env.CI; delete process.env.VERCEL;

async function main() {
  const schema = `wallet_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^wallet_test_[a-f0-9]{32}$/);
  const configuredUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert.ok(configuredUrl, "Database configuration required.");
  const directUrl = new URL(configuredUrl);
  if (!process.env.DIRECT_URL && directUrl.hostname.endsWith(".neon.tech")) directUrl.hostname = directUrl.hostname.replace(/-pooler(?=\.)/, "");
  const connectionString = directUrl.toString();
  const control = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
  let db: PrismaClient | undefined;
  let created = false;
  const phones = ["+12025550170", "+12025550171"];
  try {
    await control.connect();
    await control.query(`CREATE SCHEMA "${schema}"`); created = true;
    await control.query(`SET search_path TO "${schema}"`);
    for (const name of (await readdir("prisma/migrations")).filter(name => /^\d/.test(name)).sort()) {
      const sql = (await readFile(`prisma/migrations/${name}/migration.sql`, "utf8")).replace('CREATE SCHEMA IF NOT EXISTS "public";', "");
      await control.query(sql);
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}`, max: 5 }, { schema }) });
    Object.assign(globalThis, { prisma: db });
    const { postTestMovement, getWallet, getWalletHistory, getWalletSnapshot } = await import("../src/modules/wallet/service");
    const { GET: balanceApi } = await import("../src/app/api/v1/wallet/route");
    const { GET: historyApi } = await import("../src/app/api/v1/wallet/transactions/route");
    const { auth } = await import("../src/modules/accounts/auth");
    const base = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
    const request = (cookie = "", query = "") => new Request(`${base}/api/v1/wallet${query}`, { headers: { Cookie: cookie } });
    assert.equal((await balanceApi(request())).status, 401);
    assert.equal((await historyApi(request())).status, 401);
    const users: { id: string; cookie: string }[] = [];
    for (const [index, phoneNumber] of phones.entries()) {
      const send = (path: string, body: unknown) => auth.handler(new Request(`${base}/api/auth/${path}`, {
        method: "POST", headers: { Origin: base, "Content-Type": "application/json", "X-Forwarded-For": `198.18.245.${index + 1}` }, body: JSON.stringify(body),
      }));
      assert.equal((await send("phone-number/send-otp", { phoneNumber })).status, 200);
      const { code } = JSON.parse(await readFile(developmentOtpPath(phoneNumber), "utf8"));
      const verified = await send("phone-number/verify", { phoneNumber, code });
      assert.equal(verified.status, 200);
      users.push({ id: (await verified.json()).user.id, cookie: verified.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
    }
    const [first, second] = users;
    assert.equal((await getWallet(first.id)).balanceMinor, "0");
    assert.equal(await db.walletAccount.count(), 0, "Reading an empty wallet must not write.");
    const credit = { userId: first.id, amountMinor: 10001n, reference: "initial-credit-001", direction: "credit" as const, description: "Integration test funds" };
    const initial = await postTestMovement(credit);
    assert.equal((await postTestMovement(credit)).transferId, initial.transferId);
    await assert.rejects(postTestMovement({ ...credit, amountMinor: 10000n }), { code: "IDEMPOTENCY_CONFLICT" });
    const retries = await Promise.all(Array.from({ length: 4 }, () => postTestMovement({ ...credit, reference: "parallel-credit-001", amountMinor: 250n })));
    assert.equal(retries.filter(row => !row.replayed).length, 1);
    assert.equal((await getWallet(first.id)).balanceMinor, "10251");
    const snapshot = await getWalletSnapshot(first.id);
    assert.equal(snapshot.wallet.balanceMinor, "10251"); assert.equal(snapshot.history.items.length, 2);
    const spends = await Promise.allSettled(["concurrent-spend-001", "concurrent-spend-002"].map(reference => postTestMovement({ ...credit, reference, amountMinor: 8000n, direction: "debit" })));
    assert.equal(spends.filter(row => row.status === "fulfilled").length, 1);
    assert.equal(spends.filter(row => row.status === "rejected" && row.reason.code === "INSUFFICIENT_FUNDS").length, 1);
    assert.equal((await getWallet(first.id)).balanceMinor, "2251");
    const account = (await db.walletAccount.findUnique({ where: { userId: first.id } }))!;
    const clearing = (await db.walletAccount.findUnique({ where: { key: "system:test-clearing" } }))!;
    const count = await db.walletTransfer.count();
    await assert.rejects(db.walletTransfer.create({ data: { operationKey: "direct-overdraft", kind: "TEST_DEBIT", amountMinor: 2252n, description: "Invalid direct debit", sourceId: account.id, destinationId: clearing.id } }));
    assert.equal(await db.walletTransfer.count(), count);
    assert.equal((await getWallet(first.id)).balanceMinor, "2251");
    await assert.rejects(db.walletAccount.update({ where: { id: account.id }, data: { balanceMinor: 999999n } }));
    await assert.rejects(db.walletAccount.create({ data: { key: "nonzero-start", userId: second.id, kind: "USER", balanceMinor: 1n } }));
    await assert.rejects(db.walletTransfer.update({ where: { id: initial.transferId }, data: { description: "Edited history" } }));
    await assert.rejects(db.walletTransfer.delete({ where: { id: initial.transferId } }));
    await assert.rejects(db.$executeRawUnsafe('TRUNCATE "WalletTransfer" CASCADE'));
    await assert.rejects(db.user.delete({ where: { id: first.id } }));
    const debit = (await db.walletTransfer.findFirst({ where: { kind: "TEST_DEBIT" } }))!;
    const reversalData = { kind: "REVERSAL" as const, amountMinor: debit.amountMinor, description: "Reverse test debit", sourceId: debit.destinationId, destinationId: debit.sourceId, reversalOfId: debit.id };
    await assert.rejects(db.walletTransfer.create({ data: { ...reversalData, operationKey: "invalid-reversal", amountMinor: 1n } }));
    await db.walletTransfer.create({ data: { ...reversalData, operationKey: "valid-reversal" } });
    await assert.rejects(db.walletTransfer.create({ data: { ...reversalData, operationKey: "duplicate-reversal" } }));
    assert.equal((await getWallet(first.id)).balanceMinor, "10251");
    await assert.rejects(db.$transaction(async tx => {
      await tx.walletTransfer.create({ data: { operationKey: "rollback-transfer", kind: "TEST_CREDIT", amountMinor: 100n, description: "Rollback test funds", sourceId: clearing.id, destinationId: account.id } });
      throw new Error("ROLLBACK_EXPECTED");
    }), /ROLLBACK_EXPECTED/);
    assert.equal((await getWallet(first.id)).balanceMinor, "10251");
    assert.equal(await db.walletTransfer.count({ where: { operationKey: "rollback-transfer" } }), 0);
    await db.walletTransfer.createMany({ data: Array.from({ length: 23 }, (_, index) => ({ operationKey: `page-${index}`, kind: "TEST_CREDIT" as const, amountMinor: 1n, description: "History pagination fixture", sourceId: clearing.id, destinationId: account.id })) });
    const page1 = await getWalletHistory(first.id);
    assert.equal(page1.items.length, 20); assert.ok(page1.nextCursor);
    const page2 = await getWalletHistory(first.id, page1.nextCursor!);
    assert.equal(page2.items.length, 7); assert.equal(page2.nextCursor, null);
    assert.equal(new Set([...page1.items, ...page2.items].map(row => row.id)).size, 27);
    await postTestMovement({ ...credit, userId: second.id, reference: "other-user-credit", amountMinor: 9900n });
    const privateRow = (await getWalletHistory(second.id)).items[0];
    assert.equal((await historyApi(request(first.cookie, `?before=${privateRow.id}`))).status, 400);
    const owned = await balanceApi(request(first.cookie, `?userId=${second.id}`));
    assert.equal(owned.status, 200); assert.equal((await owned.json()).wallet.balanceMinor, "10274");
    assert.equal(owned.headers.get("cache-control"), "private, no-store");
    const history = await historyApi(request(first.cookie));
    assert.equal(history.status, 200); assert.ok(!(await history.json()).items.some((row: { id: string }) => row.id === privateRow.id));
    const sum = await db.walletAccount.aggregate({ _sum: { balanceMinor: true } });
    assert.equal(sum._sum.balanceMinor, 0n, "All account debit/credit balances must net to zero.");
    for (const wallet of await db.walletAccount.findMany()) {
      const outgoing: { _sum: { amountMinor: bigint | null } } = await db.walletTransfer.aggregate({ where: { sourceId: wallet.id }, _sum: { amountMinor: true } });
      const incoming: { _sum: { amountMinor: bigint | null } } = await db.walletTransfer.aggregate({ where: { destinationId: wallet.id }, _sum: { amountMinor: true } });
      assert.equal(wallet.balanceMinor, (incoming._sum.amountMinor ?? 0n) - (outgoing._sum.amountMinor ?? 0n));
    }
    await db.user.update({ where: { id: first.id }, data: { status: "SUSPENDED" } });
    assert.equal((await balanceApi(request(first.cookie))).status, 403);
    assert.equal((await historyApi(request(first.cookie))).status, 403);
    await assert.rejects(postTestMovement({ ...credit, reference: "suspended-credit" }), { code: "ACCOUNT_UNAVAILABLE" });
    Object.assign(process.env, { NODE_ENV: "production" });
    await assert.rejects(postTestMovement(credit), { code: "TEST_MONEY_DISABLED" });
    console.log("PASS: exact balances, retries/conflicts, concurrent overspending, DB constraints, immutable ledger, reversals, rollback, pagination, ownership, suspension, reconciliation, and production guard.");
  } finally {
    await db?.$disconnect();
    if (created) {
      // Only the freshly generated disposable schema, never app tables/public.
      assert.match(schema, /^wallet_test_[a-f0-9]{32}$/);
      await control.query('SET search_path TO "public"');
      await control.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await control.end();
    for (const phone of phones) await rm(developmentOtpPath(phone), { force: true });
  }
}
main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : "Wallet integration check failed.";
  for (const key of ["DATABASE_URL", "DIRECT_URL", "BETTER_AUTH_SECRET", "SMSETHIOPIA_API_KEY"]) {
    const value = process.env[key]; if (value) message = message.split(value).join("[redacted]");
  }
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted database URL]")); process.exitCode = 1;
});
