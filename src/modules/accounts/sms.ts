import "server-only";

import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { APIError } from "better-auth";
import { developmentOtpPath } from "./otp-inbox";
import { sendSmsEthiopia, SmsEthiopiaError } from "./smsethiopia";

export function assertSmsConfigured(phoneNumber?: string) {
  if (process.env.AUTH_SMS_MODE === "development" && process.env.NODE_ENV === "development") return;
  if (process.env.AUTH_SMS_MODE === "smsethiopia" && process.env.SMSETHIOPIA_API_KEY?.trim()) {
    if (phoneNumber && !/^\+2519\d{8}$/.test(phoneNumber)) throw new APIError("BAD_REQUEST", {
      code: "UNSUPPORTED_SMS_DESTINATION",
      message: "This SMS provider supports Ethiopian 09 numbers.",
    });
    return;
  }
  // A production process must never fall back to a local inbox or fixed code.
  throw new APIError("SERVICE_UNAVAILABLE", {
    code: "SMS_NOT_CONFIGURED",
    message: "SMS delivery is not configured.",
  });
}

export async function sendPhoneOtp({ phoneNumber, code }: { phoneNumber: string; code: string }) {
  assertSmsConfigured(phoneNumber);
  if (process.env.AUTH_SMS_MODE === "smsethiopia") {
    try {
      await sendSmsEthiopia({ phoneNumber, code, apiKey: process.env.SMSETHIOPIA_API_KEY! });
      return;
    } catch (error) {
      // Safe operational diagnostics, without phone numbers, codes, keys, or raw bodies.
      if (error instanceof SmsEthiopiaError) console.error("SMS provider failure:", error.reason, error.providerCode ?? "");
      throw new APIError("SERVICE_UNAVAILABLE", {
        code: "SMS_DELIVERY_FAILED",
        message: "We could not send your code. Please try again later.",
      });
    }
  }
  const destination = developmentOtpPath(phoneNumber);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({
    phoneNumber,
    code,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  }), { mode: 0o600 });
  await rename(temporary, destination);
}
