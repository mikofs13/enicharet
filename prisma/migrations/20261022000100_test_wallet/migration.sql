BEGIN;

CREATE TYPE "WalletAccountKind" AS ENUM ('USER', 'TEST_CLEARING');
CREATE TYPE "WalletTransferKind" AS ENUM ('TEST_CREDIT', 'TEST_DEBIT', 'REVERSAL');

CREATE TABLE "WalletAccount" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "userId" TEXT UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" "WalletAccountKind" NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ETB' CHECK ("currency" = 'ETB'),
  "mode" TEXT NOT NULL DEFAULT 'TEST' CHECK ("mode" = 'TEST'),
  "balanceMinor" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletAccount_owner" CHECK (
    ("kind" = 'USER' AND "userId" IS NOT NULL) OR
    ("kind" = 'TEST_CLEARING' AND "userId" IS NULL AND "key" = 'system:test-clearing')
  ),
  CONSTRAINT "WalletAccount_balance_range" CHECK (
    ("kind" = 'USER' AND "balanceMinor" BETWEEN 0 AND 9000000000000000) OR
    ("kind" = 'TEST_CLEARING' AND "balanceMinor" <= 0)
  )
);

CREATE TABLE "WalletTransfer" (
  "id" TEXT PRIMARY KEY,
  "operationKey" TEXT NOT NULL UNIQUE,
  "kind" "WalletTransferKind" NOT NULL,
  "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" BETWEEN 1 AND 9000000000000000),
  "description" TEXT NOT NULL CHECK (length("description") BETWEEN 3 AND 200),
  "sourceId" TEXT NOT NULL REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "destinationId" TEXT NOT NULL REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "reversalOfId" TEXT UNIQUE REFERENCES "WalletTransfer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransfer_distinct_accounts" CHECK ("sourceId" <> "destinationId"),
  CONSTRAINT "WalletTransfer_reversal_reference" CHECK (("kind" = 'REVERSAL') = ("reversalOfId" IS NOT NULL))
);
CREATE INDEX "WalletTransfer_sourceId_createdAt_id_idx" ON "WalletTransfer"("sourceId", "createdAt", "id");
CREATE INDEX "WalletTransfer_destinationId_createdAt_id_idx" ON "WalletTransfer"("destinationId", "createdAt", "id");

CREATE FUNCTION wallet_guard_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."balanceMinor" <> 0 THEN RAISE EXCEPTION 'Wallet must start at zero'; END IF;
  ELSE
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."key" IS DISTINCT FROM OLD."key"
      OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."kind" IS DISTINCT FROM OLD."kind"
      OR NEW."currency" IS DISTINCT FROM OLD."currency" OR NEW."mode" IS DISTINCT FROM OLD."mode"
      OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Wallet identity is immutable';
    END IF;
    IF NEW."balanceMinor" IS DISTINCT FROM OLD."balanceMinor" AND pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'Post a ledger transfer to change a balance';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wallet_guard_account BEFORE INSERT OR UPDATE ON "WalletAccount"
FOR EACH ROW EXECUTE FUNCTION wallet_guard_account();

CREATE FUNCTION wallet_reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Wallet ledger is append-only; post a reversal instead';
END $$;
CREATE TRIGGER wallet_immutable BEFORE UPDATE OR DELETE ON "WalletTransfer"
FOR EACH ROW EXECUTE FUNCTION wallet_reject_ledger_mutation();
CREATE TRIGGER wallet_no_truncate BEFORE TRUNCATE ON "WalletTransfer"
FOR EACH STATEMENT EXECUTE FUNCTION wallet_reject_ledger_mutation();
CREATE TRIGGER wallet_accounts_no_truncate BEFORE TRUNCATE ON "WalletAccount"
FOR EACH STATEMENT EXECUTE FUNCTION wallet_reject_ledger_mutation();

CREATE FUNCTION wallet_apply_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  src "WalletAccount"%ROWTYPE;
  dst "WalletAccount"%ROWTYPE;
  original "WalletTransfer"%ROWTYPE;
BEGIN
  -- Lock in one order for every transfer. The locks live until commit/rollback.
  PERFORM "id" FROM "WalletAccount" WHERE "id" IN (NEW."sourceId", NEW."destinationId") ORDER BY "id" FOR UPDATE;
  SELECT * INTO STRICT src FROM "WalletAccount" WHERE "id" = NEW."sourceId";
  SELECT * INTO STRICT dst FROM "WalletAccount" WHERE "id" = NEW."destinationId";
  IF src."id" = dst."id" OR src."currency" <> dst."currency" OR src."mode" <> dst."mode" THEN
    RAISE EXCEPTION 'Invalid transfer accounts';
  END IF;
  IF NEW."kind" = 'TEST_CREDIT' AND NOT (src."kind" = 'TEST_CLEARING' AND dst."kind" = 'USER') THEN
    RAISE EXCEPTION 'Invalid test credit';
  ELSIF NEW."kind" = 'TEST_DEBIT' AND NOT (src."kind" = 'USER' AND dst."kind" = 'TEST_CLEARING') THEN
    RAISE EXCEPTION 'Invalid test debit';
  ELSIF NEW."kind" = 'REVERSAL' THEN
    SELECT * INTO STRICT original FROM "WalletTransfer" WHERE "id" = NEW."reversalOfId";
    IF original."kind" = 'REVERSAL' OR original."amountMinor" <> NEW."amountMinor"
      OR original."sourceId" <> NEW."destinationId" OR original."destinationId" <> NEW."sourceId" THEN
      RAISE EXCEPTION 'Reversal must exactly reverse the original transfer';
    END IF;
  END IF;
  UPDATE "WalletAccount" SET "balanceMinor" = "balanceMinor" - NEW."amountMinor" WHERE "id" = src."id";
  UPDATE "WalletAccount" SET "balanceMinor" = "balanceMinor" + NEW."amountMinor" WHERE "id" = dst."id";
  RETURN NEW;
END $$;
CREATE TRIGGER wallet_apply_transfer AFTER INSERT ON "WalletTransfer"
FOR EACH ROW EXECUTE FUNCTION wallet_apply_transfer();

COMMIT;
