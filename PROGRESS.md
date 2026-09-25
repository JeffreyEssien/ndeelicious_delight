# Project Progress and TODOs

Last updated: 2026-09-25
Active development branch: `develop`
Baseline commit: `fc769b6` (`the initial push`)

This is the living checkpoint for implementation progress. Update it when a feature, migration, test, deployment prerequisite, or known limitation changes. `implementation.md` remains the full product plan and definition of done.

## Current checkpoint

The initial full-stack application is committed on `main`. The current `develop` branch adds:

- Provider-neutral SMTP transactional email through Gmail-compatible STARTTLS, app-password, or OAuth2 credentials.
- Customer emails for orders, cake requests, and newsletter sign-ups.
- Admin emails for new orders, cake requests, and contact messages when `ADMIN_EMAIL` is configured.
- Environment-aware canonical URLs for metadata, `robots.txt`, and `sitemap.xml`.
- A GitHub Actions pipeline split into regression, functional, and structural gates, with opt-in Vercel staging and production deployment.
- Incremental Biome linting and formatting for every changed file, locally and in CI.
- A clean full-repository Biome lint baseline; the former 82-error/141-warning backlog is resolved.

The Canada commerce, owner-managed storefront settings, complete order lifecycle, and immutable admin audit ledger are implemented. The active implementation checkpoint is now **G12 · SEO**.

The first-party admin OTP/SMTP security remediation is implemented and verified locally. Migrations `0003` through `0017` are applied to the project's configured Supabase database. Deployment remains blocked on production environment configuration and revocation of legacy Supabase Auth sessions.

## Implemented

- [x] Next.js App Router storefront and shared layout.
- [x] Product catalogue, category pages, product details, cart, and local cart state.
- [x] Custom cake builder and server-side quote calculation.
- [x] Checkout quote calculation, delivery zones, coupons, and order creation route.
- [x] Order tracking interface and route.
- [x] Supabase schema migrations, server/client access, seed script, and admin bootstrap script.
- [x] First-party admin OTP authentication with hashed one-time challenges, durable rate limits, opaque revocable sessions, protected admin shell, and protected mutation routes.
- [x] Contact and newsletter persistence routes.
- [x] Error, loading, not-found, policy, delivery, FAQ, and about pages.
- [x] Unit tests for checkout pricing, cake pricing, inventory rules, formatting, validation, and auth helpers.
- [x] Functional route tests for cake and checkout quotes.
- [x] Metadata, sitemap, and robots route foundations.
- [x] Transactional email integration implemented in the working tree.
- [x] Transactional email provider, HTML escaping, and canonical site URL tests.
- [x] Functional notification tests for orders, cake requests, contact messages, and newsletter sign-ups.
- [x] CI gates for regression, functional, and structural tests.
- [x] Opt-in CD jobs for Vercel staging from `develop` and production from `main`.
- [x] Complete product create/edit/archive/duplicate flows with category, price, stock, visibility, and featured controls.
- [x] Product variant management with inactive-row preservation for historical order integrity.
- [x] Product image upload, required alt text, ordering, storefront gallery use, and storage/RLS migration.
- [x] Storefront catalogue visibility now respects an empty live catalogue instead of exposing fallback products after archival.
- [x] Removed the Supabase Auth magic-link/PKCE dependency from admin authentication so login codes no longer enter redirect URLs.
- [x] Added service-role-only `admin_otp_challenges` and `admin_sessions` tables in migration `0004_admin_otp_sessions.sql`.
- [x] Replaced process-local OTP throttling with database-backed recipient and requester limits suitable for multiple application instances.
- [x] Replaced Resend-specific delivery code with a server-owned SMTP mail engine shared by admin OTP and customer notifications.
- [x] Added transactional, expiring inventory reservations with payment-stage deduction, cancellation/refund restoration, protected admin adjustments, and database row locking against concurrent overselling.
- [x] Removed runtime catalogue, coupon, review, and editorial demo fallbacks; customer-facing content now comes from Supabase records or presents an explicit empty state.
- [x] Added database-managed business/storefront content, cake options and lead time, approved review display and submission, and functional admin editors.
- [x] Added private validated cake-inspiration uploads with signed admin previews.
- [x] Replaced the coupon draft-only control with persisted coupon editing, activation windows, monetary/percentage rules, total limits, and per-customer limits.
- [x] Added store-wide and delivery-zone minimums, delivery/pickup availability controls, ordered delivery-zone administration, product/category coupon eligibility, and concurrency-safe expiring coupon holds.
- [x] Added server-owned Stripe Checkout sessions, persisted payment attempts, signed webhook verification, atomic and idempotent payment transitions, payment-status polling, and safe payment resume/retry flows.
- [x] Converted checkout, order snapshots, Stripe currency, customer/admin formatting, address collection, and transactional copy to Canadian settings with province, postal-code, timezone, and configurable tax support.
- [x] Added runtime-validated business, storefront-content, and appearance settings; the admin can edit every stored storefront text/link/list and choose safe theme colours, width, spacing, corner, and product-grid controls without code changes.
- [x] Enforced the order status graph in PostgreSQL, added immutable order activity, detailed admin order inspection/printing/notes, idempotent full and partial Stripe refunds, refund concurrency protection, and durable customer-notification delivery with retry controls.
- [x] Added an immutable service-role-only admin audit ledger with validated actor/session identity, server-read before/after values for sensitive mutations, and an authorized Audit Log screen.
- [x] Made every product variant a SKU-bearing inventory unit with database-generated immutable identifiers, variant-level admin adjustments, derived product totals, and SKU snapshots on order lines.
- [x] Reworked the owner-facing Delivery, Inventory, Products, Audit Log, Custom Cakes, Settings, and Website Text workspaces for responsive task-focused use; added custom-cake workflow status management and grouped database-backed option editing.

## Verification status

Verified locally on 2026-09-19 before introducing the CI files:

- `npm run typecheck` — passed.
- `npm test` — 9 files and 27 tests passed.
- `npm run build` — passed; 43 routes/pages generated.

Checkpoint verification history:

- `npm run test:regression` — 9 files and 29 tests passed.
- `npm run test:functional` — 5 files and 9 tests passed.
- `npm run test:structural` — route type generation, strict TypeScript, and the 43-route production build passed.
- `npm run quality` — 16 changed files passed linting and formatting checks.
- `biome lint . --max-diagnostics=200` — all 116 tracked source/config files passed with no lint errors or warnings.
- `npm test` — 14 files and 38 tests passed after the lint remediation.
- `npm run typecheck` — Next.js route generation and strict TypeScript passed after the lint remediation.
- `npm run build` — production compilation and all 43 routes/pages passed after the lint remediation.
- `npm run check` — 33 regression tests, 16 functional tests, strict TypeScript, and the 44-route production build passed for G02.
- `npm run check` — 34 regression tests, 20 functional tests, strict TypeScript, and the 44-route production build passed after the first-party OTP/SMTP security migration on 2026-09-20.
- `npm run check` — 40 regression tests, 24 functional tests, strict TypeScript, and the 44-route production build passed for G03 on 2026-09-23.
- `npm run check` — 40 regression tests, 28 functional tests, strict TypeScript, and the 37-page production build passed after the database-backed storefront sweep on 2026-09-23.
- `npm run check` — 43 regression tests, 34 functional tests, strict TypeScript, and the 37-page production build passed for G06 on 2026-09-24.
- `npm run check` — 45 regression tests, 40 functional tests, strict TypeScript, and the 40-page production build passed for G07 on 2026-09-24.
- `npm run check` — 48 regression tests, 43 functional tests, strict TypeScript, and the 40-page production build passed after the Canada commerce and owner-managed settings foundation on 2026-09-24.
- `npm run check` — 49 regression tests, 47 functional tests, strict TypeScript, and the 40-page production build passed for G08 on 2026-09-24.
- `npm run check` — 53 regression tests, 47 functional tests, strict TypeScript, and the 40-page production build passed for G11 on 2026-09-25.
- `npm run check` — 54 regression tests, 47 functional tests, strict TypeScript, and the 40-page production build passed after inventory-unit SKU automation on 2026-09-25.
- `npm run check` — 54 regression tests, 48 functional tests, strict TypeScript, and the 40-page production build passed after the owner-facing admin usability pass on 2026-09-25.
- Migration `0005_inventory_integrity.sql` was transactionally validated and applied to the configured Supabase database on 2026-09-23; rollback-only lifecycle checks and a live two-connection race confirmed one winner, one rejected reservation, zero oversales, correct deduction/restoration, RLS, triggers, and role restrictions.
- Migrations `0006_database_backed_storefront.sql`, `0007_cake_reference_images.sql`, and `0008_additive_storefront_content.sql` are applied to the configured Supabase database. The latter is additive and preserves content already customized in admin.
- Migration `0003_product_media.sql` was applied to the configured Supabase database on 2026-09-23 after a runtime REST query exposed the missing `product_images.storage_path` column; the content record and column were then verified through Supabase REST.
- Migration `0009_delivery_coupon_integrity.sql` was rollback-validated and applied on 2026-09-24. Live two-connection races confirmed one winner/one rejection for both global and per-customer coupon limits; paid orders committed holds and cancellation released them.
- Migration `0010_stripe_payments.sql` was rollback-validated and applied on 2026-09-24. A rollback-only live database test confirmed amount-tampering rejection, duplicate-event idempotency, exactly-once stock deduction, paid order/payment transitions, and service-role RPC grants.
- Migration `0011_canada_commerce_settings.sql` was rollback-validated, applied, and live-verified on 2026-09-24. Business settings now use CA/CAD defaults, Canadian address and tax snapshots exist, appearance settings are database-owned, and legacy Nigerian delivery zones are inactive.
- Migrations `0012_order_lifecycle.sql`, `0013_notification_outbox_leases.sql`, and `0014_refund_concurrency.sql` were rollback-validated and applied on 2026-09-24. Live transactional checks rejected invalid status jumps, proved order-event immutability/admin attribution, completed an atomic full refund, queued the refund email, and prevented pending concurrent refunds from exceeding the paid amount.
- Migration `0015_async_refund_events.sql` was rollback-validated and applied on 2026-09-24. A live rollback-only check confirmed pending provider refunds are not completed early and duplicate signed refund webhooks finalize the order exactly once.
- Migration `0016_admin_audit_logs.sql` was rollback-validated and applied on 2026-09-25. A live rollback-only check confirmed active admin/session attribution and append-only enforcement without retaining test rows or sessions.
- Migration `0017_inventory_unit_skus.sql` was rollback-validated and applied on 2026-09-25. It backfilled 13 variant SKUs, reconciled five product/variant stock mismatches with no active reservations, and passed rollback-only generation, immutability, aggregation, adjustment, and service-role permission checks.
- A read-only readiness check on 2026-09-25 found one active bootstrapped first-party admin, zero active first-party admin sessions, one legacy Supabase Auth user, and zero legacy Supabase Auth sessions in the currently configured environment.
- Runtime smoke checks returned HTTP 200 for the homepage, checkout, delivery information, and admin login against the running development server.
- Runtime smoke checks returned HTTP 200 for the homepage, shop, checkout, and delivery information with no Nigerian locale/currency copy in their rendered HTML; unauthenticated admin access correctly redirected to login.

CI command ownership:

- Regression: `npm run test:regression` (domain, validation, and library tests).
- Functional: `npm run test:functional` (route-handler behavior).
- Structural: `npm run test:structural` (Next.js route type generation, strict TypeScript, and production build).
- Full local gate: `npm run check`.

## TODO — immediate

- [x] Review and format the transactional-email route changes.
- [x] Add unit tests for HTML escaping, provider failure, and missing email configuration.
- [x] Add functional tests for order creation, cake requests, contact submission, and newsletter subscription.
- [x] Apply `db/migrations/0004_admin_otp_sessions.sql` to the project's Supabase database and verify RLS plus role revocations.
- [x] Apply `db/migrations/0005_inventory_integrity.sql` and verify reservation, concurrency, deduction, restoration, RLS, triggers, and role restrictions.
- [ ] Configure a unique 32+ character `ADMIN_AUTH_SECRET` in each environment; never expose it through a `NEXT_PUBLIC_` variable.
- [ ] Configure `SMTP_USER`, a Gmail app password or OAuth2 credentials, `SMTP_FROM_EMAIL`, and `SMTP_FROM_NAME` in each environment.
- [ ] Run `npm run admin:bootstrap` in each intended environment after its variables and migration are ready.
- [ ] Globally revoke existing Supabase Auth admin sessions and correct the Supabase Auth Site URL to an absolute `https://...` URL until every old deployment is retired.
- [ ] Configure GitHub/Vercel deployment values, then set repository variable `VERCEL_CD_ENABLED=true`.
- [ ] Subscribe each Stripe webhook endpoint to `refund.created`, `refund.updated`, and `refund.failed` in addition to the Checkout Session events before enabling live refunds.
- [ ] Add branch protection for `main` and `develop`, requiring all four CI jobs.
- [x] Apply `db/migrations/0003_product_media.sql` to the currently configured Supabase environment before deploying G02 image management.
- [x] Commit and push the preserved email/SEO work plus the pipeline after review.

## Ordered implementation gap register

Complete these checkpoints in order unless a newly discovered dependency requires reordering. A checkbox is complete only when the relevant `implementation.md` acceptance criteria are met, not merely when a page or database table exists.

- [x] **G01 · Phase 1 — Foundation quality:** add linting and incremental formatting enforcement to local scripts and CI.
- [x] **G02 · Phase 5 — Product management:** complete product editing, duplication, variants, image management, visibility, and featured controls.
- [x] **G03 · Phase 6 — Inventory integrity:** add transactional stock reservation/deduction/restoration and concurrent overselling protection.
- [x] **G04 · Phase 13 — Cake configuration:** move cake options and lead-time rules to admin-controlled data.
- [x] **G05 · Phase 13 — Cake uploads:** securely store and validate cake inspiration images.
- [x] **G06 · Phases 14–16 — Delivery and coupons:** complete minimum-order rules, coupon administration, and per-customer usage limits.
- [x] **G07 · Phase 17 — Stripe:** create server-owned payments, verified idempotent webhooks, and safe retry/failure flows.
- [x] **G08 · Phases 18–20 — Order lifecycle:** complete admin order operations, refunds, status notifications, and immutable lifecycle handling.
- [x] **G09 · Phase 21 — Reviews:** replace placeholder reviews with persisted submission, moderation, and approved public display.
- [x] **G10 · Phases 22–23 — Content and settings:** make saved admin content and centralized business settings drive the storefront.
- [x] **G11 · Phase 24 — Audit logging:** record sensitive admin changes with before/after values and actor identity.
- [ ] **G12 · Phase 25 — SEO:** add Twitter metadata and Product, Organization, and Breadcrumb structured data.
- [ ] **G13 · Phase 26 — Analytics and monitoring:** add privacy-conscious commerce events, error monitoring, and structured operational logs.
- [ ] **G14 · Phases 27–28 — Performance and accessibility:** measure targets, fix material issues, and automate critical accessibility checks.
- [ ] **G15 · Phases 29–30 — Security and test depth:** add durable public-endpoint abuse protection, database integration tests, browser E2E, and concurrency/payment edge cases.
- [ ] **G16 · Phase 31 — Staging:** configure and validate isolated staging services and full customer/admin journeys.
- [ ] **G17 · Phase 32 — Production content:** replace fallback products, placeholder images, contact details, policies, and delivery data.
- [ ] **G18 · Phase 33 — Production launch:** complete the launch, rollback, backup, domain, SSL, monitoring, and final QA checklist.

## TODO — commerce-critical

- [x] Implement Stripe Checkout/payment intent creation.
- [x] Implement and verify signed Stripe webhooks.
- [x] Make payment/order processing idempotent.
- [x] Deduct and restore inventory transactionally after payment/refund events.
- [x] Prevent overselling under concurrent checkouts.
- [x] Add customer-facing payment failure and retry states.
- [x] Complete admin order status transitions and customer status notifications.
- [x] Add image upload/storage for products and cake references.

## TODO — test coverage

- [ ] Add integration tests against an isolated Supabase test project or local database.
- [ ] Add browser E2E coverage for homepage, catalogue, product, cart, checkout, cake builder, and order tracking.
- [ ] Add browser E2E coverage for admin login, products, inventory, coupons, and order processing.
- [x] Add Stripe webhook, duplicate event, delayed event, and failed-payment tests.
- [x] Add coupon expiry, usage-limit, minimum-order, eligibility, per-customer, and out-of-stock race-condition tests.
- [ ] Add accessibility checks for critical customer and admin journeys.
- [x] Add an incremental lint/format policy and CI check for every changed file.
- [x] Resolve the pre-existing full-repository Biome lint backlog (82 errors and 141 warnings).
- [ ] Normalize untouched legacy formatting incrementally when those files enter an implementation checkpoint.

## TODO — production readiness

- [ ] Create and validate separate development, staging, and production Supabase/Stripe/SMTP environments.
- [ ] Enter owner-approved business contact details, catalogue records, imagery, policy dates, and final editorial copy through admin before launch; runtime fallbacks have been removed.
- [ ] Confirm the owner-approved province, timezone, delivery areas, tax registration/rates, and CAD catalogue prices in admin before accepting live orders; migration defaults intentionally do not invent these business facts.
- [ ] Add analytics, error monitoring, and structured logs.
- [ ] Review rate limiting for a multi-instance production deployment.
- [ ] Add durable abuse protection for public contact, newsletter, cake-request, and order endpoints.
- [ ] Complete security, privacy, accessibility, and performance audits.
- [ ] Run database migrations and seed only the intended environment.
- [ ] Perform the full customer and admin regression checklist from `implementation.md`.
- [ ] Document rollback, backup, and incident-response procedures.

## CI/CD setup notes

CI runs automatically for pushes and pull requests targeting `develop` or `main`.

Deployment is intentionally disabled until the repository is connected to the correct Vercel project. Add these GitHub Actions settings:

- Repository variable `VERCEL_CD_ENABLED`: set to `true` to enable deployments.
- Repository variable `VERCEL_ORG_ID`: the Vercel team/account ID.
- Repository variable `VERCEL_PROJECT_ID`: the Vercel project ID.
- Repository secret `VERCEL_TOKEN`: a token with access to that project.

`develop` deploys to the GitHub `staging` environment. `main` deploys to the `production` environment. Both deployment jobs require all regression, functional, and structural checks to pass first.

## Checkpoint protocol

For each meaningful work session, update:

1. The “Last updated” date and current checkpoint.
2. Completed checkboxes and newly discovered TODOs.
3. Tests run and their result.
4. Database/environment changes.
5. Known limitations and the next recommended task.
