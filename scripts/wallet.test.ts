import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWalletMoney, MAX_WALLET_MINOR, parseWalletAmount, requireTestMoneyMode } from "../src/modules/wallet/money";

test("wallet money uses exact bigint arithmetic including the upper bound", () => {
  assert.equal(parseWalletAmount("100.01"), 10001n);
  assert.equal(parseWalletAmount("90000000000000.00"), MAX_WALLET_MINOR);
  for (const value of ["0", "-1", "1.001", "1e3", "01", "NaN", "90000000000000.01", 1.5, " 1.00"]) assert.equal(parseWalletAmount(value), null);
  assert.equal(formatWalletMoney("10001"), "100.01 birr");
  assert.equal(formatWalletMoney(-1n), "−0.01 birr");
  assert.equal(formatWalletMoney(MAX_WALLET_MINOR), "90,000,000,000,000.00 birr");
});

test("test credits fail closed outside local development", () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL, CI: process.env.CI };
  try {
    for (const mode of ["production", "test", ""]) {
      Object.assign(process.env, { NODE_ENV: mode });
      assert.throws(requireTestMoneyMode);
    }
    Object.assign(process.env, { NODE_ENV: "development" }); delete process.env.VERCEL; delete process.env.CI;
    assert.doesNotThrow(requireTestMoneyMode);
    process.env.VERCEL = "1"; assert.throws(requireTestMoneyMode);
    delete process.env.VERCEL; process.env.CI = "1"; assert.throws(requireTestMoneyMode);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
