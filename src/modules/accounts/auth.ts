import "server-only";

import { betterAuth, APIError } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";
import { createHash, randomUUID } from "node:crypto";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getPrisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "./phone";
import { assertSmsConfigured, sendPhoneOtp } from "./sms";
import { phoneDeliveryKey } from "./otp-inbox";

const sessionLifetime = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? 604800);
if (!Number.isSafeInteger(sessionLifetime) || sessionLifetime < 300 || sessionLifetime > 2592000) {
  throw new Error("AUTH_SESSION_TTL_SECONDS must be between 300 and 2592000.");
}

export const auth = betterAuth({
  appName: "Enicharet",
  database: prismaAdapter(getPrisma(), { provider: "postgresql", transaction: true }),
  emailAndPassword: { enabled: false },
  disabledPaths: [
    "/sign-up/email", "/sign-in/email", "/sign-in/phone-number",
    "/phone-number/request-password-reset", "/phone-number/reset-password",
    "/request-password-reset", "/reset-password", "/change-password", "/set-password",
    "/change-email", "/update-user",
  ],
  plugins: [phoneNumber({
    otpLength: 6,
    expiresIn: 300,
    allowedAttempts: 3,
    requireVerification: true,
    phoneNumberValidator: (value) => normalizePhoneNumber(value) === value,
    sendOTP: sendPhoneOtp,
    signUpOnVerification: {
      // Better Auth requires an internal email identifier. Users never enter
      // or receive email; the reserved .invalid domain cannot receive mail.
      getTempEmail: (phone) => `${createHash("sha256").update(phone).digest("hex")}@phone.enicharet.invalid`,
      getTempName: () => "Member",
    },
  })],
  user: {
    additionalFields: {
      role: {
        type: ["USER", "ADMIN"],
        defaultValue: "USER",
        required: true,
        input: false,
      },
      status: {
        type: ["ACTIVE", "SUSPENDED"],
        defaultValue: "ACTIVE",
        required: true,
        input: false,
      },
    },
  },
  session: {
    expiresIn: sessionLifetime,
    disableSessionRefresh: true,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/phone-number/send-otp": { window: 60, max: 3 },
      "/phone-number/verify": { window: 60, max: 10 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== "/phone-number/send-otp" && context.path !== "/phone-number/verify") return;
      const phone = normalizePhoneNumber(context.body?.phoneNumber);
      if (!phone) throw new APIError("BAD_REQUEST", { code: "INVALID_PHONE_NUMBER", message: "Enter a valid phone number." });
      context.body.phoneNumber = phone;
      if (context.path !== "/phone-number/send-otp") return;

      assertSmsConfigured(phone);
      const key = `phone-otp-send:${phoneDeliveryKey(phone)}`;
      const now = BigInt(Date.now());
      // This atomic gate runs before Better Auth creates a new OTP. A rejected
      // resend cannot invalidate the code the user has already received.
      const reserved = await getPrisma().$queryRaw<{ id: string }[]>`
        INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
        VALUES (${randomUUID()}, ${key}, 1, ${now})
        ON CONFLICT ("key") DO UPDATE
          SET "count" = 1, "lastRequest" = EXCLUDED."lastRequest"
          WHERE "RateLimit"."lastRequest" <= ${now - BigInt(60000)}
        RETURNING "id"
      `;
      if (!reserved.length) throw new APIError("TOO_MANY_REQUESTS", {
        code: "OTP_RESEND_TOO_SOON",
        message: "Wait 60 seconds before requesting another code.",
      });
      // Resending replaces the previous challenge rather than leaving older
      // unconsumed codes available after the newest code has been used.
      await context.context.internalAdapter.deleteVerificationByIdentifier(phone);
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          return { data: { ...user, name: user.name.trim(), email: user.email.trim().toLowerCase() } };
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          // The internal adapter shares Better Auth's transaction. During signup,
          // an independent Prisma query cannot see the not-yet-committed user.
          const user = context
            ? await context.context.internalAdapter.findUserById(session.userId)
            : await getPrisma().user.findUnique({ where: { id: session.userId } });
          if (!user || !("status" in user) || user.status !== "ACTIVE") {
            throw new APIError("FORBIDDEN", {
              code: "ACCOUNT_SUSPENDED",
              message: "This account is suspended. Contact support for help.",
            });
          }
          return { data: session };
        },
      },
    },
  },
});
