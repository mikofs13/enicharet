import { normalizePhoneNumber } from "@/modules/accounts/phone";
import { parseWalletAmount, requireTestMoneyMode, WalletError } from "./money";

export function adminFundingEnabled() {
  return process.env.ADMIN_TEST_FUNDING_ENABLED === "true" && process.env.NODE_ENV === "development" && !process.env.VERCEL && !process.env.CI;
}

export function requireAdminFunding() {
  requireTestMoneyMode();
  if (!adminFundingEnabled()) throw new WalletError("FUNDING_DISABLED", "Temporary admin funding is disabled.", 403);
}

export function parseAdminFunding(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WalletError("INVALID_FUNDING", "Enter funding details.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["target", "phoneNumber", "amount", "reason", "reference"].includes(key))) throw new WalletError("INVALID_FUNDING", "Unexpected funding fields.");
  if (input.target !== "self" && input.target !== "phone") throw new WalletError("INVALID_TARGET", "Choose a recipient.");
  const phoneNumber = input.target === "phone" ? normalizePhoneNumber(input.phoneNumber) : null;
  if (input.target === "phone" && !phoneNumber) throw new WalletError("INVALID_PHONE", "Enter a valid phone number.");
  if (input.target === "self" && input.phoneNumber !== undefined) throw new WalletError("INVALID_TARGET", "Do not include a phone for your own wallet.");
  const amountMinor = parseWalletAmount(input.amount);
  if (!amountMinor) throw new WalletError("INVALID_AMOUNT", "Enter a positive birr amount with up to two decimal places.");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 3 || reason.length > 200) throw new WalletError("INVALID_REASON", "Enter a reason of 3–200 characters.");
  if (typeof input.reference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/.test(input.reference)) throw new WalletError("INVALID_REFERENCE", "A valid request reference is required.");
  return { target: input.target, phoneNumber, amountMinor, reason, reference: input.reference };
}
