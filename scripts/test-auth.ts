import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { developmentOtpPath, phoneDeliveryKey } from "../src/modules/accounts/otp-inbox";

loadEnvConfig(process.cwd());
const overHttp = process.env.AUTH_TEST_OVER_HTTP === "1";
if (overHttp && process.env.AUTH_SMS_MODE !== "development") {
  throw new Error("HTTP auth tests require development SMS mode on the local server.");
}
// This test runs the real auth handler in its own process, never an SMS gateway.
// Overrides do not change .env.local or the running app's delivery mode.
Object.assign(process.env, { AUTH_SMS_MODE: "development", NODE_ENV: "development" });

async function main() {
  const { auth } = await import("../src/modules/accounts/auth");
  const { getPrisma } = await import("../src/lib/prisma");
  const { GET: me } = await import("../src/app/api/v1/me/route");
  const { GET: overview } = await import("../src/app/api/v1/admin/overview/route");
  const prisma = getPrisma();
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  if (overHttp) assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "HTTP tests must target localhost.");
  let cookie = "";
  let userId: string | undefined;
  const ipPrefix = `198.18.${randomInt(1, 254)}`;
  let requestCounter = 0;
  const usedIps = new Set<string>();
  const phones: string[] = [];

  async function request(path: string, body?: Record<string, unknown>, options: { origin?: string; ip?: string; cookie?: string } = {}) {
    const ip = options.ip ?? `${ipPrefix}.${++requestCounter}`;
    usedIps.add(ip);
    const req = new Request(new URL(path, base), {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Origin: options.origin ?? base,
        "X-Forwarded-For": ip, Cookie: options.cookie ?? cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (overHttp) return fetch(req);
    if (path === "/api/v1/me") return me(req);
    if (path === "/api/v1/admin/overview") return overview(req);
    return auth.handler(req);
  }

  async function readCode(phone: string) {
    return (JSON.parse(await readFile(developmentOtpPath(phone), "utf8")) as { code: string }).code;
  }

  async function allowResend(phone: string) {
    await prisma.rateLimit.deleteMany({ where: { key: `phone-otp-send:${phoneDeliveryKey(phone)}` } });
  }

  function acceptCookie(response: Response) {
    cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(cookie.includes("session_token="));
    assert.match(response.headers.get("set-cookie") ?? "", /httponly/i);
    assert.match(response.headers.get("set-cookie") ?? "", /samesite=lax/i);
  }

  try {
    // Only unused numbers in the reserved North American fictional 555-01xx range.
    for (let index = 0; index < 100 && phones.length < 3; index++) {
      const phone = `+120255501${String(index).padStart(2, "0")}`;
      if (!await prisma.user.findUnique({ where: { phoneNumber: phone } })) phones.push(phone);
    }
    assert.equal(phones.length, 3, "No unused fictional test numbers available.");
    const [phone, exhaustedPhone, expiredPhone] = phones;
    assert.equal((await request("/api/v1/me")).status, 401);
    assert.equal((await request("/api/v1/admin/overview")).status, 401);
    assert.equal((await request("/api/v1/me", undefined, { cookie: "better-auth.session_token=forged" })).status, 401);
    for (const path of ["/sign-up/email", "/sign-in/email", "/sign-in/phone-number", "/set-password", "/phone-number/reset-password"]) {
      assert.equal((await request(`/api/auth${path}`, {})).status, 404);
    }
    assert.equal((await request("/api/auth/phone-number/send-otp", { phoneNumber: "invalid" })).status, 400);
    console.log("PASS: anonymous/forged sessions, invalid phones, and password endpoints are rejected.");

    const send = await request("/api/auth/phone-number/send-otp", { phoneNumber: phone });
    assert.equal(send.status, 200);
    assert.equal(await prisma.user.count({ where: { phoneNumber: phone } }), 0);
    const code = await readCode(phone);
    assert.equal((await request("/api/auth/phone-number/send-otp", { phoneNumber: phone })).status, 429);
    const wrong = code === "000000" ? "111111" : "000000";
    assert.equal((await request("/api/auth/phone-number/verify", { phoneNumber: phone, code: wrong })).status, 400);
    const verified = await request("/api/auth/phone-number/verify", { phoneNumber: phone, code, role: "ADMIN", status: "SUSPENDED" });
    assert.equal(verified.status, 200, "Phone verification failed.");
    acceptCookie(verified);
    const data = await verified.json();
    userId = data.user.id;
    assert.equal(data.user.role, "USER");
    assert.equal(data.user.status, "ACTIVE");
    assert.equal(data.user.phoneNumberVerified, true);
    assert.equal(await prisma.account.count({ where: { userId, providerId: "credential" } }), 0);
    assert.equal((await request("/api/auth/phone-number/verify", { phoneNumber: phone, code })).status, 400);
    assert.equal((await request("/api/v1/me")).status, 200);
    assert.equal((await request("/api/v1/admin/overview")).status, 403);
    console.log("PASS: signup happens only after OTP, cookies work, OTP cannot be replayed, and no password is stored.");

    assert.equal((await request("/api/auth/sign-out", {}, { origin: "https://untrusted.example" })).status, 403);
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    assert.equal((await request("/api/v1/admin/overview")).status, 200);
    await prisma.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    assert.equal((await request("/api/v1/me")).status, 403);
    assert.equal((await request("/api/v1/admin/overview")).status, 403);
    await allowResend(phone);
    assert.equal((await request("/api/auth/phone-number/send-otp", { phoneNumber: phone })).status, 200);
    assert.equal((await request("/api/auth/phone-number/verify", { phoneNumber: phone, code: await readCode(phone) })).status, 403);
    await prisma.user.update({ where: { id: userId }, data: { role: "USER", status: "ACTIVE" } });
    assert.equal((await request("/api/v1/admin/overview")).status, 403);
    await prisma.session.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    assert.equal((await request("/api/v1/me")).status, 401);
    console.log("PASS: origin checks, current roles, suspension, and session expiry are enforced.");

    await allowResend(phone);
    assert.equal((await request("/api/auth/phone-number/send-otp", { phoneNumber: phone })).status, 200);
    const oldCode = await readCode(phone);
    await allowResend(phone);
    assert.equal((await request("/api/auth/phone-number/send-otp", { phoneNumber: phone })).status, 200);
    const freshCode = await readCode(phone);
    if (freshCode !== oldCode) assert.equal((await request("/api/auth/phone-number/verify", { phoneNumber: phone, code: oldCode })).status, 400);
    const races = await Promise.all([
      request("/api/auth/phone-number/verify", { phoneNumber: phone, code: freshCode }),
      request("/api/auth/phone-number/verify", { phoneNumber: phone, code: freshCode }),
    ]);
    assert.equal(races.filter((response) => response.status === 200).length, 1);
    acceptCookie(races.find((response) => response.status === 200)!);
    assert.equal(await prisma.user.count({ where: { phoneNumber: phone } }), 1);
    const session = await prisma.session.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    assert.ok(session);
    const ttl = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? 604800) * 1000;
    assert.ok(Math.abs(session.expiresAt.getTime() - session.createdAt.getTime() - ttl) < 3000);
    const oldCookie = cookie;
    assert.equal((await request("/api/auth/sign-out", {})).status, 200);
    assert.equal((await request("/api/v1/me", undefined, { cookie: oldCookie })).status, 401);
    console.log("PASS: replacement codes, concurrent single-use verification, returning-user login, configured TTL, and logout.");

    await allowResend(exhaustedPhone);
    assert.equal((await request("/api/auth/phone-number/send-otp", { phoneNumber: exhaustedPhone })).status, 200);
    const attemptsCode = await readCode(exhaustedPhone);
    for (let attempt = 0; attempt < 3; attempt++) {
      assert.equal((await request("/api/auth/phone-number/verify", { phoneNumber: exhaustedPhone, code: attemptsCode === "000000" ? "111111" : "000000" })).status, 400);
    }
    assert.equal((await request("/api/auth/phone-number/verify", { phoneNumber: exhaustedPhone, code: attemptsCode })).status, 403);
    await allowResend(expiredPhone);
    assert.equal((await request("/api/auth/phone-number/send-otp", { phoneNumber: expiredPhone })).status, 200);
    await prisma.verification.updateMany({ where: { identifier: expiredPhone }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    assert.equal((await request("/api/auth/phone-number/verify", { phoneNumber: expiredPhone, code: await readCode(expiredPhone) })).status, 400);
    assert.equal(await prisma.user.count({ where: { phoneNumber: { in: [exhaustedPhone, expiredPhone] } } }), 0);
    console.log("PASS: attempt limits and expired OTPs cannot create accounts.");

    const limitedIp = `${ipPrefix}.240`;
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await request("/api/auth/phone-number/verify", { phoneNumber: expiredPhone, code: "000000" }, { ip: limitedIp });
      assert.ok(response.status === 400 || response.status === 403);
    }
    assert.equal((await request("/api/auth/phone-number/verify", { phoneNumber: expiredPhone, code: "000000" }, { ip: limitedIp })).status, 429);
    console.log("PASS: IP rate limiting supplements the per-code and per-phone limits.");
  } finally {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.verification.deleteMany({ where: { identifier: { in: phones } } });
    await prisma.rateLimit.deleteMany({ where: { OR: [
      ...phones.map((phone) => ({ key: `phone-otp-send:${phoneDeliveryKey(phone)}` })),
      ...[...usedIps].map((ip) => ({ key: { startsWith: `${ip}|` } })),
    ] } });
    for (const phone of phones) await rm(developmentOtpPath(phone), { force: true });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : "Unknown test error";
  for (const key of ["DATABASE_URL", "DIRECT_URL", "BETTER_AUTH_SECRET", "SMSETHIOPIA_API_KEY"]) {
    const value = process.env[key];
    if (value) message = message.split(value).join("[redacted]");
  }
  message = message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted database URL]");
  console.error(message);
  process.exitCode = 1;
});
