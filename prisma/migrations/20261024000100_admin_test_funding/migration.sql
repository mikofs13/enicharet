CREATE TABLE "AdminWalletCredit" (
  "id" TEXT PRIMARY KEY,
  "operationKey" TEXT NOT NULL UNIQUE,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "recipientId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "transferId" TEXT NOT NULL UNIQUE REFERENCES "WalletTransfer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "reason" TEXT NOT NULL CHECK (length("reason") BETWEEN 3 AND 200),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminWalletCredit_createdAt_id_idx" ON "AdminWalletCredit"("createdAt", "id");

CREATE FUNCTION admin_wallet_credit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "User" WHERE "id" = NEW."actorId" AND "role" = 'ADMIN'
    AND "status" = 'ACTIVE' AND "phoneNumberVerified" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active verified administrator required'; END IF;
  PERFORM 1 FROM "WalletTransfer" t JOIN "WalletAccount" d ON d."id" = t."destinationId"
    JOIN "WalletAccount" s ON s."id" = t."sourceId"
    WHERE t."id" = NEW."transferId" AND t."kind" = 'TEST_CREDIT'
      AND d."userId" = NEW."recipientId" AND s."kind" = 'TEST_CLEARING'
      AND t."description" = NEW."reason";
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit must match a test credit'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER admin_wallet_credit_validate BEFORE INSERT ON "AdminWalletCredit"
  FOR EACH ROW EXECUTE FUNCTION admin_wallet_credit_guard();
CREATE TRIGGER admin_wallet_credit_immutable BEFORE UPDATE OR DELETE ON "AdminWalletCredit"
  FOR EACH ROW EXECUTE FUNCTION wallet_reject_ledger_mutation();
CREATE TRIGGER admin_wallet_credit_no_truncate BEFORE TRUNCATE ON "AdminWalletCredit"
  FOR EACH STATEMENT EXECUTE FUNCTION wallet_reject_ledger_mutation();
