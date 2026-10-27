import assert from "node:assert/strict";
import test from "node:test";
import { operationsHealth } from "../src/modules/settlement/health";
import { parseOperationRetry } from "../src/modules/settlement/retry-validation";

test("worker health has explicit stale boundaries and alert categories", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  const counts = { overdueJobs: 0, missingJobs: 0, delayedNotifications: 0, repeatedJobFailures: 0, repeatedDeliveryFailures: 0 };
  assert.equal(operationsHealth(now, [{ name: "settlement", lastSeenAt: new Date(now.getTime() - 30000) }, { name: "notifications", lastSeenAt: now }], counts).hasAlerts, false);
  const stale = operationsHealth(now, [{ name: "settlement", lastSeenAt: new Date(now.getTime() - 30001) }], counts);
  assert.deepEqual(stale.alerts.map(row => row.code), ["SETTLEMENT_WORKER_STALE", "NOTIFICATIONS_WORKER_MISSING"]);
  const all = operationsHealth(now, [], { overdueJobs: 2, missingJobs: 1, delayedNotifications: 3, repeatedJobFailures: 1, repeatedDeliveryFailures: 2 });
  assert.equal(all.alerts.length, 7); assert.equal(all.alerts.find(row => row.code === "JOBS_OVERDUE")!.count, 2);
});
test("operation retries accept only a bounded target, attempt, reason, and reference", () => {
  const input = { kind: "settlement", id: "fixture-job", expectedAttempts: 3, reason: " Investigated failure ", reference: "retry-request-001" };
  assert.equal(parseOperationRetry(input).reason, "Investigated failure");
  for (const value of [null, [], { ...input, amount: "1.00" }, { ...input, kind: "payment" }, { ...input, expectedAttempts: 0 }, { ...input, expectedAttempts: 1.2 }, { ...input, reason: "  " }, { ...input, id: "x".repeat(129) }, { ...input, reference: "bad" }]) assert.throws(() => parseOperationRetry(value));
});
