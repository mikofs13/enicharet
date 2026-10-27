CREATE TYPE "OperationRetryKind" AS ENUM ('SETTLEMENT', 'NOTIFICATION');
CREATE TABLE "OperationRetryAudit" (
  "id" TEXT PRIMARY KEY, "operationKey" TEXT NOT NULL UNIQUE,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "kind" "OperationRetryKind" NOT NULL,
  "settlementJobId" TEXT REFERENCES "SettlementJob"("auctionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "notificationEventId" TEXT REFERENCES "NotificationOutbox"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "expectedAttempts" INTEGER NOT NULL CHECK ("expectedAttempts" > 0),
  "reason" TEXT NOT NULL CHECK (length(btrim("reason")) BETWEEN 3 AND 200),
  "previousRunAt" TIMESTAMPTZ(3) NOT NULL, "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("previousRunAt" > "scheduledFor"),
  CHECK (("kind" = 'SETTLEMENT' AND "settlementJobId" IS NOT NULL AND "notificationEventId" IS NULL)
    OR ("kind" = 'NOTIFICATION' AND "notificationEventId" IS NOT NULL AND "settlementJobId" IS NULL)),
  UNIQUE ("settlementJobId", "expectedAttempts"), UNIQUE ("notificationEventId", "expectedAttempts")
);
CREATE INDEX "OperationRetryAudit_createdAt_id_idx" ON "OperationRetryAudit"("createdAt", "id");
CREATE FUNCTION operation_retry_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "User" WHERE "id" = NEW."actorId" AND "role" = 'ADMIN'
    AND "status" = 'ACTIVE' AND "phoneNumberVerified" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active verified administrator required'; END IF;
  IF NEW."kind" = 'SETTLEMENT' THEN
    PERFORM 1 FROM "SettlementJob" WHERE "auctionId" = NEW."settlementJobId"
      AND "completedAt" IS NULL AND "lastError" IS NOT NULL
      AND "attempts" = NEW."expectedAttempts" AND "nextRunAt" = NEW."scheduledFor" FOR SHARE;
  ELSE
    PERFORM 1 FROM "NotificationOutbox" WHERE "id" = NEW."notificationEventId"
      AND "deliveredAt" IS NULL AND "lastError" IS NOT NULL
      AND "attempts" = NEW."expectedAttempts" AND "nextAttemptAt" = NEW."scheduledFor" FOR SHARE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit must match scheduled failed work'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER operation_retry_audit_validate BEFORE INSERT ON "OperationRetryAudit"
  FOR EACH ROW EXECUTE FUNCTION operation_retry_audit_guard();
CREATE TRIGGER operation_retry_audit_immutable BEFORE UPDATE OR DELETE ON "OperationRetryAudit"
  FOR EACH ROW EXECUTE FUNCTION wallet_reject_ledger_mutation();
CREATE TRIGGER operation_retry_audit_no_truncate BEFORE TRUNCATE ON "OperationRetryAudit"
  FOR EACH STATEMENT EXECUTE FUNCTION wallet_reject_ledger_mutation();
