import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMoney, validateAuction } from "../src/modules/auctions/validation";
import { auctionPhase, fromEthiopianInput, toEthiopianInput } from "../src/modules/auctions/presentation";

const draft = { title: "A new prize", description: "A complete description of the test prize.", entryFee: "12.50", maxBidsPerUser: "4", paymentWindowHours: "24", opensAt: "2030-01-01T10:00:00.000Z", closesAt: "2030-01-02T10:00:00.000Z" };
test("money is exact and rejects precision loss, negatives, and database overflow", () => {
  assert.equal(parseMoney("1.01"), 101); assert.equal(parseMoney("21474836.47"), 2147483647);
  for (const value of ["1.001", "-1", "0", "1e2", "21474836.48", "01", 1.1]) assert.equal(parseMoney(value), null);
});
test("auction validation enforces time order, limits, and HTTPS images", () => {
  assert.equal(validateAuction(draft).entryFeeMinor, 1250);
  assert.equal(validateAuction({ ...draft, maxBidsPerUser: "" }).maxBidsPerUser, null);
  for (const changes of [{ opensAt: "2030-02-31T10:00:00.000Z" }, { closesAt: draft.opensAt }, { maxBidsPerUser: "0" }, { paymentWindowHours: "721" }, { imageUrl: "http://example.com/p.png", imageAlt: "Prize" }, { imageUrl: "https://example.com/p.png" }]) assert.throws(() => validateAuction({ ...draft, ...changes }));
});
test("Ethiopian date inputs convert independently of the browser time zone", () => {
  assert.equal(fromEthiopianInput("2030-01-01T13:00"), draft.opensAt);
  assert.equal(toEthiopianInput(draft.opensAt), "2030-01-01T13:00");
  assert.equal(fromEthiopianInput("2030-02-31T13:00"), null);
});
test("opening and closing boundaries use server time and hide drafts", () => {
  const auction = { ...draft, status: "SCHEDULED" };
  assert.equal(auctionPhase(auction, new Date("2030-01-01T09:59:59Z")), "Upcoming");
  assert.equal(auctionPhase(auction, new Date(draft.opensAt)), "Open");
  assert.equal(auctionPhase(auction, new Date(draft.closesAt)), "Closed");
  assert.equal(auctionPhase({ ...auction, status: "DRAFT" }), "Draft");
});
