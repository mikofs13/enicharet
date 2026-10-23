import { parseMoney } from "@/modules/auctions/validation";
export class BidError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}
export function validateBid(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BidError("INVALID_BID", "Enter a bid amount.");
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !["amount", "reference"].includes(key))) throw new BidError("INVALID_BID", "Only an amount and request reference are accepted.");
  const amountMinor = parseMoney(body.amount);
  if (amountMinor === null || amountMinor < 100) throw new BidError("INVALID_AMOUNT", "Enter between 1.00 and 21,474,836.47 birr, with up to two decimal places.");
  if (typeof body.reference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/.test(body.reference)) throw new BidError("INVALID_REFERENCE", "A valid request reference is required.");
  return { amountMinor, reference: body.reference };
}
