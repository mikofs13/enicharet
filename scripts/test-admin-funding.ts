import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { developmentOtpPath } from "../src/modules/accounts/otp-inbox";

loadEnvConfig(process.cwd());
Object.assign(process.env, { NODE_ENV: "development", AUTH_SMS_MODE: "development", ADMIN_TEST_FUNDING_ENABLED: "true" });
delete process.env.CI; delete process.env.VERCEL;

async function main() {
  const schema = `funding_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^funding_test_[a-f0-9]{32}$/);
  const configured = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  assert.ok(configured, "Database configuration required.");
  const direct = new URL(configured);
  if (!process.env.DIRECT_URL && direct.hostname.endsWith(".neon.tech")) direct.hostname = direct.hostname.replace(/-pooler(?=\.)/, "");
  const connectionString = direct.toString();
  const control = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
  let db: PrismaClient | undefined; let created = false;
  const phones = ["+12025550177", "+12025550178"];
  try {
    await control.connect();
    await control.query(`CREATE SCHEMA "${schema}"`); created = true;
    await control.query(`SET search_path TO "${schema}"`);
    for (const name of (await readdir("prisma/migrations")).filter(name => /^\d/.test(name)).sort()) {
      await control.query((await readFile(`prisma/migrations/${name}/migration.sql`, "utf8")).replace('CREATE SCHEMA IF NOT EXISTS "public";', ""));
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}`, max: 5 }, { schema }) });
    Object.assign(globalThis, { prisma: db });
    const { POST } = await import("../src/app/api/v1/admin/wallet-funding/route");
    const { addAdminFunds } = await import("../src/modules/wallet/admin-funding");
    const { postTestMovementInTransaction, getWallet } = await import("../src/modules/wallet/service");
    const { auth } = await import("../src/modules/accounts/auth");
    const base = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
    const users: { id: string; cookie: string }[] = [];
    for (const [index, phoneNumber] of phones.entries()) {
      const send = (path: string, body: unknown) => auth.handler(new Request(`${base}/api/auth/${path}`, {
        method: "POST", headers: { Origin: base, "Content-Type": "application/json", "X-Forwarded-For": `198.18.244.${index + 1}` }, body: JSON.stringify(body),
      }));
      assert.equal((await send("phone-number/send-otp", { phoneNumber })).status, 200);
      const { code } = JSON.parse(await readFile(developmentOtpPath(phoneNumber), "utf8"));
      const verified = await send("phone-number/verify", { phoneNumber, code });
      assert.equal(verified.status, 200);
      users.push({ id: (await verified.json()).user.id, cookie: verified.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
    }
    const [admin, member] = users;
    const payload = { target: "self", amount: "100.01", reason: "Admin integration credit", reference: "admin-self-credit-001" };
    const send = (body: unknown = payload, cookie = admin.cookie, origin = base, contentType = "application/json") => POST(new Request(`${base}/api/v1/admin/wallet-funding`, {
      method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": contentType }, body: JSON.stringify(body),
    }));
    assert.equal((await send(payload, "")).status, 401);
    assert.equal((await send()).status, 403);
    await db.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
    assert.equal((await send(payload, member.cookie)).status, 403);
    assert.equal((await send(payload, admin.cookie, "https://untrusted.example")).status, 403);
    assert.equal((await send(payload, admin.cookie, base, "text/plain")).status, 415);
    for (const body of [null, { ...payload, actorId: member.id }, { ...payload, amount: "1.001" }, { ...payload, amount: "0" }, { ...payload, reason: "x" }, { ...payload, target: "phone", phoneNumber: "invalid" }, { ...payload, phoneNumber: phones[1] }]) {
      assert.equal((await send(body)).status, 400);
    }
    assert.equal((await send({ ...payload, reason: "a".repeat(5000) })).status, 413);
    assert.equal(await db.walletTransfer.count(), 0);
    const first = await send(); assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    const firstBody = await first.json(); assert.equal(firstBody.wallet.balanceMinor, "10001");
    const retries = await Promise.all(Array.from({ length: 4 }, () => send()));
    for (const response of retries) { assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.transferId, firstBody.transferId); assert.equal(body.replayed, true); }
    assert.equal(await db.adminWalletCredit.count(), 1); assert.equal(await db.walletTransfer.count(), 1);
    for (const body of [{ ...payload, amount: "100.02" }, { ...payload, reason: "Different reason" }, { ...payload, target: "phone", phoneNumber: phones[1] }]) assert.equal((await send(body)).status, 409);
    const other = { ...payload, target: "phone", phoneNumber: phones[1], reference: "admin-other-credit-001", amount: "25.50" };
    const parallel = await Promise.all(Array.from({ length: 4 }, () => send(other)));
    const results = await Promise.all(parallel.map(async response => { assert.equal(response.status, 200); return response.json(); }));
    assert.equal(results.filter(row => !row.replayed).length, 1);
    assert.equal((await getWallet(member.id)).balanceMinor, "2550");
    assert.equal(await db.adminWalletCredit.count(), 2);
    assert.equal((await send({ ...other, phoneNumber: "+12025550179", reference: "missing-recipient-001" })).status, 404);
    await db.user.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
    assert.equal((await send({ ...other, reference: "suspended-recipient-001" })).status, 403);
    await db.user.update({ where: { id: member.id }, data: { status: "ACTIVE", phoneNumberVerified: false } });
    assert.equal((await send({ ...other, reference: "unverified-recipient-001" })).status, 403);
    await db.user.update({ where: { id: member.id }, data: { phoneNumberVerified: true } });
    const audit = (await db.adminWalletCredit.findFirst())!;
    await assert.rejects(db.adminWalletCredit.update({ where: { id: audit.id }, data: { reason: "Altered audit" } }));
    await assert.rejects(db.adminWalletCredit.delete({ where: { id: audit.id } }));
    await assert.rejects(db.$executeRawUnsafe('TRUNCATE "AdminWalletCredit"'));
    // Audit insertion failure must roll back the ledger transfer and balance too.
    await assert.rejects(db.$transaction(async tx => {
      const movement = await postTestMovementInTransaction(tx, { userId: member.id, amountMinor: 999n, reference: "audit-rollback-test", direction: "credit", description: "Rollback credit" });
      await tx.adminWalletCredit.create({ data: { operationKey: "invalid-audit", actorId: member.id, recipientId: member.id, transferId: movement.transferId, reason: "Rollback credit" } });
    }));
    assert.equal((await getWallet(member.id)).balanceMinor, "2550");
    assert.equal(await db.walletTransfer.count(), 2);
    await db.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    assert.equal((await send()).status, 403);
    await assert.rejects(addAdminFunds(admin.id, payload), { code: "ADMIN_REQUIRED" });
    await db.user.update({ where: { id: admin.id }, data: { role: "ADMIN", status: "SUSPENDED" } });
    assert.equal((await send()).status, 403);
    await db.user.update({ where: { id: admin.id }, data: { status: "ACTIVE" } });
    process.env.ADMIN_TEST_FUNDING_ENABLED = "false";
    assert.equal((await send()).status, 403);
    process.env.ADMIN_TEST_FUNDING_ENABLED = "true";
    Object.assign(process.env, { NODE_ENV: "production" });
    await assert.rejects(addAdminFunds(admin.id, payload), { code: "TEST_MONEY_DISABLED" });
    assert.equal((await db.walletAccount.aggregate({ _sum: { balanceMinor: true } }))._sum.balanceMinor, 0n);
    for (const wallet of await db.walletAccount.findMany()) {
      const incoming: { _sum: { amountMinor: bigint | null } } = await db.walletTransfer.aggregate({ where: { destinationId: wallet.id }, _sum: { amountMinor: true } });
      const outgoing: { _sum: { amountMinor: bigint | null } } = await db.walletTransfer.aggregate({ where: { sourceId: wallet.id }, _sum: { amountMinor: true } });
      assert.equal(wallet.balanceMinor, (incoming._sum.amountMinor ?? 0n) - (outgoing._sum.amountMinor ?? 0n));
    }
    console.log("PASS: admin/self/phone funding, exact balances, concurrent retries, conflicts, permissions, input/origin limits, immutable audit, atomic rollback, reconciliation, disable switch, and production guard.");
  } finally {
    await db?.$disconnect();
    if (created) {
      assert.match(schema, /^funding_test_[a-f0-9]{32}$/);
      await control.query('SET search_path TO "public"'); await control.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await control.end();
    for (const phone of phones) await rm(developmentOtpPath(phone), { force: true });
  }
}
main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : "Admin funding integration check failed.";
  for (const key of ["DATABASE_URL", "DIRECT_URL", "BETTER_AUTH_SECRET", "SMSETHIOPIA_API_KEY"]) {
    const value = process.env[key]; if (value) message = message.split(value).join("[redacted]");
  }
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted database URL]")); process.exitCode = 1;
});
