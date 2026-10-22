import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePhoneNumber } from "../src/modules/accounts/phone";
import { sendSmsEthiopia, SmsEthiopiaError } from "../src/modules/accounts/smsethiopia";

const input = { phoneNumber: "+251912345678", code: "123456", apiKey: "fake-test-key" };

test("phone normalization produces one identity for local and international input", () => {
  assert.equal(normalizePhoneNumber("0912 345 678"), "+251912345678");
  assert.equal(normalizePhoneNumber("+251 912 345 678"), "+251912345678");
  assert.equal(normalizePhoneNumber("not-a-phone"), null);
  assert.equal(normalizePhoneNumber("123"), null);
});

test("SMS Ethiopia receives the documented HTTPS request without a plus in MSISDN", async () => {
  const result = await sendSmsEthiopia(input, async (url, options) => {
    assert.equal(url, "https://smsethiopia.com/api/v2/sms/send");
    assert.equal(options?.method, "POST");
    assert.equal(new Headers(options?.headers).get("KEY"), input.apiKey);
    assert.equal(options?.redirect, "error");
    assert.equal(options?.cache, "no-store");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.msisdn, "251912345678");
    assert.ok(body.text.includes(input.code));
    assert.ok(body.text.length <= 160);
    return Response.json({ sent: true, id: "mock-message-id", status: "ACCEPTED" });
  });
  assert.deepEqual(result, { accepted: true, messageId: "mock-message-id" });
});

test("missing keys and unsupported destinations never make a network call", async () => {
  let called = false;
  const request: typeof fetch = async () => { called = true; throw new Error("Unexpected network request"); };
  await assert.rejects(sendSmsEthiopia({ ...input, apiKey: "" }, request), SmsEthiopiaError);
  await assert.rejects(sendSmsEthiopia({ ...input, phoneNumber: "+12025550100" }, request), SmsEthiopiaError);
  assert.equal(called, false);
});

test("provider rejection, HTTP failure, malformed JSON, and network failure fail closed", async () => {
  for (const request of [
    async () => Response.json({ sent: false }),
    async () => Response.json({ error_message: "Error Code :: 10007" }, { status: 400 }),
    async () => Response.json({ error_message: "Invalid key" }, { status: 401 }),
    async () => Response.json({}, { status: 429 }),
    async () => new Response("not-json"),
    async () => { throw new Error(`Sensitive raw body: ${input.apiKey} ${input.code}`); },
  ]) {
    await assert.rejects(sendSmsEthiopia(input, request), (error: unknown) => {
      assert.ok(error instanceof SmsEthiopiaError);
      assert.ok(!error.message.includes(input.apiKey));
      assert.ok(!error.message.includes(input.code));
      return true;
    });
  }
});
