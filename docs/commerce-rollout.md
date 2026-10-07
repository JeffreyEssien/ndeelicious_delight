# Commerce rollout and recovery

Implementation specification: `NDEELICIOUS_FULL_COMMERCE_IMPLEMENTATION.md`.

## Migration history

0030–0031 were already applied before this implementation began. Do not edit or replay them. Historical 0031 rewrote homepage category content. No earlier owner-content backup was available in this session; its previous wording cannot be reconstructed reliably. This rollout never rewrites owner CMS content. Owners can review/restore the homepage through Content settings.

0032 adds delivery FSA coverage and thresholds, cake base prices and tax classes, cake-option relationships, explicit pack quantities, product tax classes, order tax/fulfilment snapshots, and atomic configuration RPCs. Existing cake prices/pack counts remain null, classifications require review, and no example areas or schedules are published.

0033 adds quote conversion with canonical server-calculated fulfilment/tax snapshots and revokes service-role access to the historical calculator RPC. Accepted quote conversion remains atomic and idempotent. Payment retry uses an already-created order's recorded amount without recalculating current configuration.

Run `node scripts/rollout-commerce.mjs` for a read-only preflight. The explicitly authorized application command is `node scripts/rollout-commerce.mjs --apply`. The runner refuses replay, backs up affected configuration, verifies decryption, applies both migrations in one transaction, verifies schema/permissions, confirms site settings are unchanged, and reloads PostgREST's schema cache.

## Backup scope

The ignored `.commerce-backups/<UTC timestamp>/` directory has mode 0700. `configuration.aes-gcm`, `recovery.key`, and `rollout.json` have mode 0600. Keep the recovery key securely with the backup; neither is committed. AES-256-GCM authenticates the backup.

The backup includes site settings, delivery zones, cake types/options, products and variants, plus public column/constraint/index/function/trigger definitions. It intentionally excludes customer, order and payment rows: the new migrations add nullable snapshot columns and do not rewrite those records. This is an affected-configuration recovery backup, not a complete Supabase disaster-recovery backup; auth/storage objects and their data are outside its scope. Retain the provider's full database backups for disaster recovery.

## Recovery

Before commit, any DDL/check failure rolls the entire migration transaction back. The encrypted backup remains available.

After commit, prefer a forward fix. Keep additive columns/tables and historical snapshots; dropping them would lose recorded rules for new orders. Do not overwrite owner edits made after the backup. To recover a particular configuration row, decrypt the backup in a restricted environment, compare it with the current row, and restore only the owner-approved values through the admin UI or a reviewed data transaction.

For decryption, read `recovery.key` as 32 bytes. The encrypted envelope contains the 12-byte IV, 16-byte authentication tag, then ciphertext. Use `crypto.createDecipheriv('aes-256-gcm', key, iv)`, `setAuthTag(tag)`, and concatenate `update(ciphertext)` with `final()`. Parse the resulting UTF-8 JSON. Never print its contents to a shared log or commit recovered configuration.

A previous application release uses the retired quote RPC. Do not revert to it while accepting orders without reviewing its older tax/fulfilment behavior. If an emergency rollback is necessary, pause ordering through owner settings and deploy a forward-compatible fix rather than delete financial snapshots.

## Owner setup

Before production orders, configure the actual HRM delivery FSAs, fees/minimums/free thresholds, delivery days and cutoff, blackouts, pickup address/days/hours, cake base prices and assigned choices, real variant pack quantities, and product/cake tax classifications. Choose the delivery tax treatment explicitly. Missing rules surface setup/unavailable errors; synthetic browser fixtures are never copied to production.

Canada/Nova Scotia is the delivery jurisdiction; schedules use America/Halifax. Postal coverage is explicitly owner-defined. The application does not infer that every Nova Scotia FSA belongs to HRM.

## Tax references and classification contract

[CRA: GST/HST rates](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html) lists Nova Scotia's 14% HST from April 1, 2025.

[CRA: Basic groceries](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/4-3/basic-groceries.html) describes sweetened single-serving goods, quantities of six or more, individual packaging exclusions, unsweetened bread/croissants, and eligible edible wedding cakes. `SWEET_SINGLE_SERVING` is an owner-confirmed eligibility classification: a stored pack count of six or more receives the applicable zero-rated treatment only for goods that satisfy those conditions. Individually taxable packaging or other exclusions must use `STANDARD_TAXABLE`. `FULL_CAKE`/`WEDDING_CAKE` mean owner-confirmed eligible edible cakes, not arbitrary products with those names. Unknown classification remains `REQUIRES_REVIEW`.

Discount cents are allocated only to coupon-eligible lines with deterministic largest-remainder rounding. Item tax is rounded per line after allocation. Delivery treatment is owner-selected: separate taxable service or proportional treatment following item net amounts. Confirm the applicable commercial arrangement before configuring it. Orders retain applied classes, pack quantities, allocations, rates, tax amounts, jurisdiction, delivery mode and fulfilment details. Invoices and refunds use these recorded amounts.

## Validation environments

`npm run test:db:local` runs isolated PostgreSQL migration, constraint, atomic-save, quote conversion, idempotency and snapshot tests without network credentials.

`npm run test:db` requires `DATABASE_TEST_AUTHORIZED=true` and an explicitly authorized test database. A configured production database is not automatically an authorized test database. The script creates rollback-only workflow fixtures and must not be pointed at production by default.

Browser tests use `e2e/fixture-server.mjs`, port 4545, and the app's `.next-fixtures` output on port 3100. Use the commands in README, with `STRIPE_SECRET_KEY=` as well as blank SMTP credentials to ensure fixture tests cannot contact live payment/email services. Customer Budget Match tests run before admin tests that change synthetic configuration. `e2e/commerce-admin.spec.ts` verifies actual API totals, duplicate FSA rejection, persistence, PNG/ZIP bytes and image/logo failures.

Production canonical URL: https://www.ndeelicious.com. `NEXT_PUBLIC_SITE_URL` is the shared URL source for metadata, payments, documents/email/tracking and marketing. Development/isolated preview URLs remain explicit environment overrides.
