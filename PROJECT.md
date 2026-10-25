# Enicharet — project description

Last updated: 2026-10-23.

This file describes the product, its rules, architecture, and intended scope.
Read [PROGRESS.md](PROGRESS.md) for what actually works and what to build next.
Read [AGENTS.md](AGENTS.md) before changing the repository. Planned features in
this document must not be mistaken for implemented behavior.

## 1. Product and development approach

Enicharet is a lowest-unique-bid prize auction application. People choose a prize,
pay a fixed fee to submit a bid, and try to submit the lowest amount that nobody
else submitted. The eligible winner must pay their bid amount within a deadline
to claim the prize.

The initial market uses Ethiopian birr and Ethiopian phone numbers. Start with a
responsive web app that works on phones, tablets, and computers. Dedicated mobile
apps are a later goal; no mobile framework has been selected.

The owner wants to build and understand the project with agent assistance, one
working milestone at a time. Explain each milestone, preserve earlier decisions,
and avoid silently replacing the stack or introducing major external services.

## 2. Money and auction rules

There are two different amounts:

| Amount | When charged | Who pays |
| --- | --- | --- |
| Fixed entry fee | When a bid is accepted | Every bidder, for each accepted bid |
| Submitted bid amount | When accepting/paying a winning offer | The eligible winner only |

Losing bidders do not pay the amount they bid. Submitting a bid must not debit or
reserve that proposed amount under the current product agreement.

### Bidding

- Each auction has an opening time and closing time.
- Bids are accepted only within that interval, according to authoritative server
  time. The implemented boundary is `opensAt <= now < closesAt`.
- Users may submit multiple bids. An administrator can set a per-user limit for
  each auction; a blank limit means unlimited in the current prize editor.
- Amounts support precision up to two decimal places.
- Money is represented as integer hundredths of a birr, never floating-point
  arithmetic for stored balances, charges, or comparisons.
- Each accepted bid charges the auction's fixed entry fee from the user's wallet.
- Duplicate amounts are excluded, and the lowest remaining unique amount wins
  the first opportunity to pay for the prize.

### Ranking and missed payment

1. Close bidding and determine the amounts submitted exactly once.
2. Rank those eligible bids from lowest amount upward.
3. Offer the prize to the first eligible bidder and establish a payment deadline.
4. If they pay in time, confirm the winner.
5. If they miss the deadline, exclude that user completely from further offers
   for this auction, including their other bid amounts.
6. Offer the prize to the next eligible unique bidder who is not excluded.

Exclusion applies only to that auction. The user may still participate in other
prize auctions. Do not implement a global ban for missing one prize payment.

Duplicates must remain disqualified during reassignment: removing a nonpaying
user must not turn a formerly duplicated amount into a new unique candidate.
Preserve eligibility from the original closed auction.

The project specification refunds all entry fees for an auction
if there are no unique bids or all eligible candidates fail to pay. Ordinary
losing entry fees otherwise remain charged. These rules are implemented with
TEST funds; real payment-provider refunds are not implemented.

### Example

Suppose an auction has a 5.00 birr entry fee and these submissions:

| User | Bid amount | Result at closing |
| --- | --- | --- |
| A | 1.00 | Excluded: duplicated amount |
| B | 1.00 | Excluded: duplicated amount |
| C | 1.25 | First eligible bid |
| C | 1.50 | Another originally unique bid |
| D | 2.00 | Next eligible user after C |

Each submission charges 5.00 birr. C pays 10.00 birr in entry fees for two bids.
If C pays the winning offer, C additionally pays 1.25 birr. If C misses the
deadline, both C bids are skipped and D receives the next offer for 2.00 birr.
The 1.00 bids stay disqualified.

### Bidding decisions confirmed on 2026-10-23

- Minimum bid: 1.00 birr, up to two decimal places.
- A user cannot repeat their own amount for the same auction. Other users may
  submit that amount, which will affect uniqueness during future settlement.
- Other bidders' amounts and uniqueness status are hidden. No public bid ranking
  is exposed, including after close until winner/result functionality exists.
- The current technical maximum is 21,474,836.47 birr (signed 32-bit minor units),
  matching the existing exact money parser. This is a storage limit, not a prize
  valuation or a selected commercial maximum.

### Decisions to settle before settlement

The following details are not final requirements yet:

- The owner approved explicit payment from the winner's TEST wallet on 2026-10-23.
  Never auto-debit a winning bid. Live payment-provider behavior is still undecided.
- Cancellation, exceptional refunds, prize non-delivery, and dispute policies.

## 3. Accounts and authentication

- Users sign up and log in with a phone number and SMS OTP.
- Users do not enter an email address or password.
- First successful phone verification creates an account; later logins use the
  same verified phone account.
- A signed HTTP-only cookie identifies a database-backed session.
- Current default session lifetime: seven days, fixed, without sliding refresh.
- Logout revokes the session. Expired sessions require another OTP login.
- Roles are `USER` and `ADMIN`; account states are `ACTIVE` and `SUSPENDED`.
- Public registration cannot assign administrator privileges.
- The owner chose Better Auth, which is already integrated.

Better Auth keeps an internal opaque email identifier under a reserved `.invalid`
domain because of its core data model. This is an implementation detail, not an
email login feature. Existing email-related database fields are not permission to
restore email/password forms.

SMS Ethiopia is the integrated SMS transport. A development-only local SMS inbox
is also available. Provider support and trial restrictions are described in
[README.md](README.md); recheck provider terms before depending on them in production.

## 4. Product surfaces

| Area | Intended functionality | Current status |
| --- | --- | --- |
| Home | Explain the model and link to prizes/accounts | Implemented |
| Account access | Phone OTP registration/login, session, logout | Implemented |
| Prize collection | Public list and prize details | Implemented |
| Auction administration | Draft creation/editing, rules, publishing | Implemented |
| Bidding | Submit multiple bids and charge fixed fees within a time window | Test-money version implemented |
| Wallet | Balance and transaction history | Test-money version implemented |
| Payments | Real deposits and withdrawals | Planned |
| Results | Winner offers, deadlines, test payments, and anonymized confirmed results | Test-money version implemented |
| Support | Contact/support requests and responses | Planned |
| Information | About us and contact us pages | Planned |
| Mobile apps | Dedicated apps backed by shared services | Later |

Administrators currently configure a title, plain-text description, fixed entry
fee, optional per-person bid limit, opening and closing times, payment window,
and optional HTTPS image URL with alternative text. Publishing requires a future
opening time and locks the auction's details. Image uploads are not implemented.

## 5. Wallet and payments

The owner wants users to deposit money into an in-app wallet, spend entry fees
from that wallet, and withdraw available funds. No deposit/withdrawal provider
has been chosen or connected.

The test-money wallet is implemented. Every immutable `WalletTransfer` represents
an equal debit and credit between two `WalletAccount` records. PostgreSQL triggers
apply balance projections atomically and block direct balance editing and ledger
update/delete/truncate. The system test-clearing account offsets user test funds;
it is not a real bank or payment-provider account. Reversals create a new row
referencing the original, with opposite accounts and the exact original amount.

Implemented safeguards:

- A wallet per user and an auditable ledger for every balance change.
- Atomic debit/credit operations, nonnegative spendable balances, and idempotency.
- No independent balance mutation outside the wallet service.
- PostgreSQL `BIGINT` and native JavaScript `bigint` minor-unit arithmetic. JSON
  amounts are decimal strings. User balances range from zero through
  9,000,000,000,000,000 minor units; this is a technical test limit, not a
  selected commercial deposit limit.
- Transaction history with references to the operation that caused each entry.
- A development-only test-credit mechanism, unavailable in production.
- A read-only ledger reconciliation command.

The protected `/wallet` view and `/api/v1/wallet` read APIs always label these
funds `TEST`. Zero balances can be read without creating database accounts;
accounts are created on the first trusted posting. The local test-credit command
rejects production, CI, and Vercel environments. There are no general-purpose
public credit, deposit, withdrawal, reversal, or transfer endpoints. Authenticated
bids and offer payments post only their server-defined TEST amounts.

The owner requested a temporary administrator funding tool with persistent database
records, rather than seeded balances. `/admin/wallet-funding` and its admin-only
POST API can credit the administrator's own wallet or an existing verified active
account by phone. It requires local development and
`ADMIN_TEST_FUNDING_ENABLED="true"`. The ledger credit and immutable
`AdminWalletCredit` audit (actor, recipient, transfer, reason, timestamp) commit
together. References are unique per administrator across all recipients; retries
cannot duplicate a credit or change its recipient/amount/reason. Disable the flag
and restart to remove access. Future removal must preserve ledger and audit rows.
This is TEST money with no cash value, not a provider deposit or withdrawal.

Real payments remain planned: provider webhook verification/deduplication,
withdrawal holds, payout processing, and reconciliation against external funds.
The local test-credit service is not a live payment or public money-posting API.
The server-only bid-fee primitive uses its caller's database transaction. Bidding
now commits a bid and its fee together. Each auction has a separate TEST_FEES
account, so its fee income does not share the global test-credit clearing row.
Bid amounts are not charged or reserved. All funds remain TEST-only.

Do not present test credits as real deposits or treat a successful browser
redirect from a payment provider as proof of payment.

## 6. Technical architecture

The owner chose Next.js for both the web interface and server/API for now, with
the option to migrate backend services if measured needs justify it. Express or
a separate API framework is not required for the current milestone.

| Component | Current choice |
| --- | --- |
| Runtime/package manager | Node.js 24 LTS and npm |
| Web/server | Next.js App Router 16.4.2, React 19.3.0, TypeScript |
| Styling | Tailwind CSS 4 plus plain application CSS |
| Database | Hosted Neon PostgreSQL |
| Database access | Prisma 7.10.1 with the PostgreSQL driver adapter |
| Authentication | Better Auth 1.7.11 phone-number plugin |
| Phone parsing | libphonenumber-js |
| SMS | Server-only SMS Ethiopia adapter, optional local development inbox |
| Background jobs | PostgreSQL-backed settlement jobs and a separate Node worker |
| Payment provider/mobile framework | Not selected |

Versions above describe the current repository, not a recommendation to upgrade.
Check `package.json`, the lockfile, and installed documentation before changes.

### Repository boundaries

```text
src/app/                    Pages, layouts, and HTTP route handlers
src/modules/accounts/       Auth, sessions, phone normalization, SMS, account UI
src/modules/auctions/       Auction services, validation, presentation, admin UI
src/components/             Shared application UI
src/lib/prisma.ts           Server-only shared Prisma client and pool
src/worker/                 Reserved future background-job area
prisma/schema.prisma        Database models
prisma/migrations/          Reviewed SQL migrations and database constraints
scripts/                    Operational utilities and tests
```

Keep money, bidding, and settlement rules in domain services so future route
handlers, workers, and mobile clients can share them. Check permissions on the
server; hiding controls in the browser is insufficient.

Existing database models: `User`, `Session`, `Account`, `Verification`,
`RateLimit`, `Auction`, `AuctionImage`, `WalletAccount`, `WalletTransfer`, `Bid`,
`SettlementJob`, `AuctionSettlement`, `SettlementCandidate`, and `WinnerOffer`.
There are no withdrawal or provider-payment models yet.

### Lifecycle

The schema already declares `DRAFT`, `SCHEDULED`, `OPEN`, `CLOSING`,
`AWAITING_PAYMENT`, `WINNER_CONFIRMED`, `REFUNDING`, `CANCELLED`, and `FULFILLED`.
Admin transitions create/edit drafts and publish to `SCHEDULED`. The settlement
worker handles `CLOSING`, `AWAITING_PAYMENT`, `REFUNDING`, and `REFUNDED`.
Successful explicit test payment confirms `WINNER_CONFIRMED`. Cancellation and
physical fulfillment administration remain future work.

Public pages derive upcoming/open/closed labels from dates at request time.
Bids accept SCHEDULED or OPEN auctions within their time window without requiring
a scheduler. Closing, deadline reassignment, and refunds require the separate
settlement worker to be running; Next.js request handling alone does not run jobs.

### Test settlement and offers

`npm run auctions:worker` polls durable database jobs every five seconds. It
discovers published auctions, records their close time, and claims due jobs using
transaction row locks and `SKIP LOCKED`. A crash rolls back the in-flight work;
persisted schedules let another worker resume. Job errors retain generic retry
metadata with a bounded backoff. `-- --once` supports one bounded processing run.

At closing, the worker locks the auction, waits for in-flight bids, and stores a
complete immutable ranking of originally unique amounts. Duplicates never become
eligible during reassignment. Offers get a full payment window from their actual
creation time. Expired offers exclude every bid by that user for this auction,
without suspending their account or blocking other auctions. Candidates must be
active, verified users when selected.

`/offers` and its owned read API show offers without other users' information.
The winner explicitly pays the server-determined amount from TEST funds. Offer
identity provides idempotency: retries confirm the original payment, not another
charge. Job, auction, and wallet locks coordinate expiry and payment; the database
rechecks the deadline before accepting payment. No extra entry fee is charged.

When candidates are exhausted, original entry fees are reversed in batches of 25.
Unfinished batches persist as `REFUNDING`; completion becomes `REFUNDED`.
Reversals reference the original immutable fee and cannot repeat. Failed batches
roll back and retry rather than deleting history or forcing balances past limits.

Confirmed public results show only the TEST winning amount and confirmation time,
not names, phone numbers, user ids, other amounts, or the private ranking. Offer
notifications are currently in-app only; no SMS/email is sent. Real prize handover
and real money remain outside this test workflow.

### Time and scale

Store timestamps in UTC. The admin editor explicitly uses Ethiopian time
(`Africa/Addis_Ababa`, UTC+3), independent of the browser's time zone.

The owner expressed a target of up to 10,000 concurrent users, with an average
of four read/write requests each. The time interval and workload mix were not
specified. This is a future capacity target, not proof of 40,000 requests/second
or a tested capacity. Define the workload, load-test it, and measure database
contention before making scalability claims or deciding to split services.

## 7. Design direction

The owner selected a bold, premium style: charcoal surfaces, warm gold accents,
Geist typography, strong headings, and clear forms. Continue the existing design
instead of replacing it. See [DESIGN.md](DESIGN.md) and [PRODUCT.md](PRODUCT.md).

Support keyboard navigation, visible focus, descriptive labels, accessible error
and pending states, readable contrast, and responsive layouts. Explain entry fees
and winner payments separately. Never imply bidding or live money works before
those features exist.

## 8. Configuration and private data

Configuration lives in ignored `.env.local`. Document variable names and examples,
never actual values. The important variables are `DATABASE_URL`, optional
`DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`AUTH_SESSION_TTL_SECONDS`, `AUTH_SMS_MODE`, `SMSETHIOPIA_API_KEY`, and the temporary
`ADMIN_TEST_FUNDING_ENABLED` switch.

Do not copy credentials, real phone numbers, OTPs, session cookies, inbox contents,
or customer records into handoff documents. The local project has been configured
with hosted database and SMS credentials, but their current validity must be
checked through safe tests rather than by printing them.

## 9. Reading order for a new agent

1. `AGENTS.md` — repository instructions, including the installed Next.js docs rule.
2. `PROJECT.md` — product requirements and architectural decisions.
3. `PROGRESS.md` — completed work, evidence, next milestone, and open decisions.
4. `README.md` — setup, commands, configuration, and transport details.
5. Relevant source, migrations, and installed framework documentation.

Update `PROGRESS.md` after a milestone. Update this file when the owner changes
requirements or architecture. Distinguish owner decisions from implementation
proposals, and verified results from work that has merely been written.
