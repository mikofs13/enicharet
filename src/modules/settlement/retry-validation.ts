import { WalletError } from "@/modules/wallet/money";

export function parseOperationRetry(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WalletError("INVALID_RETRY", "Enter retry details.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["kind", "id", "expectedAttempts", "reason", "reference"].includes(key))) throw new WalletError("INVALID_RETRY", "Unexpected retry fields.");
  if (input.kind !== "settlement" && input.kind !== "notification") throw new WalletError("INVALID_RETRY", "Choose an available retry type.");
  if (typeof input.id !== "string" || !input.id || input.id.length > 128) throw new WalletError("INVALID_RETRY", "Invalid retry target.");
  if (typeof input.expectedAttempts !== "number" || !Number.isSafeInteger(input.expectedAttempts) || input.expectedAttempts < 1 || input.expectedAttempts > 2147483647) throw new WalletError("INVALID_RETRY", "A valid failed attempt is required.");
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 3 || reason.length > 200) throw new WalletError("INVALID_REASON", "Enter a reason of 3–200 characters.");
  if (typeof input.reference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/.test(input.reference)) throw new WalletError("INVALID_REFERENCE", "A valid request reference is required.");
  return { kind: input.kind, id: input.id, expectedAttempts: input.expectedAttempts, reason, reference: input.reference };
}
