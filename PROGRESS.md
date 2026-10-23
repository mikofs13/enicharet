# Enicharet — implementation progress and agent handoff

Last updated: 2026-10-23.

Read [PROJECT.md](PROJECT.md) for the complete product description and auction
rules. This file records implementation state, important findings, and the next
work. Source files are authoritative if this snapshot becomes stale.

## Current position

**Current milestone: test-money bidding.**

The app has phone OTP accounts, protected member/admin access, admin prize drafts,
five published prize listings, and a protected test-money wallet with an immutable
transfer ledger, and private test-money bidding. Winner selection and real money
are not implemented. Next is durable auction closing and winner offers.

## Completed work

### 1. Application and database foundation

- Next.js App Router, React, TypeScript, Tailwind, and npm scripts configured.
- Responsive Enicharet home and account interfaces with the requested bold,
  premium charcoal/gold design.
- Hosted Neon PostgreSQL connected through Prisma's PostgreSQL adapter.
- Shared server-only Prisma client with a small reusable connection pool.
- Environment loading for both Next.js and Prisma CLI.
- Database connectivity check that avoids exposing credentials or records.
- Three migration directories on disk:
  - `20261020000100_foundation`: users, auctions, images, and CHECK constraints.
  - `20261020000200_authentication`: auth/session/verification/rate-limit tables
    and a case-insensitive email uniqueness index.
  - `20261020000300_phone_otp`: verified-phone support.
- These migrations were applied during setup. A new database still needs
  `npm run db:deploy`; do not assume its migration state matches this workspace.
- No automatic seed users, admin accounts, or real prizes.

### 2. Phone-number authentication and account access

- Better Auth phone-number plugin integrated.
- Shared request-code/verify-code flow on `/register` and `/login`.
- Ethiopian local phone input normalized to E.164.
- Account created only after successful phone verification.
- Six-digit OTP, five-minute expiry, and three allowed wrong attempts.
- Atomic per-phone resend cooldown: one request per 60 seconds.
- Database-backed IP rate limits supplement phone/challenge limits.
- Resends replace old challenges; challenge consumption is tested against reuse
  and concurrent verification.
- Database-backed sessions with signed HTTP-only cookies, default seven-day
  fixed lifetime, no sliding refresh or cookie session cache.
- Logout, account suspension checks, and fresh role checks on protected requests.
- Public signup cannot set role/status. Email/password and generic profile
  mutation endpoints are disabled.
- Internal opaque `.invalid` email identifier for Better Auth compatibility.
- Protected member page, admin overview, access-denied and suspension pages.
- Admin promotion utility for an existing active verified phone account.
- Server page guards separated from request/session validation.

Important files:

| File | Responsibility |
| --- | --- |
| `src/modules/accounts/auth.ts` | Better Auth configuration and OTP hooks |
| `src/modules/accounts/auth-form.tsx` | Phone/code form and step transitions |
| `src/modules/accounts/auth-client.ts` | Browser auth client |
| `src/modules/accounts/session.ts` | Session validation and fresh user permissions |
| `src/modules/accounts/page-guards.ts` | `requireUser()` / `requireAdmin()` |
| `src/modules/accounts/phone.ts` | Phone normalization |
| `scripts/make-admin.ts` | Local administrator promotion command |

### 3. SMS transport and reported form issues

- Server-only SMS Ethiopia v2 integration.
- Uses `KEY` header and the provider's `msisdn`/`text` JSON payload.
- Ten-second timeout, redirect rejection, no automatic resend/retry, and success
  only when the provider returns HTTP success plus `sent: true`.
- Sanitized application errors; no logging of keys, recipient numbers, or OTPs.
- Development-only `.local/sms/` inbox and local inbox-reading command.
- Development delivery fails closed in production; no silent fallback.
- Configuration errors were diagnosed: the live mode value is `smsethiopia`,
  not `production`. Restart the app after configuration changes.
- After delivery troubleshooting, the owner explicitly confirmed receiving a
  real SMS. This confirms that test delivery succeeded at that time, not ongoing
  provider availability or unrestricted production coverage.
- The owner reported that “Send code” did not reveal the code field. The form
  flow was investigated, and an “Already have a code? Enter it” action was added
  so a received code can be entered without spending another SMS.
- Send/OTP-entry UI behavior was checked during the earlier milestone. Do not
  claim the owner's complete live login was independently observed end to end.

Transport files: `sms.ts`, `smsethiopia.ts`, and `otp-inbox.ts` under
`src/modules/accounts/`.

Current adapter supports documented Ethiopian `+2519…` recipients. It does not
enable Ethiopian 07 numbers or other countries. The trial requires verified test
recipients. Recheck provider documentation if changing these assumptions.

### 4. Auction administration and public browsing

- Admin listing and private draft creation/editing.
- Title and plain-text description validation.
- Exact entry-fee parsing into integer hundredths of a birr.
- Optional positive per-person bid limit; blank means unlimited.
- Opening/closing times and a winner payment window of 1–720 hours.
- Ethiopian-time editor with explicit UTC conversion independent of device time.
- Optional public HTTPS image URL and required image description when supplied.
- Stable generated slugs and 12-item pagination.
- Publishing requires a future opening time and changes status to `SCHEDULED`.
- Published auction details are locked.
- Unsaved form changes must be saved before publishing is offered.
- Row locks and saved `updatedAt` revisions protect against conflicting edits
  and concurrent publication; stale requests return 409.
- Active-admin checks, same-origin JSON writes, and no-store API responses.
- Public list/detail pages and read APIs exclude drafts.
- Home, navigation, account, and admin overview link to the new features.
- Public pages clearly state that bid submission and wallet payments are not
  available yet.

Important files:

| File | Responsibility |
| --- | --- |
| `src/modules/auctions/service.ts` | Database queries, creation/editing/publishing |
| `src/modules/auctions/validation.ts` | Fee, dates, fields, and revision validation |
| `src/modules/auctions/presentation.ts` | Money, time conversion, displayed phase |
| `src/modules/auctions/api.ts` | Admin/origin checks and safe API errors |
| `src/modules/auctions/admin-form.tsx` | Draft form, dirty-state guard, publishing |
| `src/modules/auctions/components.tsx` | Shared image and pagination UI |
| `src/app/auctions.css` | Auction/prize styles |

No database migration was needed for this milestone; it uses the existing auction
and image models. There is one optional image in the current form, although the
database relation can represent multiple images.

### 5. First published prize collection

The owner requested smartphones, a car, jewelry, and another selected category.
Five persistent `SCHEDULED` records were created on 2026-10-22:

| Prize | Fee per bid | Bid limit/person | Winner payment window |
| --- | --- | --- | --- |
| Apple iPhone 16 Pro | 25.00 birr | 10 | 24 hours |
| Samsung Galaxy S24 Ultra | 25.00 birr | 10 | 24 hours |
| Toyota Corolla | 250.00 birr | 5 | 72 hours |
| Necklace & Bracelet Set | 50.00 birr | 10 | 48 hours |
| Apple MacBook Air | 50.00 birr | 10 | 24 hours |

All five open 2026-10-23 at 21:00 EAT and close 2026-10-30 at 21:00 EAT
(`18:00 UTC`). These are initial catalog settings selected during implementation,
not independently confirmed commercial terms. Bidding and payments remain absent.
Descriptions identify unconfirmed specifications, inventory, and fulfillment
details rather than claiming that prizes are owned or available. No product
photos were supplied; the existing image placeholders are used.

`scripts/seed-auctions.ts` and `npm run db:seed:auctions` provide explicit catalog
setup. `-- --preview` checks which entries exist without writing. Stable slugs
and transactional upserts preserve existing records on reruns: they do not reset
dates, overwrite edits, or republish records. The command does not run at startup.
For a new empty database, its opening time is roughly one day after execution
and its duration is seven days. The dates above describe this database's first run.

Verification: the initial preview found zero auctions; the write completed and
read back all five records with valid dates and fees. The public `/prizes` page
was checked and displayed all five titles, fees, and closing dates. No migration,
user-role change, SMS send, or money movement was performed for this task.

### 6. Test-money wallet foundation

- Added and applied migration `20261022000100_test_wallet`; no existing tables,
  users, auctions, or prize records were reset or replaced.
- `WalletAccount`: one optional account per user plus a system test-clearing
  account, fixed TEST mode/ETB currency, BIGINT minor-unit balance projection.
- `WalletTransfer`: one immutable record representing equal debit/credit sides,
  unique operation key, amount, reason, source/destination, timestamp, and optional
  unique reference to the transfer being reversed.
- SQL triggers atomically apply both sides, lock accounts in a consistent order,
  enforce nonnegative user balances, and block direct balance edits, ledger
  update/delete/truncate, nonzero account initialization, and identity changes.
- A reversal must exactly swap original accounts and amount. Reversing a reversal
  and reversing the same original twice are rejected. There is no public reversal
  endpoint or administrative adjustment UI.
- Server-only `postTestMovement` performs trusted local test credits/debits with
  active verified-user checks, a per-operation transaction advisory lock,
  matching-payload retry semantics, and insufficient-funds checks.
- Local postings reject production, CI, and Vercel. No public posting endpoint or
  account-to-account user transfer feature exists.
- `/wallet` shows test balance, ETB currency, and 20-item cursor-paginated history.
  It reads balance/history in one Repeatable Read database snapshot. No database
  wallet is created merely by viewing an empty balance.
- Read APIs scope every query to the authenticated active verified member. Amounts
  are JSON decimal strings in minor units; private/no-store responses prevent
  caching. Foreign transaction cursors do not reveal another user's history.
- `wallet:credit:test` adds local test funds using a caller-provided stable retry
  reference. `wallet:check` independently reconciles projections with ledger sums
  and verifies zero net balance across user/system accounts.
- TypeScript target is ES2020 for native bigint. A stale generated
  `tsconfig.tsbuildinfo` retained old target diagnostics during development;
  removing that generated file resolved the incremental check. Do not weaken
  exact arithmetic to work around stale diagnostics.
- No funds were added to existing user wallets as part of implementation. The
  first read-only reconciliation reported zero accounts/transfers and no mismatch.

Important files: `src/modules/wallet/{money,service,api}.ts`,
`src/app/wallet/{page,error}.tsx`, `src/app/wallet.css`,
`scripts/{wallet-credit-test,check-wallet,test-wallet,wallet.test}.ts`.

The wallet is a test-money foundation, not a production custody or payment system.
Database-owner privileges can bypass triggers; least-privilege production database
roles remain launch work. The shared test-clearing row also serializes test
postings; live fee-account design and measured contention need review before any
capacity claim. Do not use the local posting function as a public bid-fee API:
bid creation and its ledger transfer must share one database transaction.

### 7. Test-money bidding (2026-10-23)

- Owner approved a 1-birr minimum, preventing a user's repeated amount on the
  same auction, and hiding other bidders' amounts/uniqueness until closing.
- `Bid` model and migration `20261023000100_test_bidding`, applied without
  resetting users, prizes, or existing ledger records.
- Signed 32-bit minor-unit bids: 1.00–21,474,836.47 birr, no excess precision.
- Equal amounts from different users are accepted; one user's duplicate is not.
- Immutable bids linked uniquely to their exact BID_FEE transfer. Deferred SQL
  constraints prevent orphan fees; insert guards require the right source user,
  entry fee, auction-specific destination, state, window, and bid limit.
- `src/modules/wallet/posting.ts` posts a fee using the bidding transaction;
  it does not commit independently or expose a public wallet-write endpoint.
- TEST_FEES accounts collect each auction's fees separately; balances remain
  part of the same zero-net TEST ledger. The proposed bid amount is not debited
  or reserved.
- `placeBid` uses a per-member advisory lock, active verified-user checks,
  database clock, auction share lock, wallet locks, saved fee snapshot, and an
  operation key scoped to that member. Replays return the same bid even after
  close; mismatched payload reuse is a conflict.
- POST endpoint validates same-origin JSON, caps bodies at 4096 bytes, and uses
  a database-backed limit of 30 attempts per minute per authenticated member.
- Client form retains the original retry reference on network/server uncertainty
  and prevents editing the pending amount. No automatic winner/payment action.
- Protected `/bids` page/API with owned cursor pagination. Public prize reads
  still expose neither bid amounts nor uniqueness, even after closing until a
  future results feature is implemented.
- Tests cover accepted fees, replays/races, limits, same-user duplicate rejection,
  cross-user matching amounts, sealed history, state/window checks, concurrent
  spending, insufficient funds, orphan fee/unpaid bid rejection, immutable bids,
  pagination, suspension, request limits, and net-zero account balances.

Important files: `src/modules/bidding/{validation,service,api,bid-form}.ts(x)`,
`src/modules/wallet/posting.ts`, `src/app/bids/page.tsx`,
`src/app/api/v1/auctions/[slug]/bids/route.ts`, `src/app/api/v1/bids/route.ts`,
and `scripts/{bidding.test,test-bidding}.ts`.

Verification for this milestone: production build/type checking and lint passed;
the isolated bidding suite passed, including rollback after a fee was inserted
and simultaneous first-fee-account creation by two different users;
the existing isolated wallet regression suite passed. App ledger reconciliation
still reported zero accounts/transfers and no mismatches. Browser checks covered
owned empty bid history, mobile layout without horizontal overflow, and gating
the published iPhone listing before its opening time. The actual form submission
was integration-tested through the real API handlers, not browser-submitted
against the owner's prize or account. Screenshot: `artifacts/my-bids-mobile.png`.
The temporary browser preview on port 3002 was stopped; existing servers were left
alone. Restart the owner's dev server after this schema/client change.

## Available routes

| Route | Purpose/access |
| --- | --- |
| `/` | Public home |
| `/register`, `/login` | Phone OTP access |
| `/account` | Active verified member |
| `/admin` | Admin overview |
| `/admin/auctions` | Admin prize list |
| `/admin/auctions/new` | Admin draft creation |
| `/admin/auctions/[id]` | Admin draft editing or published summary |
| `/prizes`, `/prizes/[slug]` | Public published prizes |
| `/access-denied`, `/account-suspended` | Access feedback |
| `/api/auth/[...all]` | Better Auth handlers |
| `/api/v1/me` | Current active verified user |
| `/wallet` | Protected test balance and transaction history |
| `/bids` | Protected personal bid history |
| `/api/v1/bids` | GET personal cursor-paginated bid history |
| `/api/v1/auctions/[slug]/bids` | POST an authenticated test-money bid |
| `/api/v1/wallet` | Protected GET current user's test balance |
| `/api/v1/wallet/transactions` | Protected GET cursor-paginated personal history |
| `/api/v1/admin/overview` | Admin counts |
| `/api/v1/auctions` | Public GET listing |
| `/api/v1/auctions/[slug]` | Public GET detail |
| `/api/v1/admin/auctions` | Admin GET listing / POST draft |
| `/api/v1/admin/auctions/[id]` | Admin GET detail / PATCH draft |
| `/api/v1/admin/auctions/[id]/publish` | Admin POST publication |

## Verification evidence and limits

At the end of the auction milestone, these checks passed:

- `npm run lint` and targeted ESLint after later edits.
- `npm run typecheck`; the subsequent final production build also type-checked.
- `npm run build` after fixing request-time rendering.
- Four auction unit tests: exact fees/overflow, input validation including invalid
  calendar dates, Ethiopian time conversion, and date-phase boundaries.
- Database-backed auction integration checks: anonymous/member/suspended access,
  cross-origin rejection, invalid input, draft invisibility, stale revisions,
  concurrent publish requests, public visibility, and published edit locking.
- Browser verification of the public prize empty state and member denial from
  the admin editor. Mobile viewport check showed no horizontal overflow.
- Temporary test users/prizes were removed by integration-test cleanup.

Earlier authentication/SMS milestone checks covered the transport mocks and
real Better Auth handlers: OTP expiry/attempts/reuse/races, account creation,
session permissions, suspension, logout, endpoint rejection, and rate limits.

Wallet milestone checks passed:

- Schema validation, production build/type check, standalone `npm run typecheck`,
  and ESLint.
- Money boundary/formatting tests and production/CI/deployment posting guards.
- Disposable-schema integration tests using real auth handlers: retries and
  conflicting references, concurrent debits, direct-SQL overdrafts, append-only
  guards, exact and duplicate reversals, rollback, snapshot reads, pagination,
  ownership/foreign-cursor denial, suspension, and independent ledger sums.
- The harness applies all four migrations in a generated `wallet_test_<uuid>`
  schema through a direct database connection, then drops only that schema. It
  overrides SMS delivery only inside its process and sends no real messages.
- Read-only reconciliation against app tables: zero mismatches and net zero.
- Production-preview browser check of the protected wallet's zero balance and
  empty history; mobile viewport had no horizontal overflow. Saved preview:
  `artifacts/test-wallet-mobile.png`. Existing member funds were not changed.

Limitations of this evidence:

- Earlier auth/auction regression suites were not all rerun for the wallet
  milestone; the wallet integration harness exercises the real auth handlers.
- The final auction milestone did not browser-test every admin form interaction
  with an administrator identity; protected API behavior was integration-tested.
- There has been no production deployment, capacity/load test, payment test, or
  full auction settlement test. Those features are absent.
- Do not send real SMS just to rerun ordinary tests: auth/auction integration
  scripts force local delivery inside their process without editing `.env.local`.

## Not implemented

- Real deposits, withdrawals, withdrawal holds, or payment-provider integration.
- Automatic auction state transitions and durable job scheduling.
- Unique-bid ranking, winner offers, payment, reassignment, or fee refunds.
- Public winner announcements and notification delivery beyond account OTPs.
- Auction cancellation/refund administration, user-management UI, or audit UI.
- About/contact pages, customer-support tools, image uploads, or mobile apps.
- Account recovery/phone changes and additional administrator protection.

## Next milestone: auction closing and winner offers

1. Choose a durable scheduling mechanism and add idempotent job/offer records.
2. Close auctions using server/database time and coordinate with in-flight bid
   transactions through the existing auction locks. The date label is not a job.
3. Snapshot original amounts with exactly one bid and rank them ascending. Never
   recalculate uniqueness after removing nonpaying users.
4. Create a winner offer and payment deadline. Missing payment excludes all of
   that user's bids from this auction only, then advances to the next originally
   unique eligible user. Do not globally suspend the member.
5. Resolve the winner's payment action before implementing its debit; no automatic
   charge has been agreed. Keep test money explicit.
6. Design auditable refunds if no eligible bidder remains. Preserve immutable
   bid/ledger history and use reversing entries, not deletes.
7. Test duplicate jobs, close/submit races, eligibility snapshots, payment/deadline
   races, user exclusion, retries, and no-candidate behavior.

## Following milestones

1. **Bidding:** implemented with TEST funds; run regression tests when extending
   it and measure contention before claiming capacity.
2. **Closing and winner offers:** durable idempotent worker, original unique-bid
   eligibility snapshot, ranking, deadline offers, and per-auction user exclusion.
3. **Winner payment and refunds:** confirmed payment action, deadline/payment
   race handling, reassignment, no-candidate refunds, and auditable settlement.
4. **Real money:** choose providers, verified/deduplicated webhooks, withdrawal
   workflow, reconciliation, operational limits, and failure handling.
5. **Product completion:** announcements, support, about/contact pages, uploads,
   operational administration, and launch verification.
6. **Capacity/mobile:** define workload and measure performance; choose deployment
   and mobile architecture using measured needs.

## Operational commands

```sh
npm install
npm run dev
npm run db:validate
npm run db:generate
npm run db:deploy
npm run db:check
npm run lint
npm run typecheck
npm run build
npm run test:sms
npm run test:auth
npm run test:auctions
npm run test:wallet
npm run test:bidding
npm run wallet:check
```

Run database-backed tests against a development database. `npm run test:auctions`
runs both pure validation tests and integration tests; it needs database access.
Wallet tests need schema-creation privileges and a direct database connection;
Neon's pooled endpoint rejects the schema search-path startup option. The test
harness derives the direct Neon hostname as migrations do, unless `DIRECT_URL`
is supplied. It does not use the app's existing ledger for test cleanup.
Builds currently fetch Google Fonts. Network-restricted agent environments may
need approved network execution for the hosted database or font requests.

Promote an existing verified account locally, only when appropriate:

```sh
npm run user:admin -- "YOUR_PHONE_NUMBER"
```

Read a development OTP only when local delivery mode is in use:

```sh
npm run sms:inbox -- "YOUR_PHONE_NUMBER"
```

Add local test funds to an existing active verified account:

```sh
npm run wallet:credit:test -- "YOUR_PHONE_NUMBER" "100.00" "test-credit-0001"
```

Reuse that reference to retry the exact same credit; choose a new reference only
for an intentional additional credit. This is not a real-money deposit.

Never paste the resulting OTP or any private configuration into handoff files.
See `.env.example` and `README.md` for configuration names and setup instructions.

## Findings future agents should preserve

- **Installed Next.js docs:** follow `AGENTS.md`; read relevant guides under
  `node_modules/next/dist/docs/` before code changes. This version enables Cache
  Components and partial prefetching; do not rely solely on older Next patterns.
- **Dynamic pages:** protect async request content with Suspense. The public prize
  pages explicitly call `await connection()` before database access. Without it,
  runtime prerendering attempted an unstable `crypto.randomUUID()` inside database
  infrastructure. Build success alone did not catch that request-time issue.
- **CSS:** `globals.css` holds Tailwind setup. App styles are separately imported
  plain `accounts.css` and `auctions.css`. Earlier custom styling in the Tailwind
  file had a development caching issue; preserve the working split.
- **Prisma reload:** restart a dev server after client generation for schema
  changes; an existing global client can retain the old model.
- **Database safety:** preserve migration-level CHECK constraints and expression
  indexes that Prisma's model cannot fully represent. Never reset a shared DB
  merely to resolve drift.
- **Authentication:** role/status checks must remain server-side and fresh.
  A database email field or Better Auth `Account.password` field does not mean
  email/password login is enabled.
- **Publication versus jobs:** date labels do not implement lifecycle workers.
  No bid or wallet functionality should be inferred from `OPEN` or other enums.
- **Images:** current remote images are unoptimized Next Image components, so
  image URLs are rendered without a server image-optimization fetch. Consider
  storage/host policies when adding uploads or optimization later.
- **Dependencies:** earlier npm audit reported five high-severity findings in the
  development ESLint/braces chain. The suggested automatic fix downgraded the
  Next ESLint configuration across major versions and was not applied. Re-audit
  before release rather than assuming the old count remains current.
- **PostgreSQL warning:** the driver emits a future SSL-mode semantics warning
  for current configuration. Do not weaken certificate verification to silence it.
- **Process ownership:** the owner previously asked to manage the dev server.
  Do not kill their server to free a port. The temporary verification server on
  port 3001 was stopped; the last observed port 3000 server was left untouched.
  Process state is transient and must be checked again when needed.
- **Version control:** earlier checks found no initialized `.git` directory in
  this workspace. Files and migrations exist on disk; do not claim they were
  committed, pushed, or deployed. Recheck Git state before Git operations.

## Suggested prompt for another agent

> Read AGENTS.md, PROJECT.md, PROGRESS.md, and README.md. Verify the current
> repository state before editing. Continue with the auction closing/winner-offer milestone
> described in PROGRESS.md, keeping the TEST wallet ledger, phone-only Better Auth
> login, and existing
> auction rules intact. Read the relevant installed Next.js documentation, avoid
> exposing secrets or sending real SMS in tests, run meaningful checks, and update
> the handoff documents with completed work and the next step.
