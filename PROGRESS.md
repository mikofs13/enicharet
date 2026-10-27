# Enicharet — implementation progress and agent handoff

Last updated: 2026-10-27.

Read [PROJECT.md](PROJECT.md) for the complete product description and auction
rules. This file records implementation state, important findings, and the next
work. Source files are authoritative if this snapshot becomes stale.

## Current position

**Current milestone: public prize collection homepage and gated prize details.**

The app has phone OTP accounts, protected member/admin access, admin prize drafts,
five published prize listings, and a protected test-money wallet with an immutable
transfer ledger, private test-money bidding, durable closing jobs, winner offers,
explicit TEST winner payments, reassignment, and fee refunds. Real money is not
implemented. Administrators can now add persistent TEST credits through a temporary
admin page. Private notification delivery, worker-health alerts, and a restricted
admin operations monitor with audited retries are implemented. Next is production
worker supervision and external monitoring, restart/recovery and load verification,
external notification preferences/delivery, then live-provider readiness.

## Completed work

### Collection homepage and prize login flow (2026-10-27)

- Replaced the separate landing page with the existing database-backed prize
  collection at `/`, accessible whether signed in or signed out. Pagination now
  uses `/?page=...`; `/prizes` redirects to the new home, preserving valid pages.
- Prize detail pages run the existing verified-user/active-account guard before
  fetching the prize. Signed-out clicks and direct detail URLs lead to `/login`.
  Successful OTP verification returns to `/`, where signed-in users can open prizes.
  Logout also returns to the public collection. No arbitrary redirect URL accepted.
- Updated collection navigation, all-prizes/back links, account/bid empty states,
  footer links, and auth-page instructions. Added a How it works anchor beside the
  collection introduction and a guide beneath the grid, including payment deadlines,
  duplicate amounts, fees, reassignment, and test-only limitations.
- No authentication service, financial rule, API permission, or database schema changed.
- Verification: lint, type checking, and production build passed. Signed-out
  production browser checks verified the real collection at `/`, prize-card login
  redirect, legacy pagination redirect, How it works/back anchors, and no horizontal
  overflow at 320px. Screenshot: `artifacts/collection-homepage.png` (viewport crop).
  Fresh SMS verification and signed-in detail viewing were not exercised in-browser;
  the existing verified-user guard and changed success destination were inspected.
  Temporary preview was stopped after verification.

### Appearance toggle and navigation motion (2026-10-27)

- Replaced the appearance dropdown with an accessible sun/moon switch. System
  is the default until a manual preference is saved; the adjacent System/monitor
  button restores automatic mode. Its pressed state indicates system-following.
- Retained first-paint theme setup, cross-tab synchronization, OS change handling,
  and current-page operation when storage is blocked.
- Added a 220ms main-content route entrance using the Web Animations API and
  pathname changes, without resetting form state or delaying links. The observer
  streams under Suspense for Next.js dynamic-route prerender compatibility.
- Added brief theme/control color transitions, a menu reveal, and subtle arrow
  feedback. Reduced-motion disables CSS animation and route entrances, and cancels
  an active entrance when the preference changes. No animation library added.
- Verification: lint, type checking, and production build passed. Production
  browser checks confirmed system default, manual toggle, reload persistence,
  System reset, menu navigation, and no horizontal overflow at 320px. Console
  contained no errors. Reduced-motion behavior was source-reviewed. Screenshot:
  `artifacts/studio-theme-toggle.png`. Temporary production preview was stopped.

### Studio interface and Light / Dark / System (2026-10-27)

- Implemented the owner's approved first design direction: cobalt and apricot,
  strong Geist headings, a split homepage hero, featured prize, related prize
  rows, and a clear explanation of fees and winner payments.
- Homepage and prize cards use actual published database records and links.
  Missing images use clearly labeled, category-specific illustrations; supplied
  database images continue to render. No sample auctions replace real records.
- Shared tokens in `src/app/studio.css` restyle public, account, wallet, bidding,
  offer, notification, and administration surfaces. The header has active links,
  session-aware navigation, an accessible mobile menu, and an appearance selector.
- Light, Dark, and System preferences persist locally and synchronize across tabs.
  A static first-paint script sets the effective theme before hydration; System
  follows the device appearance. The current-page selector also works if storage
  is unavailable. Existing authentication and financial services were unchanged.
- Updated PRODUCT.md, DESIGN.md, PROJECT.md, and README.md for the approved style.
- Browser checks covered real public listings, theme persistence after reload and
  navigation, mobile menu links/Escape focus, and desktop/tablet/mobile layouts
  at 1440, 820, 375, and 320 pixels. Screenshots: `artifacts/studio-home-light.png`,
  `artifacts/studio-home-dark.png`, `artifacts/studio-home-mobile.png`, and
  `artifacts/studio-prizes-tablet.png`.
- Private-page browser verification remains limited by an expired login session.
  An attempted disposable-schema preview did not start successfully; its schema,
  fictional prize, and temporary helpers were removed. No application users,
  balances, bids, or outcomes were changed for visual QA. No migration is needed.
- Final lint, type checking, and production build passed. A final preview restart
  refused browser connections, so the last narrow-card illustration sizing fix
  was source-reviewed and build-checked rather than captured again. Temporary
  preview processes were stopped; run `npm run dev` for local review.

### Worker health and audited manual retries (2026-10-27)

- The admin monitor/API now calculate request-time alerts for missing/stale polls
  (older than 30 seconds), jobs/deliveries at least 60 seconds overdue, closed
  published auctions without jobs, and unfinished items with at least 3 failures.
- `npm run operations:check` exposes generic JSON health output and exit statuses
  0 healthy/no detected alerts, 1 attention, 2 check unavailable. It does not
  process jobs or install a background monitor. Page alerts require refresh.
- Failed unfinished jobs/deliveries in backoff can be scheduled earlier through
  a reason-required inline form and `POST /api/v1/admin/operations/retry`.
  The endpoint authenticates an active verified ADMIN, checks same origin, JSON,
  a 4 KB limit, and strict fields. The service locks/rechecks administrator role.
- Retry service uses the worker's job/auction lock order with `NOWAIT`, protects
  observed attempt versions, and rejects busy targets, healthy/completed work,
  already-due work, future auctions, and active winner payment windows. It only
  advances nextRunAt/nextAttemptAt. The workers perform all actual processing.
- The schedule change and immutable `OperationRetryAudit` commit together, with
  actor, target, failure attempt, reason, old schedule, and new schedule. References
  are idempotent; unique target/attempt pairs prevent repeated manual acceleration.
  Error/attempt history, offers/deadlines, bids, event contents, and money are not
  overridden. The admin page shows the latest 20 audit records.
- Form retains ambiguous requests for safe confirmation; a new failure attempt
  resets the control. The UI does not offer a retry for already-due work.
- Migration `20261027000100_operation_retries` adds audit foreign keys, state
  validation, uniqueness, and update/delete/truncate rejection. No app recovery
  actions, balance changes, role grants, or sample audit records were submitted.
- Verification: production build, type checking, lint, and the extended
  `npm run test:settlement` suite passed. The isolated settlement harness exercises
  actual retry routes/services and database locks, failure
  injection, audit rollback, concurrency, stale references, ownership/permissions,
  unchanged financial records, and health queries. Pure unit tests cover alert
  boundaries and strict retry input. Test phones/OTPs remain local.
- Migration `20261027000100_operation_retries` was applied to the configured DB.
  Browser verification showed stale-worker alerts and the empty retry-audit state
  using existing app data. Preview: `artifacts/worker-health-alerts.png`. Actual
  recovery submissions were tested only in the disposable schema, because app
  jobs had no current failures to retry.
- `operations:check` returned exit 1 with stale-worker alerts, then exit 0 after
  bounded `--once` polls from both worker CLIs. Both workers processed zero due
  items; only heartbeat times changed. These processes exited afterward.
- The temporary port 3000 dev preview for this milestone was stopped after
  verification. No worker daemon, external alert service, or automation was left
  running. Start Next.js and both workers separately for interactive testing.

### In-app notifications and admin monitoring (2026-10-25)

- Migration `20261025000100_notifications` adds `NotificationOutbox`, private
  `Notification` receipts, and `WorkerHeartbeat`. The migration was applied to
  the configured database without funding accounts or changing existing outcomes.
- New offers, expired deadlines, successful winner payments, and completed
  refunds create durable events in the same database transaction as their cause.
  One refund-completion event per participant covers all their bids after all
  refund batches finish. Unique event keys prevent duplicate lifecycle notices.
  Existing outcomes are not retroactively backfilled.
- `npm run notifications:worker` polls every five seconds, claims events with
  `FOR UPDATE SKIP LOCKED`, and saves the inbox receipt and delivered marker
  atomically. Failures roll back to a savepoint and retain `DELIVERY_FAILED`,
  attempts, and exponential retry times from 5 to 300 seconds. Concurrent retries
  cannot duplicate an inbox receipt or call financial/settlement operations.
- `/notifications` and its private GET API provide owned cursor pagination,
  unread counts, and readable event snapshots. The owned same-origin POST
  `/api/v1/notifications/[id]/read` accepts `{}` and marks read idempotently.
  Database guards prevent changing receipt ownership and resetting a read time.
- Navigation/account links expose the inbox. Updates require refresh; there is
  no automatic badge/polling, push, external SMS/email, or delivery preferences.
  Original offer deadlines apply even when delivery is delayed; Offers shows the
  current payable state. Reading a message never accepts/pays an offer.
- `/admin/operations` and its protected GET API show paginated active/retrying/
  completed jobs, pending payment deadlines, refund counts, notification backlog,
  the next ten delivery failures, and last worker poll timestamps. A past poll
  is not proof that a process remains alive. The monitor is read-only.
- Both workers must run separately from Next.js. Worker CLI logs contain counts,
  outcomes, and generic errors only. No service/daemon is installed automatically.
- Verification: lint, type checking, production build, and the extended
  `npm run test:settlement` suite passed. The disposable-schema suite checks real
  lifecycle events, rollback without false notices, refund deduplication across
  batches, concurrent delivery, injected delivery failure/backoff/recovery,
  inbox privacy/pagination/read races, admin permissions, poll records, and ledger
  consistency. No existing app balances, prize outcomes, or live SMS are used.
- Browser checks verified the member inbox empty state, existing database job
  schedules in the admin monitor, and the retrying-jobs filter. Screenshots:
  `artifacts/notifications-inbox.png` and `artifacts/auction-operations.png`.
  No sample notices were added to app accounts and no app bids/payments were made.
- Both worker CLIs passed bounded `--once` checks against the configured database:
  zero due jobs/events, with poll timestamps recorded. No daemon was left running.
- The temporary Next dev preview started on port 3000 for this milestone was
  stopped after browser verification. Start the app and both workers in separate
  terminals for interactive testing; process state must be checked again next turn.

### Temporary administrator wallet funding (2026-10-24)

- `/admin/wallet-funding`, linked from `/admin` while enabled, credits the admin's
  own wallet or an existing active verified account by phone number.
- The amount is parsed into exact integer hundredths. A required reason appears
  in wallet history and in the audit record. The page shows the issuing admin's
  ten latest database credits, and a successful save returns the database balance.
- `POST /api/v1/admin/wallet-funding` checks the session, fresh active ADMIN role,
  same origin, JSON content type, a 4 KB body limit, and strict input fields.
  The service rechecks/locks administrator permissions inside its transaction.
- Ledger posting and the new immutable `AdminWalletCredit` audit commit together;
  a failed audit leaves no transfer or balance change. The audit records actor,
  recipient, transfer, reason, timestamp, and an administrator-scoped request key.
- Duplicate and concurrent retries return the same transfer. Reusing a reference
  for another recipient, amount, or reason fails. The form keeps the same request
  after ambiguous network/server errors and locks its details for safe retries.
- Requires `ADMIN_TEST_FUNDING_ENABLED="true"`, NODE_ENV=development, and no CI or
  Vercel environment. The flag was enabled in ignored `.env.local`; `.env.example`
  defaults to false. Restart the dev server after this schema/configuration change.
- Migration `20261024000100_admin_test_funding` was applied to the configured DB.
  It adds audit insert validation, foreign keys, uniqueness, and update/delete/
  truncate rejection. No existing users were promoted or funded and no seed was run.
- Disable the flag and restart to hide/disable the temporary tool. Later remove
  the page/API while retaining ledger and audit data. Real deposits remain absent.
- Verification: `npm run test:admin-funding`, `npm run test:wallet`, lint, and the
  production build passed. Funding integration uses a disposable database schema
  and fictional accounts/local OTPs, exercises the real route and ledger, checks
  balances/retries/conflicts, origin/body/permission guards, suspended/unverified
  recipients, immutable audit, rollback, reconciliation, disable/production guards,
  then drops only its schema. No live SMS or app-wallet funding is used.
- Browser verification on the existing local server confirmed the admin form,
  own-wallet default, conditional account-phone field, and database empty state.
  Preview: `artifacts/admin-wallet-funding.png`. No app credit was submitted.
- Fixed the retained Prisma singleton after a model is added during Next dev:
  compare current generated model delegates before reusing a cached client, and
  retire an incompatible old client. This resolved the audit model being undefined
  on the already-running server without stopping it. Isolated-test clients remain
  reusable because they expose the same delegates.

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

### 8. Closing, winner offers, and TEST settlement

- Owner explicitly approved paying the winning amount from the TEST wallet.
  Payment is a member action; the worker never auto-debits the proposed amount.
- Added/applied migration `20261023000200_test_settlement` with `SettlementJob`,
  immutable `AuctionSettlement` and `SettlementCandidate`, and guarded
  `WinnerOffer` records. Existing auctions/bids/ledger history were preserved.
- A separate Node worker discovers published auctions and processes persisted
  closing/deadline schedules. It uses job row locks with SKIP LOCKED and auction
  write locks to coordinate concurrent workers, bids, expiry, and payments.
- Snapshot creation waits for in-flight bid transactions and stores all original
  amounts with exactly one bid, ranked ascending. The database validates snapshot
  completeness/ranking. Snapshot records/candidates are immutable, and candidates
  cannot be appended in a later transaction.
- Pending offers get the full configured payment window from actual issue time.
  Expiry excludes every bid by that user for this auction, retaining the original
  uniqueness snapshot. The account stays active and can bid elsewhere.
- Candidates must currently be active verified users. Suspended/unverified users
  are not selected. If none eligible remain, settlement moves to refunds.
- The owned `/offers` page and GET API show only that member's offers. No SMS/email
  offer notifications yet; users must check this page during the test phase.
- The pay endpoint accepts `{}` only. The saved bid sets the payer and amount.
  Wallet/job/auction locks and SQL deadline/payment-pair guards ensure one exact
  winning-amount transfer and one PAID offer commit together. Paid-offer retries
  return the original transfer. Insufficient funds do not expire an offer early.
- A payment sets WINNER_CONFIRMED and completes the job. Public result data contains
  only TEST mode, winning amount, and confirmation time; no phone, user id, name,
  candidate ranking, or losing amounts are exposed.
- Exhausted/no-unique candidates cause original BID_FEE reversals in batches of
  25. Progress persists as REFUNDING, then REFUNDED. Unique original references
  prevent duplicate refunds. No ledger rows are deleted.
- A savepoint rolls back failed partial work while retaining generic error,
  attempt count, and exponential retry (5–300 seconds). A crash/lost connection
  rolls back the transaction and releases the job for another attempt.
- `npm run auctions:worker` polls every five seconds in its own process.
  `-- --once` performs one bounded batch and exits nonzero on retry/error.
  No permanent worker/service or recurring desktop automation was installed.
- A one-pass app-data run processed zero auctions, preserving future closing
  times and leaving member funds/bids untouched.

Important files: `src/modules/settlement/{service,api,pay-button}.ts(x)`,
`scripts/settlement-worker.ts`, `scripts/test-settlement.ts`, `/offers` and its
API handlers. Real prize fulfillment and provider money remain out of scope.

Verification: isolated tests passed for original ranking, concurrent workers,
deadlines, entire-user exclusion, other-auction eligibility, payment ownership/
CSRF/amount tampering, payment retries, snapshot/offer immutability, public-result
privacy, no-unique/all-failed refunds, 26-fee batch resumption, refund rollback/
backoff recovery, suspension, and net-zero balances. Isolated wallet regressions,
build/type checks, and lint also passed. The harness uses a disposable
`settlement_test_<uuid>` schema, fictional phones, and local OTPs, then drops only
that schema. No real SMS or member money is used.

Final checks also passed the existing bidding suite and app ledger reconciliation
(zero accounts/transfers and no mismatch). Browser verification covered the
protected offers empty state and a 390px mobile view without horizontal overflow;
preview saved to `artifacts/winner-offers-mobile.png`. Payment interactions were
tested through real API/service handlers in isolation, not by paying from the
owner's browser/account. The temporary port-3002 preview was stopped. No permanent
worker is running; start `auctions:worker` separately to process due jobs.

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
| `/offers` | Protected personal winner offers and TEST payment action |
| `/api/v1/offers` | GET owned offers with cursor pagination |
| `/api/v1/offers/[id]/pay` | POST explicit TEST winning-amount payment |
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
- There has been no production deployment, capacity/load test, or real-provider
  payment test. TEST settlement is covered by isolated integration checks.
- Do not send real SMS just to rerun ordinary tests: auth/auction integration
  scripts force local delivery inside their process without editing `.env.local`.

## Not implemented

- Real deposits, withdrawals, withdrawal holds, or payment-provider integration.
- SMS/email/push offer notifications and delivery tracking beyond account OTPs.
- Auction cancellation/refund administration, user-management UI, or general audit
  UI. The temporary funding page shows only the issuing admin's recent credits.
- About/contact pages, customer-support tools, image uploads, or mobile apps.
- Account recovery/phone changes and additional administrator protection.

## Next milestone: operation and external delivery readiness

1. Choose worker hosting/supervision and least-privilege database roles. Connect
   operations:check to an external monitor if desired; in-app alerts now exist.
2. Confirm external delivery channels/preferences and SMS message costs before
   connecting outcome notifications to the live provider. Keep tests local.
3. Expand audited recovery only for explicitly approved transitions. Restricted
   failed-work scheduling is implemented; arbitrary ledger/bid or deadline
   overrides remain prohibited.
4. Verify process-restart recovery, payment/deadline lock-wait boundaries, and
   large-auction snapshot/fanout performance under a defined workload.
5. Select a provider and validate support for this business before live-money
   deposits/withdrawals. Keep TEST and live money separate.

## Following milestones

1. **Bidding:** implemented with TEST funds; run regression tests when extending
   it and measure contention before claiming capacity.
2. **Closing and winner offers:** implemented with durable jobs and TEST funds.
3. **Winner payment and refunds:** implemented with TEST wallet payments/reversals;
   future real-provider settlement still requires integration and verification.
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
npm run test:settlement
npm run auctions:worker -- --once
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
- **Publication versus jobs:** date labels do not run settlement. The separate
  `auctions:worker` process must run for closing, reassignment, and refunds. Its
  persisted database jobs resume on restart; no permanent worker was installed.
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
> repository state before editing. Continue with the operation/external-delivery readiness milestone
> described in PROGRESS.md, keeping the TEST wallet ledger, phone-only Better Auth
> login, and existing
> auction rules intact. Read the relevant installed Next.js documentation, avoid
> exposing secrets or sending real SMS in tests, run meaningful checks, and update
> the handoff documents with completed work and the next step.
