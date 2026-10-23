BEGIN;
ALTER TYPE "AuctionStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "WalletAccountKind" ADD VALUE 'TEST_PRIZE';
ALTER TYPE "WalletTransferKind" ADD VALUE 'WINNER_PAYMENT';
COMMIT;
BEGIN;
CREATE TYPE "WinnerOfferState" AS ENUM ('PENDING', 'EXPIRED', 'PAID');
ALTER TABLE "WalletAccount" DROP CONSTRAINT "WalletAccount_owner";
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_owner" CHECK (
  ("kind" = 'USER' AND "userId" IS NOT NULL) OR
  ("kind" = 'TEST_CLEARING' AND "userId" IS NULL AND "key" = 'system:test-clearing') OR
  ("kind" = 'TEST_FEES' AND "userId" IS NULL AND "key" LIKE 'system:test-fees:%') OR
  ("kind" = 'TEST_PRIZE' AND "userId" IS NULL AND "key" LIKE 'system:test-prize:%')
);
ALTER TABLE "WalletAccount" DROP CONSTRAINT "WalletAccount_balance_range";
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_balance_range" CHECK (
  ("kind" = 'USER' AND "balanceMinor" BETWEEN 0 AND 9000000000000000) OR
  ("kind" = 'TEST_CLEARING' AND "balanceMinor" <= 0) OR
  ("kind" IN ('TEST_FEES', 'TEST_PRIZE') AND "balanceMinor" >= 0)
);
CREATE TABLE "SettlementJob" (
  "auctionId" TEXT PRIMARY KEY REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "nextRunAt" TIMESTAMPTZ(3) NOT NULL,
  "completedAt" TIMESTAMPTZ(3), "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0), "lastError" TEXT
);
CREATE INDEX "SettlementJob_completedAt_nextRunAt_idx" ON "SettlementJob"("completedAt", "nextRunAt");
CREATE TABLE "AuctionSettlement" (
  "auctionId" TEXT PRIMARY KEY REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "snapshotAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transactionId" BIGINT NOT NULL DEFAULT txid_current()
);
CREATE TABLE "SettlementCandidate" (
  "id" TEXT PRIMARY KEY,
  "auctionId" TEXT NOT NULL REFERENCES "AuctionSettlement"("auctionId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "bidId" TEXT NOT NULL UNIQUE REFERENCES "Bid"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "rank" INTEGER NOT NULL CHECK ("rank" > 0), UNIQUE ("auctionId", "rank")
);
CREATE TABLE "WinnerOffer" (
  "id" TEXT PRIMARY KEY,
  "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "candidateId" TEXT NOT NULL UNIQUE REFERENCES "SettlementCandidate"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "state" "WinnerOfferState" NOT NULL DEFAULT 'PENDING',
  "offeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "paidAt" TIMESTAMPTZ(3),
  "paymentTransferId" TEXT UNIQUE REFERENCES "WalletTransfer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (("state" = 'PAID') = ("paidAt" IS NOT NULL AND "paymentTransferId" IS NOT NULL)),
  CHECK ("state" = 'PAID' OR ("paidAt" IS NULL AND "paymentTransferId" IS NULL)),
  CHECK ("expiresAt" > "offeredAt")
);
CREATE INDEX "WinnerOffer_auctionId_state_idx" ON "WinnerOffer"("auctionId", "state");
CREATE INDEX "WinnerOffer_state_expiresAt_idx" ON "WinnerOffer"("state", "expiresAt");
CREATE UNIQUE INDEX "WinnerOffer_one_live" ON "WinnerOffer"("auctionId") WHERE "state" IN ('PENDING', 'PAID');

CREATE FUNCTION settlement_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prize "Auction"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT prize FROM "Auction" WHERE "id" = NEW."auctionId" FOR UPDATE;
  IF prize."closesAt" > clock_timestamp() OR prize."status" <> 'CLOSING' THEN RAISE EXCEPTION 'Snapshot requires a closed auction'; END IF;
  NEW."snapshotAt" := clock_timestamp(); NEW."transactionId" := txid_current(); RETURN NEW;
END $$;
CREATE TRIGGER settlement_snapshot_guard BEFORE INSERT ON "AuctionSettlement" FOR EACH ROW EXECUTE FUNCTION settlement_snapshot_guard();
CREATE FUNCTION settlement_candidate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original "Bid"%ROWTYPE; snapshot "AuctionSettlement"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT snapshot FROM "AuctionSettlement" WHERE "auctionId" = NEW."auctionId";
  SELECT * INTO STRICT original FROM "Bid" WHERE "id" = NEW."bidId";
  IF snapshot."transactionId" <> txid_current() OR original."auctionId" <> NEW."auctionId"
    OR (SELECT count(*) FROM "Bid" WHERE "auctionId" = NEW."auctionId" AND "amountMinor" = original."amountMinor") <> 1 THEN
    RAISE EXCEPTION 'Candidate must belong to the original unique ranking';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER settlement_candidate_guard BEFORE INSERT ON "SettlementCandidate" FOR EACH ROW EXECUTE FUNCTION settlement_candidate_guard();
CREATE FUNCTION settlement_ranking_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prize_id TEXT;
BEGIN
  FOR prize_id IN SELECT DISTINCT "auctionId" FROM new_candidates LOOP
    IF EXISTS (
      WITH unique_amounts AS (SELECT "amountMinor" FROM "Bid" WHERE "auctionId" = prize_id GROUP BY "amountMinor" HAVING count(*) = 1),
      expected AS (SELECT b."id" AS bid, row_number() OVER (ORDER BY b."amountMinor", b."id") AS rank FROM "Bid" b JOIN unique_amounts u ON u."amountMinor" = b."amountMinor" WHERE b."auctionId" = prize_id),
      actual AS (SELECT "bidId" AS bid, "rank" AS rank FROM "SettlementCandidate" WHERE "auctionId" = prize_id)
      SELECT 1 FROM expected e FULL JOIN actual a ON a.bid = e.bid WHERE e.rank IS DISTINCT FROM a.rank
    ) THEN RAISE EXCEPTION 'Snapshot must contain the complete original unique ranking'; END IF;
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER settlement_ranking_guard AFTER INSERT ON "SettlementCandidate" REFERENCING NEW TABLE AS new_candidates FOR EACH STATEMENT EXECUTE FUNCTION settlement_ranking_guard();
CREATE TRIGGER settlement_snapshot_immutable BEFORE UPDATE OR DELETE ON "AuctionSettlement" FOR EACH ROW EXECUTE FUNCTION wallet_reject_ledger_mutation();
CREATE TRIGGER settlement_candidate_immutable BEFORE UPDATE OR DELETE ON "SettlementCandidate" FOR EACH ROW EXECUTE FUNCTION wallet_reject_ledger_mutation();
CREATE TRIGGER settlement_snapshot_no_truncate BEFORE TRUNCATE ON "AuctionSettlement" FOR EACH STATEMENT EXECUTE FUNCTION wallet_reject_ledger_mutation();
CREATE TRIGGER settlement_candidate_no_truncate BEFORE TRUNCATE ON "SettlementCandidate" FOR EACH STATEMENT EXECUTE FUNCTION wallet_reject_ledger_mutation();

CREATE FUNCTION winner_offer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE chosen "SettlementCandidate"%ROWTYPE; selected_bid "Bid"%ROWTYPE; prize "Auction"%ROWTYPE; payment "WalletTransfer"%ROWTYPE; src "WalletAccount"%ROWTYPE; dst "WalletAccount"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT prize FROM "Auction" WHERE "id" = NEW."auctionId" FOR UPDATE;
  SELECT * INTO STRICT chosen FROM "SettlementCandidate" WHERE "id" = NEW."candidateId";
  SELECT * INTO STRICT selected_bid FROM "Bid" WHERE "id" = chosen."bidId";
  IF chosen."auctionId" <> NEW."auctionId" THEN RAISE EXCEPTION 'Invalid offer candidate'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'PENDING' OR prize."status" <> 'AWAITING_PAYMENT' OR NEW."paymentTransferId" IS NOT NULL OR NEW."paidAt" IS NOT NULL
      OR EXISTS (SELECT 1 FROM "WinnerOffer" o JOIN "SettlementCandidate" c ON c."id" = o."candidateId" JOIN "Bid" b ON b."id" = c."bidId" WHERE o."auctionId" = NEW."auctionId" AND o."state" = 'EXPIRED' AND b."userId" = selected_bid."userId")
      THEN RAISE EXCEPTION 'Invalid new offer'; END IF;
    NEW."offeredAt" := clock_timestamp(); NEW."expiresAt" := NEW."offeredAt" + make_interval(secs => prize."paymentWindowSeconds");
  ELSE
    IF OLD."state" <> 'PENDING' OR NEW."id" <> OLD."id" OR NEW."auctionId" <> OLD."auctionId" OR NEW."candidateId" <> OLD."candidateId" OR NEW."offeredAt" <> OLD."offeredAt" OR NEW."expiresAt" <> OLD."expiresAt" THEN RAISE EXCEPTION 'Offer identity and terminal states are immutable'; END IF;
    IF NEW."state" = 'EXPIRED' THEN
      IF clock_timestamp() < OLD."expiresAt" THEN RAISE EXCEPTION 'Offer deadline has not passed'; END IF;
    ELSIF NEW."state" = 'PAID' THEN
      IF clock_timestamp() >= OLD."expiresAt" THEN RAISE EXCEPTION 'Offer has expired'; END IF;
      SELECT * INTO STRICT payment FROM "WalletTransfer" WHERE "id" = NEW."paymentTransferId";
      SELECT * INTO STRICT src FROM "WalletAccount" WHERE "id" = payment."sourceId";
      SELECT * INTO STRICT dst FROM "WalletAccount" WHERE "id" = payment."destinationId";
      IF payment."kind" <> 'WINNER_PAYMENT' OR payment."amountMinor" <> selected_bid."amountMinor" OR src."userId" IS DISTINCT FROM selected_bid."userId" OR dst."key" <> 'system:test-prize:' || NEW."auctionId" THEN RAISE EXCEPTION 'Offer payment must match its winner and amount'; END IF;
      NEW."paidAt" := clock_timestamp();
    ELSE RAISE EXCEPTION 'Invalid offer transition'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER winner_offer_guard BEFORE INSERT OR UPDATE ON "WinnerOffer" FOR EACH ROW EXECUTE FUNCTION winner_offer_guard();
CREATE TRIGGER winner_offer_no_delete BEFORE DELETE ON "WinnerOffer" FOR EACH ROW EXECUTE FUNCTION wallet_reject_ledger_mutation();
CREATE TRIGGER winner_offer_no_truncate BEFORE TRUNCATE ON "WinnerOffer" FOR EACH STATEMENT EXECUTE FUNCTION wallet_reject_ledger_mutation();

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
  ELSIF NEW."kind" = 'WINNER_PAYMENT' AND NOT (src."kind" = 'USER' AND dst."kind" = 'TEST_PRIZE') THEN RAISE EXCEPTION 'Invalid winner payment';
  ELSIF NEW."kind" = 'REVERSAL' THEN
    SELECT * INTO STRICT original FROM "WalletTransfer" WHERE "id" = NEW."reversalOfId";
    IF original."kind" = 'REVERSAL' OR original."amountMinor" <> NEW."amountMinor" OR original."sourceId" <> NEW."destinationId" OR original."destinationId" <> NEW."sourceId" THEN RAISE EXCEPTION 'Reversal must exactly reverse the original transfer'; END IF;
  END IF;
  UPDATE "WalletAccount" SET "balanceMinor" = "balanceMinor" - NEW."amountMinor" WHERE "id" = src."id";
  UPDATE "WalletAccount" SET "balanceMinor" = "balanceMinor" + NEW."amountMinor" WHERE "id" = dst."id";
  RETURN NEW;
END $$;
CREATE FUNCTION winner_require_payment_pair() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" = 'WINNER_PAYMENT' AND NOT EXISTS (SELECT 1 FROM "WinnerOffer" WHERE "paymentTransferId" = NEW."id" AND "state" = 'PAID') THEN RAISE EXCEPTION 'Winner payment requires a paid offer'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER winner_require_payment_pair AFTER INSERT ON "WalletTransfer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION winner_require_payment_pair();
COMMIT;
