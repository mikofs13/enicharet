import { createHmac } from "node:crypto";
import path from "node:path";

export function phoneDeliveryKey(phoneNumber: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is missing.");
  return createHmac("sha256", secret).update(phoneNumber).digest("hex");
}

export function developmentOtpPath(phoneNumber: string): string {
  return path.join(process.cwd(), ".local", "sms", `${phoneDeliveryKey(phoneNumber)}.json`);
}
