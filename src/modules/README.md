# Business modules

Each domain owns its services, validation, and database queries. API handlers and
workers call services rather than duplicating business rules.

Planned domains: accounts, auctions, bidding, settlement, wallet, payments,
notifications, support, and audit.

Money operations and bid acceptance must use database transactions. External
callbacks and retried jobs must be idempotent.
