CREATE TYPE "NotificationKind" AS ENUM ('OFFER_CREATED', 'OFFER_EXPIRED', 'WINNER_CONFIRMED', 'REFUND_COMPLETED');
CREATE TABLE "NotificationOutbox" (
  "id" TEXT PRIMARY KEY, "eventKey" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "kind" "NotificationKind" NOT NULL,
  "title" TEXT NOT NULL CHECK (length("title") BETWEEN 1 AND 200),
  "body" TEXT NOT NULL CHECK (length("body") BETWEEN 1 AND 2000),
  "href" TEXT NOT NULL CHECK ("href" IN ('/offers', '/wallet')),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "deliveredAt" TIMESTAMPTZ(3), "lastError" TEXT
);
CREATE INDEX "NotificationOutbox_deliveredAt_nextAttemptAt_idx" ON "NotificationOutbox"("deliveredAt", "nextAttemptAt");
CREATE INDEX "NotificationOutbox_userId_createdAt_idx" ON "NotificationOutbox"("userId", "createdAt");
CREATE TABLE "Notification" (
  "id" TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL UNIQUE REFERENCES "NotificationOutbox"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "readAt" TIMESTAMPTZ(3)
);
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt", "id");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE TABLE "WorkerHeartbeat" ("name" TEXT PRIMARY KEY, "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE FUNCTION notification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM "NotificationOutbox" WHERE "id" = NEW."eventId" AND "userId" = NEW."userId";
    IF NOT FOUND THEN RAISE EXCEPTION 'Notification ownership mismatch'; END IF;
  ELSIF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."eventId" IS DISTINCT FROM OLD."eventId"
     OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (OLD."readAt" IS NOT NULL AND NEW."readAt" IS DISTINCT FROM OLD."readAt") THEN
    RAISE EXCEPTION 'Only first notification read is mutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notification_validate BEFORE INSERT OR UPDATE ON "Notification" FOR EACH ROW EXECUTE FUNCTION notification_guard();
