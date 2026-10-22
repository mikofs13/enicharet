// Server transport only. The caller supplies a private key; never import this
// module into client components or serialize its configuration into a response.
export class SmsEthiopiaError extends Error {
  constructor(public readonly reason: "INVALID_DESTINATION" | "MISSING_KEY" | "RATE_LIMITED" | "REJECTED" | "UNAVAILABLE", public readonly providerCode?: string) {
    super(`SMS Ethiopia delivery failed: ${reason}`);
  }
}

export async function sendSmsEthiopia(
  { phoneNumber, code, apiKey }: { phoneNumber: string; code: string; apiKey: string },
  request: typeof fetch = fetch,
) {
  if (!apiKey.trim()) throw new SmsEthiopiaError("MISSING_KEY");
  if (!/^\+2519\d{8}$/.test(phoneNumber)) throw new SmsEthiopiaError("INVALID_DESTINATION");
  if (!/^\d{6}$/.test(code)) throw new SmsEthiopiaError("REJECTED");

  let response: Response;
  let body: Record<string, unknown>;
  try {
    response = await request("https://smsethiopia.com/api/v2/sms/send", {
      method: "POST",
      headers: { KEY: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        msisdn: phoneNumber.slice(1),
        text: `Your Enicharet verification code is ${code}. Expires in 5 minutes. Do not share this code.`,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    body = await response.json();
  } catch {
    // Do not propagate network errors or provider bodies containing message data.
    throw new SmsEthiopiaError("UNAVAILABLE");
  }
  if (response.status === 429) throw new SmsEthiopiaError("RATE_LIMITED");
  if (!response.ok || body?.sent !== true) {
    const providerCode = typeof body?.error_message === "string"
      ? body.error_message.match(/\b(10000|10002|10005|10006|10007)\b/)?.[1]
      : undefined;
    throw new SmsEthiopiaError("REJECTED", providerCode);
  }
  // Accepted means queued by the provider, not guaranteed handset delivery.
  return { accepted: true as const, messageId: typeof body.id === "string" ? body.id : undefined };
}
