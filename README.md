# Enicharet

A web-first lowest unique bid auction application.

## Local development

Use Node.js 24 LTS and npm.

```sh
npm install
npm run db:generate
npm run dev
```

Open http://localhost:3000. The home page currently uses the Next.js starter.

## Verification

```sh
npm run lint
npm run typecheck
npm run build
```

Run `npm start` after a successful build to serve the production application.

## Project structure

- `src/app`: Pages, layouts, and future API route handlers.
- `src/modules`: Domain services, validation, and database queries.
- `src/components`: Shared UI components.
- `src/lib`: Shared database, authentication, and configuration infrastructure.
- `src/worker`: Future background job entry point.

Keep business rules inside modules so API routes and workers can share them.
Modules are placeholders, ready for implementation.

## Auction rules

- Every accepted bid immediately charges a fixed entry fee.
- Only the winner pays their bid amount, within a payment deadline.
- At closing, rank amounts submitted exactly once, lowest first.
- Missing payment excludes all that user's bids for that auction only.
- Duplicate amounts remain disqualified throughout reassignment.
- If no eligible candidate remains, refund all entry fees for the auction.
- Administrators can set per-user bid limits.
- Store money as integer hundredths of a birr.

## Database foundation

Create a Neon development database. Copy `.env.example` to `.env.local` and replace
`DATABASE_URL` with its pooled PostgreSQL connection string. Never commit this file
or prefix database credentials with `NEXT_PUBLIC_`.

Both Next.js and the Prisma CLI load `.env.local` through `@next/env`. For migrations,
`prisma.config.ts` uses `DIRECT_URL` when set, or derives Neon's direct hostname from
`DATABASE_URL`. The app always uses `DATABASE_URL`. Keep app and database hosting in
the same region when deploying.

```sh
npm run db:validate
npm run db:generate
npm run db:deploy
npm run db:check
```

`db:deploy` applies committed migrations. Use it to set up another empty database.
When intentionally changing the schema during development, use
`npm run db:migrate -- --name descriptive_change`, review the generated SQL, and
commit the migration. Never reset a shared database to resolve migration drift.

The first migration defines users, auctions, and auction images. PostgreSQL CHECK
constraints protect contact information, schedules, fees, bid limits, and image
positions. Prisma does not represent these checks in the schema, so preserve them
when reviewing future migrations. No users or prizes are seeded automatically.

`src/lib/prisma.ts` exports the server-only `getPrisma()` client. It reuses a small
connection pool across development reloads. `npm run db:check` verifies connectivity
and table access without printing credentials or user records. It exits nonzero on
failure; inspect your local configuration/provider dashboard if it fails.

The second migration adds Better Auth sessions, credential accounts, verification
records, and shared rate-limit storage. It also adds a case-insensitive email
uniqueness index. Preserve this expression index when reviewing later migrations.

## Accounts and administrator access

Accounts use a phone number and a six-digit OTP through Better Auth's phone-number
plugin. No email address or password is requested. The first successful OTP creates
an account; later verifications sign in to that same account. Ethiopian local input
is normalized to E.164, so `0912 345 678` and `+251912345678` identify the same user.

Settings in `.env.local`:

```dotenv
BETTER_AUTH_SECRET="your-unique-random-secret-at-least-32-characters-long"
BETTER_AUTH_URL="http://localhost:3000"
AUTH_SESSION_TTL_SECONDS="604800"
AUTH_SMS_MODE="development"
SMSETHIOPIA_API_KEY=""
```

The local auth secret was generated during setup. Use a different secret and your
exact HTTPS app URL in production. Restart the app after changing auth settings.

Sessions use signed HTTP-only cookies and database records. The default lifetime is
seven days with no sliding extension. `AUTH_SESSION_TTL_SECONDS` accepts 300–2592000
seconds. Logout revokes the session. OTPs expire in five minutes, allow three wrong
attempts, and are consumed atomically so the same challenge cannot create two sessions.
Sending a new code replaces the old challenge. Resending is limited to once per phone
per 60 seconds across app instances, in addition to IP-based rate limits.

### SMS Ethiopia delivery

The server-only adapter follows the provider's v2 API:

- Endpoint: `https://smsethiopia.com/api/v2/sms/send`.
- Header: `KEY`, containing your private campaign API key.
- JSON body: `msisdn` without the leading `+`, and an English OTP message under 160 characters.
- Only an HTTP success with `sent: true` counts as accepted. Accepted means queued,
  not guaranteed handset delivery. Requests time out after ten seconds, reject
  redirects, and are not automatically retried to avoid duplicate SMS charges.
- Raw provider responses, OTPs, recipient numbers, and API keys are not logged.

To enable real delivery:

1. Register at [SMS Ethiopia](https://smsethiopia.com/).
2. Verify your own phone and any other test recipients in the provider dashboard.
3. Generate an API key scoped to the test campaign.
4. Put the key in `SMSETHIOPIA_API_KEY` locally and set `AUTH_SMS_MODE="smsethiopia"`.
5. Restart the app, then request a code using your verified test number.

The provider documents 100 free test messages restricted to dashboard-verified
recipients. This is a trial allowance, not unlimited free production SMS. Its API
reference currently accepts `2519` followed by eight digits; other countries and
Ethiopian 07 numbers are rejected by this adapter before sending. Confirm expanded
carrier coverage with the provider before enabling additional number ranges.

Reference: [API v2](https://smsethiopia.com/#/landing/docs/api-v2),
[provider errors](https://smsethiopia.com/#/landing/docs/errors).
The API key and live handset delivery have not been verified during setup.

### Local development messages

With `AUTH_SMS_MODE="development"`, `next dev` writes OTPs to an ignored `.local/sms/`
folder. No text message is sent. After requesting a code in the app, read it locally:

```sh
npm run sms:inbox -- +251912345678
```

There is no public inbox endpoint or browser response exposing codes. This transport
is refused in production, even if the development flag is accidentally left set.
Missing or invalid production provider settings fail closed; there is no fallback.
Do not share the inbox files or use local delivery for a publicly accessible app.

### Routes and privileges

- `/login` and `/register`: the same request-code and verify-code flow.
- `/account`: protected phone-based member page and logout.
- `/admin`: administrator-only overview.
- `/api/auth/phone-number/send-otp` and `/api/auth/phone-number/verify`: Better Auth endpoints.
- `/api/v1/me`: active verified phone user; 401 without valid authentication, 403 if suspended.
- `/api/v1/admin/overview`: administrator-only overview counts.

Password login, email signup, password reset, and generic profile mutation endpoints
are disabled. Better Auth still uses an internal email identifier in its core data
model; phone accounts receive an opaque address under the reserved `.invalid` domain.
It is not an email login, is never requested from users, and receives no messages.
The app's own user API and account page expose the verified phone instead.

Public verification always creates an active `USER`; role/status fields cannot be
assigned by callers. To grant your own verified account administrator access:

```sh
npm run user:admin -- +251912345678
```

Existing email-account data is preserved. Old email-only sessions no longer authorize
app access. Accounts are not automatically merged or assigned a phone number; grant
admin access to your verified phone account with the command above if needed.

New protected pages must call `requireUser()` or `requireAdmin()`. API routes must
check `getSessionUser()`, status, and permissions before reading or changing data.
Role changes and suspensions take effect on subsequent protected requests.
Page guards live in `src/modules/accounts/page-guards.ts`; request-level session
validation lives separately in `src/modules/accounts/session.ts`.

### Authentication verification

```sh
npm run test:sms
npm run test:auth
```

The SMS adapter tests mock all network calls. The auth tests run Better Auth's real
request handler and the protected API handlers in an isolated process, force local
SMS delivery without editing `.env.local`, and use temporary fictional phone numbers
in the configured development database. No running web server or SMS credits are
needed. Temporary users, challenge records, inbox files, and test rate-limit entries
are removed afterward. Do not point test configuration at a production database.
For an additional check through the actual local Next.js routes, keep the server
in development SMS mode and run in PowerShell:

```powershell
$env:AUTH_TEST_OVER_HTTP='1'
npm run test:auth
Remove-Item Env:AUTH_TEST_OVER_HTTP
```

Restart the development server after generating a Prisma client for schema changes;
the singleton database client can otherwise retain its old data model in memory.

The tests cover password-endpoint rejection, phone validation, delayed account
creation, wrong/expired/replayed OTPs, resend cooldown, concurrent verification,
role escalation, admin permissions, suspension, session expiry, logout, and rate limits.

Before deployment, configure the trusted proxy/IP headers for the chosen host and
ensure the proxy overwrites client-supplied forwarding headers. Test through that
host, and add cleanup for expired sessions, verification and rate-limit records.
Further launch work includes account recovery, phone-change handling and additional
administrator protection. Phone changes are not offered in this first UI.

Next: auction creation and prize browsing, then a test-money wallet, bidding, and
settlement. Payments and background jobs are not implemented yet.

## Dependency notes

The initial npm audit reports five high-severity findings in the development-only
ESLint dependency chain, originating in `braces`. The suggested automatic fix
downgrades the Next.js ESLint configuration across major versions, so it has not
been applied. Recheck the advisory and compatible updates before release.

The starter uses Google Fonts through `next/font`; the first build needs access
to Google Fonts. Self-host fonts later if offline builds are required.

