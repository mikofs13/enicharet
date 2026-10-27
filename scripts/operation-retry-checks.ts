import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { PrismaClient } from "../src/generated/prisma/client";

// Only called inside test-settlement's disposable schema, never application data.
export async function checkOperationRetries(db: PrismaClient, control: pg.Client, users: { id: string; cookie: string }[], eventId: string, base: string) {
  const [admin, member] = users;
  const { POST } = await import("../src/app/api/v1/admin/operations/retry/route");
  const { retryOperation } = await import("../src/modules/settlement/retry");
  const { auctionOperations } = await import("../src/modules/settlement/operations");
  const future = new Date(Date.now() + 3600000);
  const auction = await db.auction.create({ data: { slug: `retry-check-${randomUUID()}`, title: "Disposable retry fixture", description: "Isolated recovery test.", status: "SCHEDULED", entryFeeMinor: 100, paymentWindowSeconds: 60, opensAt: new Date(Date.now() - 300000), closesAt: new Date(Date.now() - 120000) } });
  await db.settlementJob.create({ data: { auctionId: auction.id, attempts: 3, lastError: "PROCESSING_FAILED", nextRunAt: future } });
  await db.notificationOutbox.update({ where: { id: eventId }, data: { attempts: 3, nextAttemptAt: future } });
  const input = { kind: "settlement", id: auction.id, expectedAttempts: 3, reason: "Reviewed the failure cause", reference: "retry-job-request-001" };
  const send = (body: unknown = input, cookie = admin.cookie, origin = base, contentType = "application/json") => POST(new Request(`${base}/api/v1/admin/operations/retry`, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": contentType }, body: JSON.stringify(body) }));
  assert.equal((await send(input, "")).status, 401);
  assert.equal((await send(input, member.cookie)).status, 403);
  await assert.rejects(retryOperation(member.id, input), { code: "ADMIN_REQUIRED" });
  assert.equal((await send(input, admin.cookie, "https://untrusted.example")).status, 403);
  assert.equal((await send(input, admin.cookie, base, "text/plain")).status, 415);
  for (const body of [null, { ...input, nextRunAt: new Date(0).toISOString() }, { ...input, reason: "x" }, { ...input, expectedAttempts: 0 }, { ...input, reference: "bad" }]) assert.equal((await send(body)).status, 400);
  assert.equal((await send({ ...input, reason: "x".repeat(5000) })).status, 413);
  assert.equal((await send({ ...input, id: "missing-job" })).status, 404);
  assert.equal((await send({ ...input, expectedAttempts: 2 })).status, 409);
  await db.auction.update({ where: { id: auction.id }, data: { closesAt: future } });
  assert.equal((await send()).status, 409, "Future auctions cannot be advanced by retry controls.");
  await db.auction.update({ where: { id: auction.id }, data: { closesAt: new Date(Date.now() - 120000) } });
  // An active worker's row lock wins. The admin receives a bounded conflict.
  await control.query("BEGIN");
  try {
    await control.query('SELECT "auctionId" FROM "SettlementJob" WHERE "auctionId" = $1 FOR UPDATE', [auction.id]);
    const response = await send(); assert.equal(response.status, 409, JSON.stringify(await response.clone().json()));
    assert.equal((await response.json()).code, "TARGET_BUSY");
  } finally { await control.query("ROLLBACK"); }
  await db.settlementJob.update({ where: { auctionId: auction.id }, data: { completedAt: new Date() } });
  assert.equal((await send()).status, 409);
  await db.settlementJob.update({ where: { auctionId: auction.id }, data: { completedAt: null, lastError: null } });
  assert.equal((await send()).status, 409);
  await db.settlementJob.update({ where: { auctionId: auction.id }, data: { lastError: "PROCESSING_FAILED" } });
  const transfers = await db.walletTransfer.count(); const offers = await db.winnerOffer.count();
  // Failing to record the audit must roll back the schedule change.
  await control.query("CREATE FUNCTION retry_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Disposable audit failure'; END $$");
  await control.query('CREATE TRIGGER retry_test_failure BEFORE INSERT ON "OperationRetryAudit" FOR EACH ROW EXECUTE FUNCTION retry_test_failure()');
  assert.equal((await send()).status, 500);
  assert.equal((await db.settlementJob.findUniqueOrThrow({ where: { auctionId: auction.id } })).nextRunAt.getTime(), future.getTime());
  assert.equal(await db.operationRetryAudit.count(), 0);
  await control.query('DROP TRIGGER retry_test_failure ON "OperationRetryAudit"'); await control.query("DROP FUNCTION retry_test_failure()");
  const results = await Promise.all([send(), send(), send()]);
  const bodies = await Promise.all(results.map(async response => { assert.equal(response.status, 200); return response.json(); }));
  assert.equal(bodies.filter(body => !body.replayed).length, 1); assert.equal(new Set(bodies.map(body => body.auditId)).size, 1);
  assert.equal((await send({ ...input, reason: "Different retry reason" })).status, 409);
  assert.equal((await send({ ...input, reference: "different-reference-001" })).status, 409);
  const job = await db.settlementJob.findUniqueOrThrow({ where: { auctionId: auction.id } });
  assert.ok(job.nextRunAt < future); assert.equal(job.attempts, 3); assert.equal(job.lastError, "PROCESSING_FAILED");
  const delivery = { ...input, kind: "notification", id: eventId, reference: "retry-delivery-request-001" };
  const response = await send(delivery); assert.equal(response.status, 200);
  assert.equal((await send(delivery)).status, 200);
  assert.equal((await send({ ...delivery, reference: "different-delivery-001" })).status, 409);
  assert.equal(await db.operationRetryAudit.count(), 2);
  const audit = await db.operationRetryAudit.findUniqueOrThrow({ where: { id: bodies[0].auditId } });
  assert.equal(audit.actorId, admin.id); assert.equal(audit.previousRunAt.getTime(), future.getTime());
  await assert.rejects(db.operationRetryAudit.update({ where: { id: audit.id }, data: { reason: "Edited audit" } }));
  await assert.rejects(db.operationRetryAudit.delete({ where: { id: audit.id } }));
  await assert.rejects(db.$executeRawUnsafe('TRUNCATE "OperationRetryAudit"'));
  assert.equal(await db.walletTransfer.count(), transfers); assert.equal(await db.winnerOffer.count(), offers);
  // New failure versions cannot be modified by an old page/request.
  await db.settlementJob.update({ where: { auctionId: auction.id }, data: { attempts: 4, nextRunAt: future } });
  assert.equal((await send({ ...input, reference: "stale-request-001" })).status, 409);
  await db.user.update({ where: { id: admin.id }, data: { status: "SUSPENDED" } }); assert.equal((await send()).status, 403);
  await assert.rejects(retryOperation(admin.id, input), { code: "ADMIN_REQUIRED" });
  await db.user.update({ where: { id: admin.id }, data: { status: "ACTIVE" } });
  await db.settlementJob.update({ where: { auctionId: auction.id }, data: { nextRunAt: new Date(Date.now() - 120000) } });
  await db.notificationOutbox.update({ where: { id: eventId }, data: { nextAttemptAt: new Date(Date.now() - 120000) } });
  await db.workerHeartbeat.update({ where: { name: "settlement" }, data: { lastSeenAt: new Date(Date.now() - 31000) } });
  const missing = await db.auction.create({ data: { slug: `missing-job-${randomUUID()}`, title: "Missing schedule fixture", description: "Isolated health check.", status: "SCHEDULED", entryFeeMinor: 100, paymentWindowSeconds: 60, opensAt: new Date(Date.now() - 300000), closesAt: new Date(Date.now() - 120000) } });
  const operations = await auctionOperations();
  for (const code of ["SETTLEMENT_WORKER_STALE", "JOBS_OVERDUE", "JOBS_MISSING", "DELIVERIES_OVERDUE", "JOBS_REPEATED_FAILURE", "DELIVERIES_REPEATED_FAILURE"]) assert.ok(operations.health.alerts.some(alert => alert.code === code), code);
  assert.equal(operations.retryAudit.length, 2);
  // Retire only nonfinancial fixtures; the original failure proceeds through its worker.
  await db.settlementJob.update({ where: { auctionId: auction.id }, data: { completedAt: new Date() } });
  await db.auction.update({ where: { id: missing.id }, data: { status: "DRAFT" } });
  console.log("PASS: audited manual retries, concurrency/idempotency, row-lock conflicts, stale requests, permission/origin/input guards, atomic audit rollback, immutable records, unchanged finances/deadlines, and live health queries.");
}
