import { readFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { normalizePhoneNumber } from "../src/modules/accounts/phone";
import { developmentOtpPath } from "../src/modules/accounts/otp-inbox";

loadEnvConfig(process.cwd());

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.AUTH_SMS_MODE !== "development") {
    throw new Error("The local inbox is available only in development SMS mode.");
  }
  const phone = normalizePhoneNumber(process.argv[2]);
  if (!phone) throw new Error("Usage: npm run sms:inbox -- +251912345678");
  let delivery: { code: string; expiresAt: string };
  try {
    delivery = JSON.parse(await readFile(developmentOtpPath(phone), "utf8"));
  } catch {
    throw new Error("No local message found. Request a code in the app first.");
  }
  if (new Date(delivery.expiresAt).getTime() <= Date.now()) {
    throw new Error("This code has expired. Request a new code in the app.");
  }
  console.log(`Development verification code: ${delivery.code}`);
  console.log("This is a local test message. No SMS was sent.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not open the local SMS inbox.");
  process.exitCode = 1;
});
