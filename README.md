# Enicharet

A web-first lowest unique bid auction application.

For the complete project description, read [PROJECT.md](PROJECT.md). For completed
work, known limitations, and the next milestone, read [PROGRESS.md](PROGRESS.md).

## Local development

Use Node.js 24 LTS and npm.

```sh
npm install
npm run db:generate
npm run dev
```

Open http://localhost:3000. The app includes phone OTP accounts, administrator
prize management, public prize browsing, a test-money wallet, and private test bids.
The approved Studio interface includes responsive navigation and a saved
Light / Dark / System appearance selector in the header. Design references and
theme tokens are documented in [DESIGN.md](DESIGN.md).

## Verification

```sh
npm run lint
npm run typecheck
npm run build
```

Run `npm start` after a successful build to serve the production application.

## Project structure

- `src/app`: Pages, layouts, and API route handlers.
- `src/modules`: Domain services, validation, and database queries.
- `src/components`: Shared UI components.
- `src/lib`: Shared database, authentication, and configuration infrastructure.
- `src/worker`: Future background job entry point.

Keep business rules inside modules so API routes and workers can share them.
Accounts, auctions, the test-money wallet, and test bidding are implemented; real
payments and physical prize handover remain future work. Settlement uses TEST funds.

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
The owner confirmed receiving a real test SMS during integration troubleshooting.
This verifies that delivery worked at that time; it does not establish ongoing
provider availability or unrestricted production recipient coverage.

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

## Prize management and browsing

Administrators can open `/admin/auctions`, create a private draft, edit its details,
and publish it. Configure the entry fee in birr, optional per-person bid limit,
opening/closing dates, winner payment window (1–720 hours), and an optional HTTPS
image URL with alternative text. The editor uses Ethiopian time (UTC+3), regardless
of the administrator's device time zone. The database stores UTC timestamps.

Publishing requires a future opening time and locks the prize's details. Unsaved
changes must be saved before publishing. Concurrent edits use the saved revision;
stale requests receive HTTP 409. Published prizes appear at `/prizes` and
`/prizes/[slug]`; drafts are excluded from public pages and APIs. Listings paginate
12 items at a time. Displayed upcoming/open/closed phases are derived from server
time on each request; automatic lifecycle transitions and bid submission come later.
Open prizes now accept test-money bids through the bidding service described below.

The API lives under `/api/v1/auctions` (public reads) and
`/api/v1/admin/auctions` (admin reads/creation), with `GET`/`PATCH` on `/:id` and
`POST` on `/:id/publish`. Writes require an active admin session, same-origin JSON,
and `updatedAt` for edits/publishing. Set `BETTER_AUTH_URL` to the exact app origin.
Fees use integer minor units in storage. Images use administrator-supplied URLs;
file uploads are not implemented yet. No database migration is needed for this stage.

The first collection contains an iPhone 16 Pro, Galaxy S24 Ultra, Toyota Corolla,
necklace/bracelet set, and MacBook Air. They are persistent published catalog
listings, with specifications and fulfillment still to be confirmed. Only TEST
funds can be used; real payments remain unavailable. To populate the collection in another
database, explicitly run:

```sh
npm run db:seed:auctions -- --preview
npm run db:seed:auctions
```

This command preserves existing listings and dates on reruns. New listings open
roughly one day after execution for seven days. See `PROGRESS.md` for the first
collection's actual dates, fees, limits, and payment windows.

Run `npm run test:auctions` for validation/time conversion tests and database-backed
API checks. Integration checks use temporary fictional users, local OTP delivery,
and temporary prizes, then remove those records. They do not send real SMS or
change `.env.local`. Use a development database, as with the auth tests above.

## Test-money wallet

`/wallet` shows the signed-in member's test balance and cursor-paginated history.
`GET /api/v1/wallet` returns `{ wallet: { mode: "TEST", currency: "ETB",
balanceMinor: "..." } }`. `GET /api/v1/wallet/transactions?before=...` returns
`items` and `nextCursor`. Both require an active verified phone session, scope data
to that session's user, and send private/no-store headers. JSON money uses string
minor units; 10001 means 100.01 birr. There is no general-purpose public wallet
write endpoint; bids and offer payments post only their saved TEST amounts.

Migration `20261022000100_test_wallet` adds two tables and database guards:
`WalletAccount` holds test accounts/balance projections; each `WalletTransfer`
records both debit and credit sides. SQL triggers atomically update balances,
prevent user overdrafts, and reject direct balance edits or ledger mutations.
Corrections require an exact reversing transfer; an original can be reversed only
once. Historical account ownership is retained with restrictive foreign keys.
Production database roles must be restricted before live payments; a database
owner can bypass database protections. This is not a tamper-proof ledger.

After a schema/client update, restart your existing development server so it loads
the new Prisma models. Add funds only to an existing verified account locally:

```sh
npm run wallet:credit:test -- "YOUR_PHONE_NUMBER" "100.00" "test-credit-0001"
npm run wallet:check
npm run test:wallet
```

The reference must be 8–100 letters, digits, dots, colons, underscores, or hyphens.
Reusing it with the same account, amount, direction, and description returns the
original transfer without posting again. Changed details produce a conflict. Use
a different reference for an intentionally new credit. The command defaults to
local development only when `NODE_ENV` is unset and refuses production, CI, or
Vercel environments. It has no HTTP equivalent. Never treat this as a deposit.

The test wallet uses ETB exclusively and has no cash value. Available balances use
`BIGINT`, remain nonnegative, and cap at 9,000,000,000,000,000 minor units. The
offsetting test-clearing account can be negative. The TypeScript target is ES2020
to support native exact `bigint`. All money formatting avoids floating point.

`wallet:check` independently compares all projections with ledger movements and
checks that all balances net to zero, without printing customer balances.
`test:wallet` uses a freshly generated `wallet_test_<uuid>` schema, applies the
existing migrations there, runs real auth/API/service checks using local OTPs,
then drops only that disposable schema. It uses `DIRECT_URL` or derives Neon's
direct hostname because pooled connections reject the schema search-path option.
The database role needs schema-creation privileges for these tests. App tables,
existing wallets, and real SMS are not used. Never delete app ledger history to
clean up a test; use the isolated test harness.

## Test-money bidding

On an open prize's detail page, active verified members can submit a bid using
their TEST wallet. The server charges only the fixed entry fee, never the proposed
bid amount. `/bids` and `GET /api/v1/bids?before=...` show only the member's own
bid history, 20 records per page. Other amounts and uniqueness status are private.

`POST /api/v1/auctions/[slug]/bids` accepts exactly:

```json
{ "amount": "1.25", "reference": "unique-request-reference" }
```

Minimum 1.00 birr, at most two decimal places, maximum 21,474,836.47 birr. Repeating
your own amount on the same auction is rejected; another user may submit it.
The request reference follows the wallet's 8–100 character format and is scoped
to the member. Reusing it with the same auction/amount confirms the original bid
without charging again, even after closing. Changing the details returns 409.
The browser retains the same reference on uncertain failures and locks the amount
while offering a retry. The database uniqueness rule also prevents an accidental
second charge for that same user's amount after reloading the browser.

The endpoint requires a cookie session, exact configured origin, JSON body no
larger than 4096 bytes, and allows 30 submission attempts per member per minute.
The client cannot choose an owner, entry fee, ledger account, or LIVE mode.
History responses are private/no-store and reject another member's cursor.

Migration `20261023000100_test_bidding` adds immutable `Bid` records and TEST_FEES
accounts/BID_FEE transfers. PostgreSQL guards require matching bid/fee pairs at
commit. A bid's source account, auction fee, and destination must match, and a
fee cannot be committed without its bid. Transaction locks serialize a member's
submissions, enforce the bid limit, and prevent overdrafts. The database rechecks
its clock when inserting: `opensAt <= now < closesAt`, with status SCHEDULED or
OPEN. A failed bid rolls back the fee, including failures after fee insertion.

```sh
npm run test:bidding
npm run test:wallet
npm run wallet:check
```

Bidding integration tests create a disposable `bidding_test_<uuid>` schema, apply
all migrations, use fictional users/local OTPs and test funds, and remove only
that schema afterward. They exercise the real route handlers without a running
server. Production database users, real SMS, and published prize balances are not
used. Restart the dev server after generating the new Prisma models.

## Test settlement worker and winner offers

Migration `20261023000200_test_settlement` adds durable `SettlementJob`, immutable
`AuctionSettlement`/`SettlementCandidate` ranking snapshots, and `WinnerOffer`
records with guarded PENDING → PAID/EXPIRED transitions. The owner approved
explicit winning-amount payment from the TEST wallet. No automatic winner debit.

After restarting your dev server for the new Prisma models, run the worker in a
separate terminal:

```sh
npm run auctions:worker
```

It polls every five seconds and stops with Ctrl+C. No background worker is
automatically installed or left running by the implementation agent. For a single
bounded run, verification, and regressions:

```sh
npm run auctions:worker -- --once
npm run test:settlement
npm run test:wallet
npm run test:bidding
npm run wallet:check
```

The worker discovers newly published auctions and records their closing schedule.
Job/auction row locks and `SKIP LOCKED` support concurrent processes. Work commits
atomically; interrupted transactions release locks and remain due. A failed job
rolls back to a savepoint and records generic `PROCESSING_FAILED`, an attempt
count, and retry time (5-second exponential backoff capped at 300 seconds).
`--once` exits nonzero when a job needs retry. Monitor `SettlementJob.lastError`
and `attempts` in the database or review them at `/admin/operations`.

At closing the worker snapshots all original amounts appearing exactly once,
ranked ascending. It never recomputes uniqueness after excluding a user. Each
offer gets the configured full payment window from its creation time. Missing a
deadline excludes that user's other amounts for this prize only. An inactive or
unverified candidate is not offered a prize. If no eligible candidate remains,
all entry fees reverse into their original wallets in resumable batches of 25.
Refund failure (for example, a wallet at its technical balance cap) leaves the
job retryable with no partial batch committed. Resolve the cause rather than
editing ledger history. No-candidate completion uses auction status REFUNDED.

Members check `/offers` or `GET /api/v1/offers?before=...` for their own offers.
`POST /api/v1/offers/[id]/pay` accepts an empty JSON object `{}`; authenticated
ownership and the saved offer determine the amount and payer. It uses the same
origin, JSON/body-limit, and per-member attempt safeguards as bidding. Bidding
and payment attempts share the current 30-per-minute limit. Wallet locks prevent
overspending; payment and expiry share job/auction locks, and SQL validates the
deadline again. A paid offer can be retried safely, returning its existing transfer.
The payment and PAID offer must commit together; neither can be orphaned.

`/prizes/[slug]` and its GET API expose a confirmed TEST result (winning amount
and timestamp only), never bidder contact details or the candidate ranking.
Offers are in-app notifications only; SMS/email offer delivery is not enabled.
Without a running worker, closing, reassignment, and refunds wait in the database;
the pay endpoint still rejects an expired deadline while the worker is offline.

`test:settlement` creates a disposable `settlement_test_<uuid>` database schema,
applies all migrations there, uses fictional phones/local OTPs/test funds, and
drops only that schema afterward. It tests original uniqueness, duplicate workers,
reassignment, deadlines, payment retries/ownership, refunds, failure recovery,
privacy, and ledger consistency. No app users/prizes/balances or real SMS are used.

Live deposits/withdrawals, provider callbacks, account recovery, production
operations, and physical prize handover remain unimplemented.

## Temporary administrator test funding

Administrators can add database-backed TEST funds at `/admin/wallet-funding`,
also linked from `/admin`. Choose **My own wallet** or **Another account**, enter
the recipient's registered phone when needed, an amount in birr, and a reason.
The balance and transaction history persist across page reloads and server restarts.
The reason is visible to the recipient; keep sensitive information out of it.

The migration has been applied to this workspace's configured database. For a
different database, run `npm run db:deploy`. Enable the temporary feature locally:

```dotenv
ADMIN_TEST_FUNDING_ENABLED="true"
```

Restart `npm run dev` after changing the flag or applying the Prisma schema.
Use the same origin/port as `BETTER_AUTH_URL` when opening the app. Production,
CI, and Vercel environments reject this feature even if the flag is enabled.
If your verified account does not yet have ADMIN access, the existing owner-run
command is `npm run user:admin -- "YOUR_REGISTERED_PHONE_NUMBER"`.

Each credit and its immutable `AdminWalletCredit` audit save in one transaction.
The record includes the administrator, recipient, reason, time, and transfer.
Retries use the same reference; after a connection error, use **Retry same credit**
without reloading to confirm it safely. A new successful submission is a new credit.
The page lists the issuing administrator's ten latest saved credits.

Set `ADMIN_TEST_FUNDING_ENABLED="false"` and restart to disable it later. Preserve
the ledger and audit table when removing the temporary UI/API. These credits have
no cash value and do not represent real deposits. No balances or admin users are
seeded automatically.

`npm run test:admin-funding` checks the actual API, database ledger, permissions,
idempotency, audit immutability, rollback, and environment guards in a disposable
database schema using fictional accounts and local OTPs. It removes only that
schema afterward, without funding app wallets or consuming SMS credits.

## In-app notifications and auction operations

`/notifications` shows only the signed-in user's auction updates, with unread
counts, read controls, and older-page navigation. New winner offers, missed
deadlines, confirmed TEST payments, and completed fee refunds save durable
`NotificationOutbox` events inside the auction transaction. Refund completion
produces one notice per participant, even for multiple bids. Existing outcomes
are not backfilled. No SMS/email/push delivery is enabled by this feature.

Run both workers in separate terminals alongside `npm run dev`:

```sh
npm run auctions:worker
npm run notifications:worker
```

Both poll every five seconds and stop with Ctrl+C. No daemon is automatically
installed or left running. Bounded processing is also available:

```sh
npm run notifications:worker -- --once
```

Auction processing remains the auction worker's responsibility. The notification
worker delivers in-app receipts only; it never repeats payments, reassignments,
or refunds. Delivery receipts and the outbox delivered marker commit together.
Row locks, unique event/receipt keys, and retries prevent duplicate inbox entries.
Delivery failures retain generic `DELIVERY_FAILED`, attempt count, and an
exponential retry delay from 5 seconds up to 300 seconds. `--once` returns nonzero
when a retry is scheduled. A process crash rolls back uncommitted delivery work.

Refresh the inbox for updates; there is no live push/polling badge yet. Payment
deadlines apply even when delivery is late, so Offers is the authoritative place
to check current payment eligibility. Marking a notice read never accepts an offer.

Administrators can open `/admin/operations` from `/admin` to review active,
retrying, and completed jobs, due work, pending winner deadlines, refunded fee
counts, delivery backlog/failures, and last worker polls. Job lists are paginated;
the delivery retry list shows the next ten failures. Poll timestamps record past
activity and cannot guarantee the worker is currently alive. The monitor does not
change bids, deadlines, or balances. Restricted manual retries can advance the
next processing time of failed work, as described below.

Private APIs: `GET /api/v1/notifications?before=...`,
`POST /api/v1/notifications/[id]/read` with `{}`, and admin-only
`GET /api/v1/admin/operations?view=active|failed|completed&after=...`.
Reads use `private, no-store`; writes require the configured same origin, a
verified active session, JSON, and a bounded body. Recipient identity always
comes from the session. Clients cannot write event contents or delivery states.

Migration `20261025000100_notifications` adds the outbox, inbox, and worker-poll
records. New databases need `npm run db:deploy` and generated Prisma clients.
`npm run test:settlement` now includes notification and operations checks in its
disposable schema: real lifecycle events, concurrent delivery, injected delivery
failure/retry recovery, inbox ownership/pagination/read idempotency, refund
deduplication, admin permission checks, and no repeated financial transactions.
It uses local OTPs and fictional accounts, without touching app balances or SMS.

## Worker-health alerts and audited retries

`/admin/operations` and its private admin GET API now include request-time alerts
for missing worker polls, polls older than 30 seconds, work at least 60 seconds
past its next scheduled attempt, closed published auctions missing a job, and
unfinished work with at least three failures. Refresh to reevaluate alerts.
These alerts are displayed inside the app; no external message or scheduled
monitor is installed automatically.

For a machine-readable health check:

```sh
npm run operations:check
```

Exit codes are 0 for no detected alerts, 1 for attention needed, and 2 when the
database/health check failed. Output contains generic alerts and poll timestamps,
not private records. The check does not start workers or process auctions.

Failed jobs/deliveries whose next attempt is still in the future expose
**Request earlier retry**. Investigate the cause and check that the worker is
running, enter a reason, then choose **Schedule retry now**. This moves only that
item's next attempt forward. It does not execute settlement or delivery in the
HTTP request. Due work is already queued and cannot be repeatedly rescheduled.
Busy worker locks, changed attempt counts, completed items, healthy work, future
auctions, and unexpired winner payment windows are rejected. The reason, actor,
target, failed attempt count, prior schedule, and new schedule are saved atomically
in immutable `OperationRetryAudit` records. The latest 20 are shown on the page.

`POST /api/v1/admin/operations/retry` accepts `kind` (`settlement` or
`notification`), `id`, the observed `expectedAttempts`, `reason` (3–200 characters),
and a stable `reference` (8–100 allowed identifier characters). It requires a
current active verified ADMIN session, same origin, JSON, and a body of at most
4 KB. Permissions are checked/locked again in the transaction. No caller may
submit an arbitrary processing time, user, amount, or deadline. Error/attempt
history is retained. Only one manual retry per target failure attempt is allowed.

On a network/server error, **Confirm same retry** checks the original request
without repeating the action. Keep the page open for that confirmation. If the
target has changed, refresh and review its new status. Reasons are permanent
audit data: do not include secrets or customer contact details.

Migration `20261027000100_operation_retries` adds the audit table and database
checks. The extended `test:settlement` suite includes health threshold unit tests
and isolated database checks for concurrency, worker locks, stale requests,
permission/origin/body guards, audit rollback/immutability, and unchanged financial
records. No recovery requests are automatically submitted against app data.

## Dependency notes

The initial npm audit reports five high-severity findings in the development-only
ESLint dependency chain, originating in `braces`. The suggested automatic fix
downgrades the Next.js ESLint configuration across major versions, so it has not
been applied. Recheck the advisory and compatible updates before release.

The starter uses Google Fonts through `next/font`; the first build needs access
to Google Fonts. Self-host fonts later if offline builds are required.

