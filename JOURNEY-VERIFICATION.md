# Test-money journey verification

Verified 2026-10-29. This is development evidence, not a production capacity test
or a live SMS/payment-provider certification.

## Browser journey

Used a temporary copy of the current app, one fictional prize, a fictional phone
account, and a disposable PostgreSQL schema with all current migrations. Local
OTP delivery was forced for that server and the live SMS key was blanked in its
environment. The app's normal environment file and application records were not
changed. Only the copied database adapter selected the disposable schema.

1. Open `/` while signed out: the fictional prize is visible.
2. Open its card: the detail route redirects to `/login`.
3. Submit the fictional phone: the code field appears and a local inbox receives
   a code. Submit that code without exposing it in logs or screenshots.
4. Successful verification returns to `/` with member navigation.
5. Add 100.00 TEST birr to this isolated user's wallet through the test ledger
   service, then open the prize: authenticated details and bid form render.
6. Submit a 1.25-birr bid with a 5.00-birr fee: success appears; the wallet shows
   95.00 birr. The proposed amount is not charged or reserved.
7. Close only the fictional fixture and run the isolated settlement worker:
   one pending offer appears with a payment deadline.
8. Pay 1.25 birr in TEST funds from the offer page: the UI confirms the test winner.
9. Inspect wallet history: one credit, one entry fee, one winner payment; ending
   balance is 93.75 birr. Database assertions confirm one bid, one paid offer,
   one fee transfer, one winner-payment transfer, and net-zero ledger balances.
10. Reload the wallet: the session persists and the balance is unchanged.
11. Log out: return to the public homepage. Direct `/wallet` access redirects to
    login again.

Evidence: `artifacts/journey-winner-confirmed.png` and `artifacts/journey-wallet.png`.

## Regression suites

- `npm run test:bidding`: exact amounts, fee-only charging, retries/races, bid
  limits, duplicate amounts, private ownership, origin/input guards, auction-time
  boundaries, insufficient funds, immutability, pagination, and throttling passed.
- `npm run test:wallet`: concurrent debits, constraints, exact balances,
  idempotency/conflicts, reversals, rollback, permissions, and reconciliation passed.
- `npm run test:sms`: normalization, mocked provider requests, rejection,
  malformed responses, and fail-closed behavior passed. No real messages sent.
- `npm run test:admin-funding`: admin/self funding, permissions, concurrent
  retries, audit atomicity, balances, disable switch, and production guards passed.
- `npm run test:settlement`: original uniqueness snapshot, full-user exclusion
  for that auction, deadline expiry/reassignment, payment races/replays,
  no-unique/all-failed refunds, multi-batch recovery, audited retries, notification
  delivery/recovery, inbox permissions, health queries, and balanced ledger passed.
- Final `npm run lint`, `npm run typecheck`, and `npm run build` passed after
  the fix and disposable-preview cleanup.

Expiry/reassignment/refund cases were exercised by isolated integration tests,
including actual database payment deadlines, rather than additional browser users.
The browser exercised the successful user journey above. The standalone auth and
auction administration suites were not rerun; the exercised integration suites
use real Better Auth handlers. Live provider SMS, real funds, production hosting,
load/capacity, and the full UI accessibility matrix remain outside this evidence.

## Defect found and corrected

Initial browser requests and OTP verification hit Prisma `P2028`: a transaction
could not start within the default two-second acquisition wait. The initial
settlement run also returned an unexpected server error. The application client
and disposable integration clients now allow a bounded 15-second acquisition
wait. The existing five-second active-transaction timeout remains unchanged;
authentication and ledger invariants were not relaxed. Login and the complete
browser journey then succeeded; the settlement rerun passed.

Restart an existing development server to replace its cached Prisma client and
pick up the new transaction acquisition setting.

## Cleanup

The verified preview parent and child processes were stopped. The UUID-scoped
journey schema, copied app, local OTP inbox, and temporary control files were
removed. The regression suites cleaned up their own disposable schemas. No
permanent worker, monitoring daemon, or preview was installed.
