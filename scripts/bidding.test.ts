import assert from "node:assert/strict";
import { test } from "node:test";
import { validateBid } from "../src/modules/bidding/validation";

test("bids enforce the accepted minimum, precision, technical cap, and reference", () => {
  assert.equal(validateBid({ amount: "1.00", reference: "valid-ref-001" }).amountMinor, 100);
  assert.equal(validateBid({ amount: "21474836.47", reference: "valid-ref-001" }).amountMinor, 2147483647);
  for (const amount of ["0.99", "1.001", "21474836.48", "-1", "1e2", 5, " 1.00", "01.00"]) assert.throws(() => validateBid({ amount, reference: "valid-ref-001" }));
  assert.throws(() => validateBid({ amount: "1.00", reference: "short" }));
  for (const extra of [{ userId: "other-user" }, { entryFeeMinor: 0 }, { mode: "LIVE" }]) assert.throws(() => validateBid({ amount: "1.00", reference: "valid-ref-001", ...extra }));
});
