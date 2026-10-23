export const MAX_WALLET_MINOR = 9_000_000_000_000_000n;

export function parseWalletAmount(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return amount > 0n && amount <= MAX_WALLET_MINOR ? amount : null;
}

export function formatWalletMoney(minor: bigint | string) {
  const amount = BigInt(minor);
  const absolute = amount < 0n ? -amount : amount;
  const whole = new Intl.NumberFormat("en-ET").format(absolute / 100n);
  return `${amount < 0n ? "−" : ""}${whole}.${String(absolute % 100n).padStart(2, "0")} birr`;
}

export class WalletError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

export function requireTestMoneyMode() {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL || process.env.CI) {
    throw new WalletError("TEST_MONEY_DISABLED", "Test-money posting is available only in local development.", 403);
  }
}
