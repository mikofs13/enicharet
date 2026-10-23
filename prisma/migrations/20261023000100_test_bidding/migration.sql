BEGIN;
ALTER TYPE "WalletAccountKind" ADD VALUE 'TEST_FEES';
ALTER TYPE "WalletTransferKind" ADD VALUE 'BID_FEE';
COMMIT;

BEGIN;
ALTER TABLE "WalletAccount" DROP CONSTRAINT "WalletAccount_owner";
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_owner" CHECK (
  ("kind" = 'USER' AND "userId" IS NOT NULL) OR
  ("kind" = 'TEST_CLEARING' AND "userId" IS NULL AND "key" = 'system:test-clearing') OR
  ("kind" = 'TEST_FEES' AND "userId" IS NULL AND "key" LIKE 'system:test-fees:%')
);
ALTER TABLE "WalletAccount" DROP CONSTRAINT "WalletAccount_balance_range";
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_balance_range" CHECK (
  ("kind" = 'USER' AND "balanceMinor" BETWEEN 0 AND 9000000000000000) OR
  ("kind" = 'TEST_CLEARING' AND "balanceMinor" <= 0) OR
  ("kind" = 'TEST_FEES' AND "balanceMinor" >= 0)
);

CREATE TABLE "Bid" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "amountMinor" INTEGER NOT NULL CHECK ("amountMinor" >= 100),
  "entryFeeMinor" INTEGER NOT NULL CHECK ("entryFeeMinor" > 0),
  "operationKey" TEXT NOT NULL UNIQUE,
  "feeTransferId" TEXT NOT NULL UNIQUE REFERENCES "WalletTransfer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "mode" TEXT NOT NULL DEFAULT 'TEST' CHECK ("mode" = 'TEST'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Bid_auctionId_userId_amountMinor_key" UNIQUE ("auctionId", "userId", "amountMinor")
);
CREATE INDEX "Bid_userId_createdAt_id_idx" ON "Bid"("userId", "createdAt", "id");
CREATE INDEX "Bid_auctionId_amountMinor_idx" ON "Bid"("auctionId", "amountMinor");

CREATE OR REPLACE FUNCTION wallet_apply_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src "WalletAccount"%ROWTYPE; dst "WalletAccount"%ROWTYPE; original "WalletTransfer"%ROWTYPE;
BEGIN
  PERFORM "id" FROM "WalletAccount" WHERE "id" IN (NEW."sourceId", NEW."destinationId") ORDER BY "id" FOR UPDATE;
  SELECT * INTO STRICT src FROM "WalletAccount" WHERE "id" = NEW."sourceId";
  SELECT * INTO STRICT dst FROM "WalletAccount" WHERE "id" = NEW."destinationId";
  IF src."id" = dst."id" OR src."currency" <> dst."currency" OR src."mode" <> dst."mode" THEN RAISE EXCEPTION 'Invalid transfer accounts'; END IF;
  IF NEW."kind" = 'TEST_CREDIT' AND NOT (src."kind" = 'TEST_CLEARING' AND dst."kind" = 'USER') THEN RAISE EXCEPTION 'Invalid test credit';
  ELSIF NEW."kind" = 'TEST_DEBIT' AND NOT (src."kind" = 'USER' AND dst."kind" = 'TEST_CLEARING') THEN RAISE EXCEPTION 'Invalid test debit';
  ELSIF NEW."kind" = 'BID_FEE' AND NOT (src."kind" = 'USER' AND dst."kind" = 'TEST_FEES') THEN RAISE EXCEPTION 'Invalid bid fee';
  ELSIF NEW."kind" = 'REVERSAL' THEN
    SELECT * INTO STRICT original FROM "WalletTransfer" WHERE "id" = NEW."reversalOfId";
    IF original."kind" = 'REVERSAL' OR original."amountMinor" <> NEW."amountMinor" OR original."sourceId" <> NEW."destinationId" OR original."destinationId" <> NEW."sourceId" THEN RAISE EXCEPTION 'Reversal must exactly reverse the original transfer'; END IF;
  END IF;
  UPDATE "WalletAccount" SET "balanceMinor" = "balanceMinor" - NEW."amountMinor" WHERE "id" = src."id";
  UPDATE "WalletAccount" SET "balanceMinor" = "balanceMinor" + NEW."amountMinor" WHERE "id" = dst."id";
  RETURN NEW;
END $$;

CREATE FUNCTION bid_validate_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prize "Auction"%ROWTYPE; fee "WalletTransfer"%ROWTYPE; owner "User"%ROWTYPE; src "WalletAccount"%ROWTYPE; dst "WalletAccount"%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('bid-user:' || NEW."userId", 0));
  SELECT * INTO STRICT owner FROM "User" WHERE "id" = NEW."userId" FOR SHARE;
  IF owner."status" <> 'ACTIVE' OR NOT owner."phoneNumberVerified" THEN RAISE EXCEPTION 'Verified active account required'; END IF;
  SELECT * INTO STRICT prize FROM "Auction" WHERE "id" = NEW."auctionId" FOR SHARE;
  IF prize."status" NOT IN ('SCHEDULED', 'OPEN') OR clock_timestamp() < prize."opensAt" OR clock_timestamp() >= prize."closesAt" THEN RAISE EXCEPTION 'Auction is not accepting bids'; END IF;
  IF prize."maxBidsPerUser" IS NOT NULL AND (SELECT count(*) FROM "Bid" WHERE "auctionId" = prize."id" AND "userId" = NEW."userId") >= prize."maxBidsPerUser" THEN RAISE EXCEPTION 'Bid limit reached'; END IF;
  SELECT * INTO STRICT fee FROM "WalletTransfer" WHERE "id" = NEW."feeTransferId";
  SELECT * INTO STRICT src FROM "WalletAccount" WHERE "id" = fee."sourceId";
  SELECT * INTO STRICT dst FROM "WalletAccount" WHERE "id" = fee."destinationId";
  IF fee."kind" <> 'BID_FEE' OR fee."amountMinor" <> NEW."entryFeeMinor" OR NEW."entryFeeMinor" <> prize."entryFeeMinor"
    OR src."userId" IS DISTINCT FROM NEW."userId" OR dst."key" <> 'system:test-fees:' || prize."id" THEN RAISE EXCEPTION 'Bid must match its exact fee transfer'; END IF;
  NEW."createdAt" := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER bid_validate_insert BEFORE INSERT ON "Bid" FOR EACH ROW EXECUTE FUNCTION bid_validate_insert();
CREATE TRIGGER bid_immutable BEFORE UPDATE OR DELETE ON "Bid" FOR EACH ROW EXECUTE FUNCTION wallet_reject_ledger_mutation();
CREATE TRIGGER bid_no_truncate BEFORE TRUNCATE ON "Bid" FOR EACH STATEMENT EXECUTE FUNCTION wallet_reject_ledger_mutation();

CREATE FUNCTION bid_require_fee_pair() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" = 'BID_FEE' AND NOT EXISTS (SELECT 1 FROM "Bid" WHERE "feeTransferId" = NEW."id") THEN RAISE EXCEPTION 'A bid fee cannot exist without its bid'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bid_require_fee_pair AFTER INSERT ON "WalletTransfer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bid_require_fee_pair();
COMMIT;
