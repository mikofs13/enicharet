import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { developmentOtpPath, phoneDeliveryKey } from "../src/modules/accounts/otp-inbox";

loadEnvConfig(process.cwd());
Object.assign(process.env, { AUTH_SMS_MODE: "development", NODE_ENV: "development" });

async function main() {
  const { auth } = await import("../src/modules/accounts/auth");
  const { getPrisma } = await import("../src/lib/prisma");
  const admin = await import("../src/app/api/v1/admin/auctions/route");
  const edit = await import("../src/app/api/v1/admin/auctions/[id]/route");
  const publish = await import("../src/app/api/v1/admin/auctions/[id]/publish/route");
  const publicDetail = await import("../src/app/api/v1/auctions/[slug]/route");
  const db = getPrisma();
  const base = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
  const ip = `198.18.${randomInt(1, 254)}.230`;
  let phone = "", userId = "", cookie = "";
  const ids: string[] = [];
  const request = (method: string, body?: unknown, origin = base) => new Request(`${base}/api/v1/admin/auctions`, { method, headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-Forwarded-For": ip }, body: body === undefined ? undefined : JSON.stringify(body) });
  const input = { title: "Integration test prize", description: "Temporary prize for auction integration checks.", entryFee: "10.01", maxBidsPerUser: "4", paymentWindowHours: "24", opensAt: new Date(Date.now() + 86400000).toISOString(), closesAt: new Date(Date.now() + 172800000).toISOString(), imageUrl: "", imageAlt: "" };
  try {
    assert.equal((await admin.POST(request("POST", input))).status, 401);
    for (let i = 0; i < 100; i++) {
      const candidate = `+120255501${String(i).padStart(2, "0")}`;
      if (!await db.user.findUnique({ where: { phoneNumber: candidate } })) { phone = candidate; break; }
    }
    assert.ok(phone, "Unused fictional phone required.");
    const authRequest = (path: string, body: unknown) => auth.handler(new Request(`${base}/api/auth/${path}`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify(body) }));
    assert.equal((await authRequest("phone-number/send-otp", { phoneNumber: phone })).status, 200);
    const { code } = JSON.parse(await readFile(developmentOtpPath(phone), "utf8"));
    const verified = await authRequest("phone-number/verify", { phoneNumber: phone, code });
    assert.equal(verified.status, 200);
    userId = (await verified.json()).user.id;
    cookie = verified.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.equal((await admin.POST(request("POST", input))).status, 403);
    await db.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    assert.equal((await admin.POST(request("POST", input, "https://untrusted.example"))).status, 403);
    assert.equal((await admin.POST(request("POST", { ...input, entryFee: "1.001" }))).status, 400);
    const created = await admin.POST(request("POST", input));
    assert.equal(created.status, 201);
    const { auction } = await created.json(); ids.push(auction.id);
    const context = { params: Promise.resolve({ id: auction.id }) };
    const publicContext = { params: Promise.resolve({ slug: auction.slug }) };
    assert.equal((await publicDetail.GET(request("GET"), publicContext)).status, 404);
    const updated = await edit.PATCH(request("PATCH", { ...input, title: "Updated test prize", updatedAt: auction.updatedAt }), context);
    assert.equal(updated.status, 200);
    const saved = (await updated.json()).auction;
    assert.equal((await edit.PATCH(request("PATCH", { ...input, updatedAt: auction.updatedAt }), context)).status, 409);
    assert.equal((await publish.POST(request("POST", { updatedAt: auction.updatedAt }), context)).status, 409);
    const outcomes = await Promise.all([publish.POST(request("POST", { updatedAt: saved.updatedAt }), context), publish.POST(request("POST", { updatedAt: saved.updatedAt }), context)]);
    assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
    const visible = await publicDetail.GET(request("GET"), publicContext);
    assert.equal(visible.status, 200); assert.equal(visible.headers.get("cache-control"), "no-store");
    assert.equal((await edit.PATCH(request("PATCH", { ...input, updatedAt: saved.updatedAt }), context)).status, 409);
    await db.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    assert.equal((await admin.GET(request("GET"))).status, 403);
    console.log("PASS: anonymous/member/suspended access, CSRF, validation, private drafts, stale edits, publish races, public visibility, and published locks.");
  } finally {
    await db.auction.deleteMany({ where: { id: { in: ids } } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    if (phone) {
      await db.verification.deleteMany({ where: { identifier: phone } });
      await db.rateLimit.deleteMany({ where: { OR: [{ key: `phone-otp-send:${phoneDeliveryKey(phone)}` }, { key: { startsWith: `${ip}|` } }] } });
      await rm(developmentOtpPath(phone), { force: true });
    }
    await db.$disconnect();
  }
}
main().catch((error: unknown) => {
  let message = error instanceof Error ? error.message : "Auction integration checks failed.";
  for (const key of ["DATABASE_URL", "DIRECT_URL", "BETTER_AUTH_SECRET", "SMSETHIOPIA_API_KEY"]) {
    const value = process.env[key];
    if (value) message = message.split(value).join("[redacted]");
  }
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted database URL]")); process.exitCode = 1;
});
